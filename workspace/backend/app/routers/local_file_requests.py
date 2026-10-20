# -*- coding: utf-8 -*-
"""Typed cross-device local-file request workflow.

The generic node-command API deliberately cannot create these commands. Only
this router may enqueue the versioned inspect/release protocol after binding
both agent identities to their paired devices.
"""

import base64
import binascii
import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath, PureWindowsPath
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import resolve_machine_token
from app.database import get_db
from app.models import ApprovalRequest, FileRecord, LocalFileRequest, Node, NodeCommand, WorkspaceMember
from app.response import ResponseCode, json_response, success_response
from app.services import approvals as approval_service
from app.storage import get_file_store

router = APIRouter(prefix="/v1/local-file-requests", tags=["Local file requests"])
PROTOCOL_CAPABILITY = "local_file_request.v1"
REQUEST_TTL = timedelta(minutes=15)

_SECRET_PATTERNS = (
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key|authorization|bearer)\s*[:=]?\s*\S+"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{16,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
)


class CreateLocalFileRequest(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=200)
    network: str
    recipient_agent_id: str = Field(min_length=1, max_length=200)
    root_id: str = Field(min_length=1, max_length=100)
    relative_path: str = Field(min_length=1, max_length=2000)
    request_content: str = Field(min_length=1, max_length=4000)
    channel: str = Field(min_length=1, max_length=500)


class SensitivityReason(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=300)


class InspectionResult(BaseModel):
    classification: str
    sensitivity_reasons: list[SensitivityReason] = []
    sha256: str
    size: int = Field(ge=0, le=50 * 1024 * 1024)
    filename: str = Field(min_length=1, max_length=500)
    content_type: str = Field(min_length=1, max_length=200)


class FileContentUpload(BaseModel):
    content_base64: str
    sha256: str
    size: int = Field(ge=0, le=50 * 1024 * 1024)
    filename: str = Field(min_length=1, max_length=500)
    content_type: str = Field(min_length=1, max_length=200)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def redact_request_content(value: str) -> str:
    redacted = value.strip()
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def _valid_identifier(value: str) -> bool:
    return bool(value and value.strip() == value and not any(ch.isspace() for ch in value))


def _valid_relative_path(value: str) -> bool:
    if not value or "\x00" in value or any(ord(ch) < 32 for ch in value):
        return False
    posix = PurePosixPath(value)
    windows = PureWindowsPath(value)
    if posix.is_absolute() or windows.is_absolute() or windows.drive or windows.root:
        return False
    parts = value.replace("\\", "/").split("/")
    return all(part not in ("", ".", "..") for part in parts)


