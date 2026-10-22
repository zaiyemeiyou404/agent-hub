# -*- coding: utf-8 -*-
"""WP-03 controller identity: separation, rotation, revocation and URL leaks.

Accounts, device keys and tokens in this file are synthetic. Nothing here is a
production credential.
"""

import logging
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.models import ControllerCredential, IdentityAuditEvent, Node, User
from app.services.credential_redaction import redact_diagnostic, redact_fragment, redact_query
from app.services.identity_port import contract


def _enroll(client, workspace, *, kind="phone", platform="android", device_key="synthetic-phone-0001",
            mode="standalone", token=None, authorization=None, label="local-operator"):
    headers = {}
    if token is not None:
        headers["X-Workspace-Token"] = token
    elif mode == "standalone":
        headers["X-Workspace-Token"] = workspace["token"]
    if authorization:
        headers["Authorization"] = authorization
    return client.post("/v1/identity/controllers/enroll", json={
        "workspace_id": workspace["id"],
        "device_key": device_key,
        "kind": kind,
        "platform": platform,
        "display_name": "synthetic controller",
        "mode": mode,
        "standalone_label": label,
    }, headers=headers)


def _auth(client, workspace, access, action, **extra):
    headers = {}
    if access:
        headers["Authorization"] = f"Bearer {access}"
    if extra.pop("workspace_token", None):
        headers["X-Workspace-Token"] = extra.pop("workspace_token")
    expires = extra.pop("expires", None)
    if expires is not None:
        headers["X-Identity-Request-Expires"] = expires
    machine = extra.pop("machine", None)
    if machine:
        headers["X-Workspace-Token"] = machine
    body = {"workspace_id": workspace["id"], "action": action}
    body.update(extra)
    return client.post("/v1/identity/authorize", json=body, headers=headers)


def _user_count(db):
    db.rollback()
    return db.execute(select(func.count()).select_from(User)).scalar()


