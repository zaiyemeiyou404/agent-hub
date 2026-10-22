# -*- coding: utf-8 -*-
"""Controller identity HTTP API.

Phone and desktop controllers enroll here. Connector pairing stays on
/v1/nodes/redeem. Credentials in the query string or fragment are rejected.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Workspace
from app.response import ResponseCode, json_response, success_response
from app.routers.network import _resolve_workspace
from sqlalchemy import select

from app.services.controller_identity import (
    authorize,
    bind_agent,
    consume_stream_ticket,
    contract,
    describe_principal,
    enroll_controller,
    issue_stream_ticket,
    list_devices,
    logout_controller,
    refresh_controller,
    revoke_device,
)
from app.services.credential_redaction import credential_in_url

router = APIRouter(prefix="/v1/identity", tags=["Identity"])


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EnrollRequest(_Strict):
    workspace_id: str = Field(..., min_length=1, max_length=80)
    device_key: str = Field(..., min_length=8, max_length=200)
    kind: str = Field(..., min_length=1, max_length=32)
    platform: str = Field(..., min_length=1, max_length=32)
    display_name: Optional[str] = Field(None, max_length=120)
    mode: str = Field(..., min_length=1, max_length=32)
    standalone_label: Optional[str] = Field(None, max_length=120)


class RefreshRequest(_Strict):
    refresh_token: str = Field(..., min_length=1, max_length=500)


class AuthorizeRequest(_Strict):
    workspace_id: str = Field(..., min_length=1, max_length=80)
    action: str = Field(..., min_length=1, max_length=80)
    device_id: Optional[str] = Field(None, max_length=80)
    node_id: Optional[str] = Field(None, max_length=80)
    agent_name: Optional[str] = Field(None, max_length=200)


class BindRequest(_Strict):
    workspace_id: str = Field(..., min_length=1, max_length=80)
    agent_name: str = Field(..., min_length=1, max_length=200)
    node_id: str = Field(..., min_length=1, max_length=80)


class ListRequest(_Strict):
    workspace_id: str = Field(..., min_length=1, max_length=80)


def _blocked(request: Request):
    if credential_in_url(str(request.url)):
        return json_response(ResponseCode.BAD_REQUEST, "credentials_in_url", data={
            "allowed": False,
            "reason": "credentials_in_url",
            "principal": None,
        })
    return None


def _from_decision(decision):
    if decision.allowed:
        return success_response(decision.as_data())
    code = {
        400: ResponseCode.BAD_REQUEST,
        401: ResponseCode.UNAUTHORIZED,
        403: ResponseCode.FORBIDDEN,
        404: ResponseCode.NOT_FOUND,
        409: ResponseCode.CONFLICT,
    }.get(decision.http_status, ResponseCode.BAD_REQUEST)
    return json_response(code, decision.reason, data=decision.as_data(), status_code=decision.http_status)


@router.get("/contract")
def identity_contract():
    return success_response(contract())


@router.post("/controllers/enroll")
def enroll(
    body: EnrollRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    if body.mode == "standalone":
        # Do not consult a human IdP. The workspace token is the only bootstrap.
        authorization = None
    return _from_decision(enroll_controller(
        db,
        workspace_id=body.workspace_id,
        device_key=body.device_key,
        kind=body.kind,
        platform=body.platform,
        display_name=body.display_name,
        mode=body.mode,
        standalone_label=body.standalone_label,
        workspace_token=x_workspace_token,
        authorization=authorization,
    ))


@router.post("/controllers/refresh")
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(refresh_controller(db, body.refresh_token))


@router.post("/controllers/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(logout_controller(db, authorization))


@router.post("/controllers/{device_id}/revoke")
def revoke(
    device_id: str,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(revoke_device(
        db, device_id=device_id, authorization=authorization, workspace_token=x_workspace_token,
    ))


@router.post("/controllers/list")
def controllers(
    body: ListRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(list_devices(
        db, workspace_id=body.workspace_id, authorization=authorization, workspace_token=x_workspace_token,
    ))


@router.post("/authorize")
def authorize_action(
    body: AuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    x_identity_request_expires: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(authorize(
        db,
        workspace_id=body.workspace_id,
        action=body.action,
        authorization=authorization,
        workspace_token=x_workspace_token,
        device_id=body.device_id,
        node_id=body.node_id,
        agent_name=body.agent_name,
        request_expires=x_identity_request_expires,
    ))


@router.get("/principal")
def principal(
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(describe_principal(db, authorization, x_workspace_token))


@router.post("/bindings")
def bindings(
    body: BindRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(bind_agent(
        db,
        workspace_id=body.workspace_id,
        agent_name=body.agent_name,
        node_id=body.node_id,
        authorization=authorization,
        workspace_token=x_workspace_token,
    ))


@router.post("/stream-ticket")
def stream_ticket(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    blocked = _blocked(request)
    if blocked is not None:
        return blocked
    return _from_decision(issue_stream_ticket(db, authorization))


def open_stream_with_ticket(db: Session, ticket: str, network: str):
    """Resolve a single-use stream ticket. Commits ticket use on success or replay."""
    workspace = _resolve_workspace(db, network)
    if workspace is None:
        workspace = db.execute(select(Workspace).where(Workspace.id == network)).scalar_one_or_none()
    if workspace is None or workspace.status == "deleted":
        from app.services.controller_identity import _deny
        return _deny("not_found", 404)
    return consume_stream_ticket(db, ticket, workspace)