def serialize_request(row: LocalFileRequest) -> dict:
    return {
        "id": row.id,
        "requester_agent_id": row.requester_agent_id,
        "requester_device_id": str(row.requester_device_id),
        "requester_device_name": row.requester_device_name,
        "recipient_agent_id": row.recipient_agent_id,
        "recipient_device_id": str(row.recipient_device_id),
        "recipient_device_name": row.recipient_device_name,
        "channel_name": row.channel_name,
        "root_id": row.root_id,
        "relative_path": row.relative_path,
        "request_content_redacted": row.request_content_redacted,
        "status": row.status,
        "sensitivity_reasons": row.sensitivity_reasons or [],
        "sensitivity_stage": row.sensitivity_stage,
        "content_sha256": row.content_sha256,
        "content_size": row.content_size,
        "content_type": row.content_type,
        "filename": row.filename,
        "approval_id": row.approval_id,
        "file_id": row.file_id,
        "error_code": row.error_code,
        "error_message": row.error_message,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _active_request(db: Session, request_id: str):
    return db.execute(
        select(LocalFileRequest).where(LocalFileRequest.id == request_id).with_for_update()
    ).scalar_one_or_none()


def _recipient_device(db: Session, row: LocalFileRequest, token: Optional[str]):
    workspace, node = resolve_machine_token(db, token or "")
    if workspace is None or node is None:
        return None, None
    if str(workspace.id) != str(row.workspace_id) or str(node.id) != str(row.recipient_device_id):
        return workspace, None
    return workspace, node


def _approval_snapshot(row: LocalFileRequest, classification: str) -> dict:
    return {
        "request_id": row.id,
        "requester_agent_id": row.requester_agent_id,
        "requester_device_id": str(row.requester_device_id),
        "requester_device_name": row.requester_device_name,
        "recipient_agent_id": row.recipient_agent_id,
        "recipient_device_id": str(row.recipient_device_id),
        "recipient_device_name": row.recipient_device_name,
        "request_content_redacted": row.request_content_redacted,
        "root_id": row.root_id,
        "relative_path": row.relative_path,
        "classification": classification,
        "filename": row.filename,
        "content_type": row.content_type,
        "size": row.content_size,
        "sha256": row.content_sha256,
        "sensitivity_reasons": row.sensitivity_reasons or [],
        "policy_version": 1,
        "expires_at": row.expires_at.isoformat(),
    }


def _queue_release(
    db: Session,
    row: LocalFileRequest,
    *,
    authorization: str,
    approval_id: Optional[str],
    created_by: Optional[str],
) -> None:
    command = NodeCommand(
        node_id=row.recipient_device_id,
        workspace_id=row.workspace_id,
        action="local_file_release",
        command={
            "protocolVersion": 1,
            "requestId": row.id,
            "recipientAgentId": row.recipient_agent_id,
            "rootId": row.root_id,
            "relativePath": row.relative_path,
            "authorization": authorization,
            "approvalId": approval_id,
            "approvedContentSha256": row.content_sha256,
            "expiresAt": row.expires_at.isoformat(),
        },
        created_by=created_by,
    )
    db.add(command)
    db.flush()
    row.current_command_id = command.id
    row.status = "queued_release"


@router.post("")
def create_local_file_request(
    body: CreateLocalFileRequest,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    x_agent_name: Optional[str] = Header(None),
):
    workspace, requester_node = resolve_machine_token(db, x_workspace_token or "")
    if workspace is None:
        return json_response(ResponseCode.UNAUTHORIZED, "Invalid device credential")
    if requester_node is None:
        return json_response(ResponseCode.FORBIDDEN, "A per-device token is required")
    if str(workspace.id) not in (body.network,):
        # Accept the slug as well without allowing a credential from another workspace.
        if workspace.slug != body.network:
            return json_response(ResponseCode.FORBIDDEN, "Device credential belongs to a different workspace")

    requester_agent = (x_agent_name or "").strip()
    if not requester_agent:
        return json_response(ResponseCode.BAD_REQUEST, "X-Agent-Name is required")
    requester_member = db.get(WorkspaceMember, (str(workspace.id), requester_agent))
    if requester_member is None or str(requester_member.node_id or "") != str(requester_node.id):
        return json_response(ResponseCode.FORBIDDEN, "Requester agent is not bound to this device")

    idempotency_key = body.idempotency_key.strip()
    recipient_agent = body.recipient_agent_id.strip()
    root_id = body.root_id.strip()
    relative_path = body.relative_path.strip()
    channel_name = body.channel.strip()
    request_content_redacted = redact_request_content(body.request_content)
    if not _valid_identifier(idempotency_key):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid idempotency_key")
    if not _valid_identifier(recipient_agent):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid recipient_agent_id")
    if not _valid_identifier(root_id):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid root_id")
    if not _valid_relative_path(relative_path):
        return json_response(ResponseCode.BAD_REQUEST, "relative_path must remain beneath the named root")
    if not channel_name:
        return json_response(ResponseCode.BAD_REQUEST, "Invalid channel")

    existing = db.execute(select(LocalFileRequest).where(
        LocalFileRequest.workspace_id == workspace.id,
        LocalFileRequest.requester_agent_id == requester_agent,
        LocalFileRequest.requester_device_id == requester_node.id,
        LocalFileRequest.idempotency_key == idempotency_key,
    )).scalar_one_or_none()
    if existing is not None:
        same_request = (
            existing.recipient_agent_id == recipient_agent
            and existing.channel_name == channel_name
            and existing.root_id == root_id
            and existing.relative_path == relative_path
            and existing.request_content_redacted == request_content_redacted
        )
        if not same_request:
            return json_response(ResponseCode.CONFLICT, "Idempotency key is already bound to another request")
        return success_response(serialize_request(existing))

    recipient_member = db.get(WorkspaceMember, (str(workspace.id), recipient_agent))
    if recipient_member is None:
        return json_response(ResponseCode.NOT_FOUND, "Recipient agent not found")
    if not recipient_member.node_id:
        return json_response(ResponseCode.CONFLICT, "Recipient agent is not bound to a device")
    recipient_node = db.get(Node, recipient_member.node_id)
    if recipient_node is None:
        return json_response(ResponseCode.NOT_FOUND, "Recipient device not found")
    if PROTOCOL_CAPABILITY not in (recipient_node.capabilities or []):
        return json_response(ResponseCode.CONFLICT, "Recipient device does not support local-file requests")

    now = _now()
    row = LocalFileRequest(
        workspace_id=workspace.id,
        idempotency_key=idempotency_key,
        requester_agent_id=requester_agent,
        requester_device_id=requester_node.id,
        requester_device_name=requester_node.name or requester_node.hostname or str(requester_node.id),
        recipient_agent_id=recipient_agent,
        recipient_device_id=recipient_node.id,
        recipient_device_name=recipient_node.name or recipient_node.hostname or str(recipient_node.id),
        channel_name=channel_name,
        root_id=root_id,
        relative_path=relative_path,
        request_content_redacted=request_content_redacted,
        status="queued_inspection",
        expires_at=now + REQUEST_TTL,
    )
    db.add(row)
    db.flush()
    command = NodeCommand(
        node_id=recipient_node.id,
        workspace_id=workspace.id,
        action="local_file_inspect",
        command={
            "protocolVersion": 1,
            "requestId": row.id,
            "recipientAgentId": recipient_agent,
            "rootId": root_id,
            "relativePath": relative_path,
            "expiresAt": row.expires_at.isoformat(),
        },
        created_by=f"openagents:{requester_agent}",
    )
    db.add(command)
    db.flush()
    row.current_command_id = command.id
    db.commit()
    return success_response(serialize_request(row))


@router.post("/{request_id}/inspection")
def submit_local_file_inspection(
    request_id: str,
    body: InspectionResult,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
):
    row = _active_request(db, request_id)
    if row is None:
        return json_response(ResponseCode.NOT_FOUND, "Local-file request not found")
    workspace, node = _recipient_device(db, row, x_workspace_token)
    if workspace is None:
        return json_response(ResponseCode.UNAUTHORIZED, "Invalid device credential")
    if node is None:
        return json_response(ResponseCode.FORBIDDEN, "Only the recipient device may inspect this request")
    if row.status not in ("queued_inspection", "inspecting"):
        return json_response(ResponseCode.CONFLICT, f"Request is already {row.status}")
    if _now() >= row.expires_at.replace(tzinfo=row.expires_at.tzinfo or timezone.utc):
        row.status = "expired"
        db.commit()
        return json_response(ResponseCode.GONE, "Local-file request expired")
    classification = body.classification.strip().lower()
    if classification not in ("safe", "sensitive", "uncertain", "prohibited"):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid classification")
    if not re.fullmatch(r"[0-9a-f]{64}", body.sha256.lower()):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid sha256")
    reasons = [reason.model_dump() for reason in body.sensitivity_reasons]
    if classification in ("sensitive", "uncertain", "prohibited") and not reasons:
        return json_response(ResponseCode.BAD_REQUEST, "Sensitive classifications require reasons")

    row.content_sha256 = body.sha256.lower()
    row.content_size = body.size
    row.filename = body.filename
    row.content_type = body.content_type
    row.sensitivity_reasons = reasons
    row.sensitivity_stage = "content" if reasons else None
    command = db.get(NodeCommand, row.current_command_id) if row.current_command_id else None
    if command is not None:
        command.status = "done"
        command.result = {"ok": True, "message": "inspection complete", "data": {"classification": classification}}
        command.command = {"requestId": row.id}
        command.finished_at = _now()

    if classification == "prohibited":
        row.status = "prohibited"
        row.error_code = "prohibited_file"
        row.error_message = "The recipient device classified this file as prohibited"
    elif classification == "safe":
        _queue_release(
            db,
            row,
            authorization="automatic_safe",
            approval_id=None,
            created_by=f"openagents:{row.requester_agent_id}",
        )
    else:
        owner_email = (node.owner_email or "").strip().lower()
        if not owner_email:
            row.status = "failed"
            row.error_code = "recipient_owner_missing"
            row.error_message = "Recipient device has no human owner"
        else:
            approval = approval_service.create_request(
                db,
                workspace,
                channel_name=row.channel_name,
                agent=row.requester_agent_id,
                kind="local_file_access",
                action=f"Transfer {row.filename} from {row.recipient_device_name}",
                details=(
                    f"Requester Agent: {row.requester_agent_id}\n"
                    f"Requester device: {row.requester_device_name} ({row.requester_device_id})\n"
                    f"Recipient Agent: {row.recipient_agent_id}\n"
                    f"Recipient device: {row.recipient_device_name} ({row.recipient_device_id})\n"
                    f"Request: {row.request_content_redacted}\n"
                    f"Path: {row.root_id}/{row.relative_path}"
                ),
                risk="high",
                assignee_email=owner_email,
                expires_at=row.expires_at,
                force_pending=True,
                policy_requirements_extra={"local_file_request": _approval_snapshot(row, classification)},
            )
            row.approval_id = approval.id
            row.status = "awaiting_approval"
    db.commit()
    return success_response(serialize_request(row))


@router.post("/{request_id}/content")
def upload_local_file_content(
    request_id: str,
    body: FileContentUpload,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
):
    row = _active_request(db, request_id)
    if row is None:
        return json_response(ResponseCode.NOT_FOUND, "Local-file request not found")
    workspace, node = _recipient_device(db, row, x_workspace_token)
    if workspace is None:
        return json_response(ResponseCode.UNAUTHORIZED, "Invalid device credential")
    if node is None:
        return json_response(ResponseCode.FORBIDDEN, "Only the recipient device may upload this file")
    if row.status == "completed" and row.file_id:
        return success_response(serialize_request(row))
    if row.status not in ("awaiting_upload", "queued_release", "releasing", "uploading"):
        return json_response(ResponseCode.CONFLICT, f"Request is not approved for upload ({row.status})")
    if _now() >= row.expires_at.replace(tzinfo=row.expires_at.tzinfo or timezone.utc):
        row.status = "expired"
        db.commit()
        return json_response(ResponseCode.GONE, "Local-file request expired")
    try:
        content = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        return json_response(ResponseCode.BAD_REQUEST, "Invalid base64 content")
    digest = hashlib.sha256(content).hexdigest()
    if body.size != len(content) or body.size != row.content_size:
        return json_response(ResponseCode.BAD_REQUEST, "File size does not match inspected manifest")
    if body.sha256.lower() != digest or digest != row.content_sha256:
        return json_response(ResponseCode.BAD_REQUEST, "File hash does not match inspected manifest")
    if body.filename != row.filename or body.content_type != row.content_type:
        return json_response(ResponseCode.BAD_REQUEST, "File metadata does not match inspected manifest")

    row.status = "uploading"
    file_id = str(uuid.uuid4())
    try:
        storage_key = get_file_store().save(str(workspace.id), file_id, body.filename, content)
    except ValueError as exc:
        row.status = "failed"
        row.error_code = "storage_rejected"
        row.error_message = str(exc)
        db.commit()
        return json_response(ResponseCode.BAD_REQUEST, "File storage rejected the upload")
    record = FileRecord(
        id=file_id,
        workspace_id=workspace.id,
        filename=body.filename,
        content_type=body.content_type,
        size=len(content),
        storage_key=storage_key,
        uploaded_by=f"openagents:{row.recipient_agent_id}",
        channel_name=row.channel_name,
        owner=f"openagents:{row.requester_agent_id}",
        visibility="private",
    )
    db.add(record)
    row.file_id = file_id
    row.status = "completed"
    command = db.get(NodeCommand, row.current_command_id) if row.current_command_id else None
    if command is not None and command.action == "local_file_release":
        command.status = "done"
        command.result = {"ok": True, "message": "file uploaded", "data": {"requestId": row.id, "fileId": file_id}}
        command.command = {"requestId": row.id}
        command.finished_at = _now()
    db.commit()
    return success_response(serialize_request(row))


def resolve_local_file_approval(db: Session, approval: ApprovalRequest) -> None:
    """Apply an owner decision and enqueue a hash-bound release command."""
    row = db.execute(
        select(LocalFileRequest).where(LocalFileRequest.approval_id == approval.id).with_for_update()
    ).scalar_one_or_none()
    if row is None or row.status != "awaiting_approval":
        return
    if approval.status == approval_service.STATUS_EXPIRED:
        row.status = "expired"
        return
    if approval.status == approval_service.STATUS_REJECTED:
        row.status = "rejected"
        return
    if approval.status != approval_service.STATUS_APPROVED:
        return
    _queue_release(
        db,
        row,
        authorization="human_approval",
        approval_id=approval.id,
        created_by=approval.resolved_by,
    )


@router.get("/{request_id}")
def get_local_file_request(
    request_id: str,
    network: str = Query(...),
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    x_agent_name: Optional[str] = Header(None),
):
    workspace, node = resolve_machine_token(db, x_workspace_token or "")
    if workspace is None or str(workspace.id) != network:
        return json_response(ResponseCode.UNAUTHORIZED, "Invalid device credential")
    row = db.get(LocalFileRequest, request_id)
    if row is None or str(row.workspace_id) != str(workspace.id):
        return json_response(ResponseCode.NOT_FOUND, "Local-file request not found")
    agent = (x_agent_name or "").strip()
    if not agent or agent not in (row.requester_agent_id, row.recipient_agent_id):
        return json_response(ResponseCode.FORBIDDEN, "This agent is not part of the file request")
    member = db.get(WorkspaceMember, (str(workspace.id), agent))
    if node is None or member is None or str(member.node_id or "") != str(node.id):
        return json_response(ResponseCode.FORBIDDEN, "Agent identity does not match this device")
    return success_response(serialize_request(row))