def _add_node(db, workspace, *, token, key):
    node = Node(
        workspace_id=workspace["id"],
        node_key=key,
        owner_email="test@example.com",
        token=token,
        name="synthetic-connector",
        device_type="server",
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def _other_workspace(client):
    resp = client.post("/v1/workspaces", json={
        "name": "Other synthetic",
        "agent_name": "agent-beta",
        "creator_email": "other-synthetic@example.com",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    return {"id": data["workspaceId"], "token": data["token"]}


class TestSeparation:
    def test_standalone_does_not_create_a_human(self, client, db, workspace):
        before = _user_count(db)
        resp = _enroll(client, workspace)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["identity_mode"] == "standalone"
        assert data["human_login"] is False
        assert data["upstream_account"] is None
        assert data["principal"]["kind"] == "controller_session"
        assert data["principal"]["controller_kind"] == "phone"
        assert workspace["token"] not in resp.text
        assert _user_count(db) == before

    def test_node_pairing_is_not_phone_login(self, client, db, workspace):
        node = _add_node(db, workspace, token="synthetic-node-token-a", key="synthetic-node-a")
        resp = _enroll(client, workspace, token=node.token)
        assert resp.status_code == 403
        assert resp.json()["data"]["reason"] == "node_is_not_controller"
        denied = _auth(client, workspace, None, "approvals.decide", machine=node.token)
        assert denied.status_code == 403
        assert denied.json()["data"]["reason"] == "node_is_not_controller"

    def test_pairing_code_is_rejected(self, client, workspace):
        resp = client.post("/v1/identity/controllers/enroll", json={
            "workspace_id": workspace["id"],
            "device_key": "synthetic-phone-0001",
            "kind": "phone",
            "platform": "android",
            "mode": "standalone",
            "code": "ABCDEFGH",
        }, headers={"X-Workspace-Token": workspace["token"]})
        assert resp.status_code == 422

    def test_workspace_token_is_not_a_human_or_phone(self, client, workspace):
        human = _auth(client, workspace, None, "identity.act_as_human", machine=workspace["token"])
        assert human.status_code == 403
        assert human.json()["data"]["reason"] == "not_human"
        assert human.json()["data"]["principal"]["kind"] == "workspace_token"
        assert human.json()["data"]["principal"]["human_login"] is False
        phone = _auth(client, workspace, None, "approvals.decide", machine=workspace["token"])
        assert phone.json()["data"]["reason"] == "workspace_token_is_not_controller"

    def test_standalone_label_cannot_look_like_an_account(self, client, workspace):
        resp = _enroll(client, workspace, label="ada@example.com")
        assert resp.status_code == 400
        assert resp.json()["data"]["reason"] == "standalone_label_is_not_an_account"

    def test_upstream_binds_the_real_account(self, client, db, workspace, monkeypatch):
        monkeypatch.setattr("app.access.verify_identity_claims", lambda token: {
            "email": "test@example.com",
            "firebase_uid": "synthetic-uid",
            "apple_sub": None,
            "display_name": "Synthetic",
            "provider": "test",
        } if token == "synthetic-upstream-token" else None)
        before = _user_count(db)
        resp = _enroll(
            client, workspace, mode="upstream", kind="desktop", platform="windows",
            device_key="synthetic-desktop-0001", authorization="Bearer synthetic-upstream-token",
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["human_login"] is True
        assert data["identity_mode"] == "upstream"
        assert data["upstream_account"]["user_id"]
        assert workspace["token"] not in resp.text
        assert _user_count(db) == before + 1
        allowed = _auth(client, workspace, data["access_token"], "identity.act_as_human")
        assert allowed.status_code == 200
        assert allowed.json()["data"]["principal"]["kind"] == "controller_session"

    def test_hashes_are_what_gets_stored(self, client, db, workspace):
        resp = _enroll(client, workspace)
        data = resp.json()["data"]
        db.rollback()
        row = db.execute(select(ControllerCredential)).scalar_one()
        assert row.access_token_hash != data["access_token"]
        assert data["access_token"] not in row.access_token_hash
        assert data["refresh_token"] not in row.refresh_token_hash
        audits = db.execute(select(IdentityAuditEvent)).scalars().all()
        blob = " ".join(f"{row.action} {row.reason}" for row in audits)
        assert data["access_token"] not in blob
        assert data["refresh_token"] not in blob


class TestNegativeAuthorization:
    def test_anonymous_revoked_replayed_and_expired(self, client, db, workspace, monkeypatch):
        anon = _auth(client, workspace, None, "workspace.read")
        assert anon.status_code == 401
        assert anon.json()["data"]["reason"] == "anonymous"

        phone = _enroll(client, workspace).json()["data"]
        desktop = _enroll(
            client, workspace, kind="desktop", platform="windows", device_key="synthetic-desktop-0001",
        ).json()["data"]

        import app.services.controller_identity as ident
        started = ident._now()
        monkeypatch.setattr(ident, "_now", lambda: started + timedelta(minutes=16))
        expired = _auth(client, workspace, phone["access_token"], "messages.read")
        assert expired.status_code == 401
        assert expired.json()["data"]["reason"] == "expired"
        monkeypatch.setattr(ident, "_now", lambda: started)

        stale = _auth(client, workspace, phone["access_token"], "messages.read", expires="1")
        assert stale.status_code == 401
        assert stale.json()["data"]["reason"] == "expired"

        refreshed = client.post("/v1/identity/controllers/refresh", json={"refresh_token": phone["refresh_token"]})
        assert refreshed.status_code == 200, refreshed.text
        replay = client.post("/v1/identity/controllers/refresh", json={"refresh_token": phone["refresh_token"]})
        assert replay.status_code == 401
        assert replay.json()["data"]["reason"] == "replayed"
        killed = _auth(client, workspace, refreshed.json()["data"]["access_token"], "messages.read")
        assert killed.status_code == 401
        assert killed.json()["data"]["reason"] == "replayed"
        other = _auth(client, workspace, desktop["access_token"], "messages.read")
        assert other.status_code == 200

        monkeypatch.setattr(ident, "_now", lambda: started + timedelta(days=31))
        too_old = client.post("/v1/identity/controllers/refresh", json={"refresh_token": desktop["refresh_token"]})
        assert too_old.status_code == 401
        assert too_old.json()["data"]["reason"] == "expired"

    def test_cross_workspace_device_and_agent(self, client, db, workspace):
        phone = _enroll(client, workspace).json()["data"]
        other = _other_workspace(client)
        cross = client.post("/v1/identity/authorize", json={
            "workspace_id": other["id"],
            "action": "messages.read",
        }, headers={"Authorization": f"Bearer {phone['access_token']}"})
        assert cross.status_code == 403
        assert cross.json()["data"]["reason"] == "cross_workspace"

        node_a = _add_node(db, workspace, token="synthetic-node-token-a", key="synthetic-node-a")
        node_b = _add_node(db, workspace, token="synthetic-node-token-b", key="synthetic-node-b")
        bound = client.post("/v1/identity/bindings", json={
            "workspace_id": workspace["id"],
            "agent_name": "agent-alpha",
            "node_id": str(node_a.id),
        }, headers={"X-Workspace-Token": node_a.token})
        assert bound.status_code == 200, bound.text

        cross_device = _auth(
            client, workspace, None, "agents.heartbeat",
            machine=node_b.token, node_id=str(node_a.id), agent_name="agent-alpha",
        )
        assert cross_device.status_code == 403
        assert cross_device.json()["data"]["reason"] == "cross_device"

        cross_agent = _auth(
            client, workspace, None, "agents.heartbeat",
            machine=node_a.token, agent_name="agent-other",
        )
        assert cross_agent.status_code == 403
        assert cross_agent.json()["data"]["reason"] == "cross_agent"

        ok = _auth(
            client, workspace, None, "agents.heartbeat",
            machine=node_a.token, agent_name="agent-alpha",
        )
        assert ok.status_code == 200
        assert ok.json()["data"]["principal"]["kind"] == "agent"

        phone_as_other = _auth(
            client, workspace, phone["access_token"], "messages.read", device_id=str(node_a.id),
        )
        assert phone_as_other.status_code == 403
        assert phone_as_other.json()["data"]["reason"] == "cross_device"


class TestSessionLifecycle:
    def test_dual_end_restart_logout_and_single_device_revoke(self, client, workspace):
        phone = _enroll(client, workspace).json()["data"]
        desktop = _enroll(
            client, workspace, kind="desktop", platform="windows", device_key="synthetic-desktop-0001",
        ).json()["data"]
        assert set(phone["scopes"]) < set(desktop["scopes"])
        assert _auth(client, workspace, phone["access_token"], "messages.read").status_code == 200
        assert _auth(client, workspace, desktop["access_token"], "devices.manage").status_code == 200
        assert _auth(client, workspace, phone["access_token"], "devices.manage").json()["data"]["reason"] == "scope_denied"
        assert _auth(client, workspace, phone["access_token"], "identity.act_as_human").json()["data"]["reason"] == "not_human"

        recovered = client.post("/v1/identity/controllers/refresh", json={"refresh_token": phone["refresh_token"]})
        assert recovered.status_code == 200
        phone_access = recovered.json()["data"]["access_token"]
        assert phone_access != phone["access_token"]
        assert _auth(client, workspace, phone_access, "approvals.decide").status_code == 200

        logged_out = client.post("/v1/identity/controllers/logout", headers={"Authorization": f"Bearer {phone_access}"})
        assert logged_out.status_code == 200
        after = _auth(client, workspace, phone_access, "messages.read")
        assert after.status_code == 401
        assert after.json()["data"]["reason"] == "logged_out"
        assert _auth(client, workspace, desktop["access_token"], "messages.read").status_code == 200

        revoked = client.post(
            f"/v1/identity/controllers/{desktop['device_id']}/revoke",
            headers={"X-Workspace-Token": workspace["token"]},
        )
        assert revoked.status_code == 200
        dead = _auth(client, workspace, desktop["access_token"], "messages.read")
        assert dead.status_code == 401
        assert dead.json()["data"]["reason"] == "revoked"
        assert _auth(client, workspace, phone_access, "messages.read").json()["data"]["reason"] == "logged_out"

        listed = client.post("/v1/identity/controllers/list", json={"workspace_id": workspace["id"]},
                             headers={"X-Workspace-Token": workspace["token"]})
        kinds = {(row["kind"], row["platform"], row["status"]) for row in listed.json()["data"]["devices"]}
        assert ("phone", "android", "active") in kinds
        assert ("desktop", "windows", "revoked") in kinds

    def test_refresh_body_is_not_logged_and_not_forwarded(self, client, workspace, caplog):
        enrolled = _enroll(client, workspace).json()["data"]
        secret = enrolled["refresh_token"]
        with caplog.at_level(logging.WARNING, logger="app.main"):
            rejected = client.post("/v1/identity/controllers/refresh", json={
                "refresh_token": secret,
                "target_origin": "https://evil.example",
            })
        assert rejected.status_code == 422
        assert secret not in caplog.text
        assert "oa_rt_" not in caplog.text
        still = client.post("/v1/identity/controllers/refresh", json={"refresh_token": secret})
        assert still.status_code == 200

    def test_stream_ticket_is_single_use_and_not_the_session(self, client, workspace, monkeypatch):
        import app.routers.events as events_mod
        from app import cache
        from tests.conftest import TestingSessionLocal

        phone = _enroll(client, workspace).json()["data"]
        issued = client.post("/v1/identity/stream-ticket", headers={"Authorization": f"Bearer {phone['access_token']}"})
        assert issued.status_code == 200, issued.text
        ticket = issued.json()["data"]["stream_ticket"]
        assert ticket.startswith("oa_st_")
        assert phone["access_token"] not in ticket
        assert phone["refresh_token"] not in ticket

        async def fake_subscribe(_channel):
            if False:
                yield b""

        monkeypatch.setattr(events_mod, "SessionLocal", TestingSessionLocal)
        monkeypatch.setattr(cache, "subscribe_events", fake_subscribe)
        url = f"/v1/events/stream?network={workspace['id']}&stream_ticket={ticket}"
        assert phone["access_token"] not in url
        assert workspace["token"] not in url
        opened = client.get(url)
        assert opened.status_code == 200, opened.text
        replayed = client.get(url)
        assert replayed.status_code == 401
        assert replayed.json()["data"]["reason"] == "replayed"

    def test_identity_routes_reject_credential_query(self, client, workspace):
        phone = _enroll(client, workspace).json()["data"]
        resp = client.post(
            f"/v1/identity/authorize?token={workspace['token']}",
            json={"workspace_id": workspace["id"], "action": "messages.read"},
            headers={"Authorization": f"Bearer {phone['access_token']}"},
        )
        assert resp.status_code == 400
        assert resp.json()["data"]["reason"] == "credentials_in_url"


class TestRedactionSurfaces:
    def test_query_fragment_and_diagnostic_are_independent(self):
        raw = "https://controller.example/v1/events/stream?token=query-secret&network=ws#/room?token=fragment-secret"
        query_only = redact_query(raw)
        assert "query-secret" not in query_only
        assert "fragment-secret" in query_only
        fragment_only = redact_fragment(raw)
        assert "fragment-secret" not in fragment_only
        assert "query-secret" in fragment_only
        diagnostic = redact_diagnostic(
            'POST failed bearer oa_at_syntheticsecret refresh_token=oa_rt_syntheticsecret {"refresh_token":"oa_rt_syntheticsecret"}'
        )
        assert "oa_at_syntheticsecret" not in diagnostic
        assert "oa_rt_syntheticsecret" not in diagnostic
        assert "query-secret" not in redact_query(raw)
        assert "https://controller.example/v1/events/stream" in diagnostic or "POST failed" in diagnostic

    def test_contract_names_later_work_packages(self):
        body = contract()
        assert body["version"] == "wp03.v1"
        for key in ("WP-04", "WP-05", "WP-06", "WP-07"):
            assert key in body["consumers"]
        assert "node" in body["separation"]
        assert "controller_session" in body["separation"]
