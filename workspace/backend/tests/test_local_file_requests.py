# -*- coding: utf-8 -*-
"""Secure cross-device local-file request protocol."""

import base64
import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import ApprovalPolicy, ApprovalRequest, FileRecord, LocalFileRequest, Node, NodeCommand
from app.routers.local_file_requests import base64_exceeds_quota
from tests.test_visibility import people, no_push


@pytest.fixture(autouse=True)
def identities(people):
    pass


def _connect(client, workspace, key, name):
    code = client.post(
        f"/v1/workspaces/{workspace['id']}/pairing-codes",
        headers={"Authorization": "Bearer mia"},
        json={},
    ).json()["data"]["code"]
    response = client.post("/v1/nodes/redeem", json={
        "code": code,
        "node_key": key,
        "name": name,
        "hostname": f"{key}.local",
        "device_type": "server" if "server" in key else "laptop",
        "os": "linux",
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _join(client, workspace, connection, agent):
    response = client.post("/v1/join", json={
        "agent_name": agent,
        "token": connection["token"],
        "network": workspace["id"],
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _heartbeat(client, connection, agents, capabilities=None):
    response = client.post(
        "/v1/nodes/heartbeat",
        headers={"X-Workspace-Token": connection["token"]},
        json={
            "node_id": connection["nodeId"],
            "capabilities": capabilities or ["local_file_request.v1"],
            "agents": [{"name": name, "type": "hermes", "status": "running"} for name in agents],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _setup_agents(client, workspace):
    requester = _connect(client, workspace, "server-device", "Build Server")
    recipient = _connect(client, workspace, "laptop-device", "Alice Laptop")
    _join(client, workspace, requester, "server-agent")
    _join(client, workspace, recipient, "laptop-agent")
    _heartbeat(client, requester, ["server-agent"])
    _heartbeat(client, recipient, ["laptop-agent"])
    return requester, recipient


def _request(client, workspace, requester, **overrides):
    body = {
        "idempotency_key": "transfer-request-1",
        "network": workspace["id"],
        "recipient_agent_id": "laptop-agent",
        "root_id": "projects",
        "relative_path": "deploy/config.txt",
        "request_content": "Need deployment config for review",
        "channel": workspace["channel"]["name"],
    }
    body.update(overrides)
    return client.post(
        "/v1/local-file-requests",
        headers={
            "X-Workspace-Token": requester["token"],
            "X-Agent-Name": "server-agent",
        },
        json=body,
    )


class TestCreateLocalFileRequest:
    def test_requires_explicit_recipient_agent_id(self, client, workspace):
        requester, _ = _setup_agents(client, workspace)
        response = _request(client, workspace, requester, recipient_agent_id=None)
        assert response.status_code == 422

    def test_shared_workspace_token_cannot_request_local_file(self, client, workspace):
        _setup_agents(client, workspace)
        response = client.post(
            "/v1/local-file-requests",
            headers={
                "X-Workspace-Token": workspace["token"],
                "X-Agent-Name": "server-agent",
            },
            json={
                "idempotency_key": "shared-token-request",
                "network": workspace["id"],
                "recipient_agent_id": "laptop-agent",
                "root_id": "projects",
                "relative_path": "deploy/config.txt",
                "request_content": "Need deployment config",
                "channel": workspace["channel"]["name"],
            },
        )
        assert response.status_code == 403

    def test_snapshots_requester_and_recipient_and_queues_internal_inspection(self, client, workspace, db):
        requester, recipient = _setup_agents(client, workspace)
        response = _request(client, workspace, requester)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["requester_agent_id"] == "server-agent"
        assert data["requester_device_id"] == requester["nodeId"]
        assert data["requester_device_name"] == "Build Server"
        assert data["recipient_agent_id"] == "laptop-agent"
        assert data["recipient_device_id"] == recipient["nodeId"]
        assert data["recipient_device_name"] == "Alice Laptop"
        assert data["request_content_redacted"] == "Need deployment config for review"
        assert data["status"] == "queued_inspection"

        stored = db.get(LocalFileRequest, data["id"])
        assert stored is not None
        command = db.query(NodeCommand).filter_by(id=stored.current_command_id).one()
        assert command.action == "local_file_inspect"
        assert command.node_id == recipient["nodeId"]
        assert command.command["recipientAgentId"] == "laptop-agent"
        assert command.command["rootId"] == "projects"
        assert command.command["relativePath"] == "deploy/config.txt"

    def test_public_generic_command_api_cannot_enqueue_file_actions(self, client, workspace):
        _, recipient = _setup_agents(client, workspace)
        response = client.post(
            f"/v1/nodes/{recipient['nodeId']}/commands",
            headers={"X-Workspace-Token": recipient["token"]},
            json={"action": "local_file_inspect", "args": {"name": "laptop-agent"}},
        )
        assert response.status_code == 400

    def test_create_is_idempotent_for_requester_key(self, client, workspace):
        requester, _ = _setup_agents(client, workspace)
        first = _request(client, workspace, requester)
        second = _request(client, workspace, requester)
        assert first.status_code == second.status_code == 200
        assert first.json()["data"]["id"] == second.json()["data"]["id"]
        assert second.json()["data"]["status"] == "queued_inspection"

    def test_request_purpose_redacts_common_bare_credential_formats(self, client, workspace):
        requester, _ = _setup_agents(client, workspace)
        secrets = [
            "sk-abcdefghijklmnopqrstuvwxyz123456",
            "ghp_abcdefghijklmnopqrstuvwxyz123456",
            "AKIAABCDEFGHIJKLMNOP",
            "xox" + "b-123456789012-123456789012-abcdefghijklmnopqrstuvwx",
        ]
        response = _request(
            client,
            workspace,
            requester,
            idempotency_key="redacted-purpose",
            request_content="Please send " + " ".join(secrets),
        )
        assert response.status_code == 200
        redacted = response.json()["data"]["request_content_redacted"]
        assert "[REDACTED]" in redacted
        assert all(secret not in redacted for secret in secrets)

    def test_connector_failure_moves_request_to_failed_without_file_content(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        stored = db.get(LocalFileRequest, request["id"])
        response = client.post(
            f"/v1/nodes/commands/{stored.current_command_id}/result",
            headers={"X-Workspace-Token": recipient["token"]},
            json={"ok": False, "message": "Requested path is outside the authorized root", "data": None},
        )
        assert response.status_code == 200, response.text
        db.expire_all()
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.status == "failed"
        assert stored.error_code == "connector_rejected"
        assert stored.error_message == "Recipient device rejected the local-file request"


def _created_request(client, workspace, idempotency_key="transfer-request-1"):
    requester, recipient = _setup_agents(client, workspace)
    response = _request(client, workspace, requester, idempotency_key=idempotency_key)
    assert response.status_code == 200, response.text
    return requester, recipient, response.json()["data"]


def _inspection(client, recipient, request_id, **overrides):
    body = {
        "classification": "sensitive",
        "sensitivity_reasons": [
            {"code": "credential_assignment", "description": "Credential assignment detected"}
        ],
        "sha256": "a" * 64,
        "size": 42,
        "filename": "config.txt",
        "content_type": "text/plain",
    }
    body.update(overrides)
    return client.post(
        f"/v1/local-file-requests/{request_id}/inspection",
        headers={"X-Workspace-Token": recipient["token"]},
        json=body,
    )


class TestLocalFileInspectionAndApproval:
    def test_wrong_device_cannot_submit_inspection(self, client, workspace):
        requester, recipient, request = _created_request(client, workspace)
        response = _inspection(client, requester, request["id"])
        assert response.status_code == 403

    def test_safe_file_skips_approval_and_queues_hash_bound_release(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        response = _inspection(
            client,
            recipient,
            request["id"],
            classification="safe",
            sensitivity_reasons=[],
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == "queued_release"
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.approval_id is None
        command = db.get(NodeCommand, stored.current_command_id)
        assert command.action == "local_file_release"
        assert command.command["authorization"] == "automatic_safe"
        assert command.command["approvedContentSha256"] == "a" * 64

    def test_sensitive_file_forces_pending_owner_approval_with_full_identity_snapshot(self, client, workspace, db):
        # Even an explicit allow policy must not auto-approve sensitive egress.
        db.add(ApprovalPolicy(
            workspace_id=workspace["id"],
            channel_name="*",
            rules=[{"kind": "local_file_access", "policy": "allow"}],
        ))
        db.commit()
        requester, recipient, request = _created_request(client, workspace)
        response = _inspection(client, recipient, request["id"])
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["status"] == "awaiting_approval"
        approval = db.get(ApprovalRequest, data["approval_id"])
        assert approval.status == "pending"
        assert approval.assignee_email == "mia@acme.test"
        snapshot = approval.policy_requirements["local_file_request"]
        assert snapshot["requester_agent_id"] == "server-agent"
        assert snapshot["requester_device_id"] == requester["nodeId"]
        assert snapshot["requester_device_name"] == "Build Server"
        assert snapshot["recipient_agent_id"] == "laptop-agent"
        assert snapshot["recipient_device_id"] == recipient["nodeId"]
        assert snapshot["recipient_device_name"] == "Alice Laptop"
        assert snapshot["request_content_redacted"] == "Need deployment config for review"
        assert snapshot["classification"] == "sensitive"
        assert snapshot["filename"] == "config.txt"
        assert snapshot["content_type"] == "text/plain"
        assert snapshot["size"] == 42
        assert snapshot["sha256"] == "a" * 64
        assert snapshot["sensitivity_reasons"][0]["code"] == "credential_assignment"

    def test_only_recipient_device_owner_can_approve_and_approval_queues_release(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        approval_id = inspected["approval_id"]
        denied = client.post(
            f"/v1/approvals/{approval_id}/approve",
            headers={"Authorization": "Bearer adam"},
            json={"network": workspace["id"]},
        )
        assert denied.status_code == 403
        approved = client.post(
            f"/v1/approvals/{approval_id}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert approved.status_code == 200, approved.text
        db.expire_all()
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.status == "queued_release"
        command = db.get(NodeCommand, stored.current_command_id)
        assert command.action == "local_file_release"
        assert command.command["approvedContentSha256"] == "a" * 64

    def test_legacy_workspace_token_owner_can_approve_sensitive_release(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        node = db.get(Node, recipient["nodeId"])
        node.owner_email = "token"
        db.commit()
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        approved = client.post(
            f"/v1/approvals/{inspected['approval_id']}/approve",
            headers={"X-Workspace-Token": workspace["token"]},
            json={"network": workspace["id"]},
        )
        assert approved.status_code == 200, approved.text
        db.expire_all()
        assert db.get(LocalFileRequest, request["id"]).status == "queued_release"

    def test_expired_sensitive_approval_cannot_queue_release(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        approval = db.get(ApprovalRequest, inspected["approval_id"])
        approval.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

        response = client.post(
            f"/v1/approvals/{approval.id}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert response.status_code == 410
        db.expire_all()
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.status == "expired"
        assert db.get(ApprovalRequest, approval.id).status == "expired"


def _upload(client, device, request_id, content=b"safe content", **overrides):
    body = {
        "content_base64": base64.b64encode(content).decode("ascii"),
        "sha256": hashlib.sha256(content).hexdigest(),
        "size": len(content),
        "filename": "config.txt",
        "content_type": "text/plain",
    }
    body.update(overrides)
    return client.post(
        f"/v1/local-file-requests/{request_id}/content",
        headers={"X-Workspace-Token": device["token"]},
        json=body,
    )


class TestLocalFileUpload:
    def test_sensitive_file_cannot_upload_before_approval(self, client, workspace):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"])
        assert inspected.status_code == 200
        response = _upload(client, recipient, request["id"])
        assert response.status_code == 409

    def test_wrong_device_and_hash_are_rejected(self, client, workspace):
        requester, recipient, request = _created_request(client, workspace)
        content = b"safe content"
        digest = hashlib.sha256(content).hexdigest()
        assert _inspection(
            client, recipient, request["id"], classification="safe",
            sensitivity_reasons=[], sha256=digest, size=len(content),
        ).status_code == 200
        assert _upload(client, requester, request["id"], content).status_code == 403
        assert _upload(client, recipient, request["id"], content, sha256="b" * 64).status_code == 400

    def test_verified_upload_creates_private_file_for_requester_and_is_idempotent(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        content = b"safe content"
        digest = hashlib.sha256(content).hexdigest()
        assert _inspection(
            client, recipient, request["id"], classification="safe",
            sensitivity_reasons=[], sha256=digest, size=len(content),
        ).status_code == 200
        response = _upload(client, recipient, request["id"], content)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["status"] == "completed"
        file_record = db.get(FileRecord, data["file_id"])
        assert file_record.owner == "openagents:server-agent"
        assert file_record.uploaded_by == "openagents:laptop-agent"
        assert file_record.visibility == "private"
        second = _upload(client, recipient, request["id"], content)
        assert second.status_code == 200
        assert second.json()["data"]["file_id"] == data["file_id"]

    def test_changed_hash_cannot_reuse_the_existing_approval(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        stored = db.get(LocalFileRequest, request["id"])
        stored.content_sha256 = "b" * 64
        db.commit()
        response = client.post(
            f"/v1/approvals/{inspected['approval_id']}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert response.status_code == 200, response.text
        db.expire_all()
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.status == "failed"
        assert stored.error_code == "approval_binding_changed"
        release = db.execute(
            select(NodeCommand).where(NodeCommand.action == "local_file_release")
        ).scalars().all()
        assert release == []

    def test_encoded_body_over_the_existing_quota_is_rejected(self, client, workspace, monkeypatch):
        import app.routers.local_file_requests as requests_mod

        monkeypatch.setattr(requests_mod, "MAX_LOCAL_FILE_BYTES", 3)
        _, recipient, request = _created_request(client, workspace)
        content = b"safe content"
        digest = hashlib.sha256(content).hexdigest()
        assert _inspection(
            client, recipient, request["id"], classification="safe",
            sensitivity_reasons=[], sha256=digest, size=len(content),
        ).status_code == 200
        response = _upload(client, recipient, request["id"], content)
        assert response.status_code == 400
        assert "safe content" not in response.text
        assert base64_exceeds_quota(base64.b64encode(content).decode("ascii"), 3)

    def test_offline_device_is_not_reported_as_success(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        node = db.get(Node, recipient["nodeId"])
        node.status = "offline"
        node.last_heartbeat = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
        response = client.get(
            f"/v1/local-file-requests/{request['id']}",
            params={"network": workspace["id"]},
            headers={"X-Workspace-Token": recipient["token"], "X-Agent-Name": "laptop-agent"},
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["status"] == "queued_inspection"
        assert data["execution_status"] == "status_unconfirmed"

    def test_running_transfer_is_not_handed_out_again(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        first = _heartbeat(client, recipient, ["laptop-agent"])
        assert [item["action"] for item in first["commands"]] == ["local_file_inspect"]
        second = _heartbeat(client, recipient, ["laptop-agent"])
        assert second["commands"] == []
        command = db.get(NodeCommand, first["commands"][0]["commandId"])
        assert command.status == "running"

    def test_cancel_requires_a_connector_that_can_confirm_it(self, client, workspace, db):
        requester, recipient, request = _created_request(client, workspace)
        denied = client.post(
            f"/v1/local-file-requests/{request['id']}/cancel",
            headers={"X-Workspace-Token": requester["token"], "X-Agent-Name": "server-agent"},
        )
        assert denied.status_code == 409
        assert "cannot cancel" in denied.text
        db.expire_all()
        assert db.get(LocalFileRequest, request["id"]).status == "queued_inspection"

        _heartbeat(client, recipient, ["laptop-agent"], ["local_file_request.v1", "local_file_cancel.v1"])
        accepted = client.post(
            f"/v1/local-file-requests/{request['id']}/cancel",
            headers={"X-Workspace-Token": requester["token"], "X-Agent-Name": "server-agent"},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["data"]["execution_status"] == "cancelling"
        command_id = db.get(LocalFileRequest, request["id"]).current_command_id
        confirmed = client.post(
            f"/v1/nodes/commands/{command_id}/result",
            headers={"X-Workspace-Token": recipient["token"]},
            json={"ok": True, "message": "Local-file cancel confirmed", "data": None},
        )
        assert confirmed.status_code == 200, confirmed.text
        db.expire_all()
        stored = db.get(LocalFileRequest, request["id"])
        assert stored.status == "cancelled"
        assert stored.error_message is None

    def test_changed_recipient_and_expired_request_cannot_continue(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        stored = db.get(LocalFileRequest, request["id"])
        stored.recipient_agent_id = "other-agent"
        db.commit()
        approved = client.post(
            f"/v1/approvals/{inspected['approval_id']}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert approved.status_code == 200, approved.text
        db.expire_all()
        assert db.get(LocalFileRequest, request["id"]).error_code == "approval_binding_changed"

        _, recipient, request = _created_request(client, workspace, "transfer-request-expired")
        content = b"safe content"
        digest = hashlib.sha256(content).hexdigest()
        assert _inspection(
            client, recipient, request["id"], classification="safe",
            sensitivity_reasons=[], sha256=digest, size=len(content),
        ).status_code == 200
        stored = db.get(LocalFileRequest, request["id"])
        stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        expired = _upload(client, recipient, request["id"], content)
        assert expired.status_code == 410
        assert "safe content" not in expired.text

    def test_revoked_device_cannot_upload_or_read_the_private_file(self, client, workspace, db):
        requester, recipient, request = _created_request(client, workspace)
        content = b"private transfer"
        digest = hashlib.sha256(content).hexdigest()
        assert _inspection(
            client, recipient, request["id"], classification="safe",
            sensitivity_reasons=[], sha256=digest, size=len(content),
        ).status_code == 200
        node = db.get(Node, recipient["nodeId"])
        node.token = "rotated-token"
        db.commit()
        revoked = _upload(client, recipient, request["id"], content)
        assert revoked.status_code == 401
        assert "private transfer" not in revoked.text

        node.token = recipient["token"]
        db.commit()
        uploaded = _upload(client, recipient, request["id"], content)
        assert uploaded.status_code == 200, uploaded.text
        file_id = uploaded.json()["data"]["file_id"]
        node.token = "rotated-token"
        db.commit()
        bare = client.get(
            f"/v1/files/{file_id}",
            headers={"X-Workspace-Token": recipient["token"]},
        )
        assert bare.status_code in (401, 403)
        assert b"private transfer" not in bare.content
        listed = client.get(
            "/v1/files",
            params={"network": workspace["id"]},
            headers={"X-Workspace-Token": requester["token"]},
        )
        assert listed.status_code == 200, listed.text
        assert all(item["id"] != file_id for item in listed.json()["data"]["files"])
        owned = client.get(
            f"/v1/files/{file_id}",
            headers={"X-Workspace-Token": requester["token"], "X-Agent-Name": "server-agent"},
        )
        assert owned.status_code == 200, owned.text
        assert owned.content == content

    def test_second_approval_does_not_queue_another_release(self, client, workspace, db):
        _, recipient, request = _created_request(client, workspace)
        inspected = _inspection(client, recipient, request["id"]).json()["data"]
        first = client.post(
            f"/v1/approvals/{inspected['approval_id']}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert first.status_code == 200, first.text
        second = client.post(
            f"/v1/approvals/{inspected['approval_id']}/approve",
            headers={"Authorization": "Bearer mia"},
            json={"network": workspace["id"]},
        )
        assert second.status_code in (200, 400, 409)
        releases = db.execute(
            select(NodeCommand).where(NodeCommand.action == "local_file_release")
        ).scalars().all()
        assert len(releases) == 1


def test_base64_quota_uses_the_existing_byte_limit():
    assert base64_exceeds_quota("abcd", 3) is False
    assert base64_exceeds_quota("abcde", 3) is True
