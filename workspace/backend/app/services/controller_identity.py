# -*- coding: utf-8 -*-
"""Self-hosted controller identity.

Principals stay separate:

* upstream_account — a real human IdP login (User row)
* workspace_token — the machine bootstrap credential (Workspace.password_hash)
* node — a connector enrolled by node pairing
* controller_session — a phone or desktop controller
* agent — an agent bound to exactly one node in one workspace

Standalone mode never creates a User and never reports a human login.
Node pairing credentials cannot enroll or act as a phone.
"""

from __future__ import annotations

import hmac
import hashlib
import logging
import os
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import resolve_current_user, resolve_machine_token, resolve_user_role, role_at_least
from app.models import (
    AgentPrincipalBinding,
    ControllerCredential,
    ControllerDevice,
    IdentityAuditEvent,
    IdentityStreamTicket,
    Node,
    User,
    Workspace,
)

logger = logging.getLogger(__name__)

CONTRACT_VERSION = "wp03.v1"
ACCESS_PREFIX = "oa_at_"
REFRESH_PREFIX = "oa_rt_"
TICKET_PREFIX = "oa_st_"
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)
TICKET_TTL = timedelta(seconds=60)

PHONE_SCOPES = (
    "workspace.read",
    "messages.read",
    "messages.write",
    "approvals.read",
    "approvals.decide",
    "devices.read",
)
DESKTOP_SCOPES = PHONE_SCOPES + (
    "devices.manage",
    "agents.read",
    "agents.bind",
    "nodes.read",
)
NODE_SCOPES = (
    "workspace.read",
    "messages.read",
    "messages.write",
    "agents.read",
    "agents.heartbeat",
    "nodes.heartbeat",
    "nodes.read",
)
WORKSPACE_TOKEN_SCOPES = (
    "workspace.read",
    "devices.read",
    "devices.manage",
    "agents.bind",
    "identity.enroll",
    "nodes.read",
)
CONTROLLER_ONLY_ACTIONS = frozenset({
    "approvals.read",
    "approvals.decide",
    "devices.manage",
    "agents.bind",
})
CONTROLLER_KINDS = frozenset({"phone", "desktop"})
PLATFORMS = frozenset({"windows", "android", "macos", "linux", "ios", "web"})
HUMAN_ACTION = "identity.act_as_human"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _pepper() -> bytes:
    return os.environ.get("CONTROLLER_TOKEN_PEPPER", "agenthub-controller-dev").encode()


def token_hash(raw: str) -> str:
    return hmac.new(_pepper(), raw.encode(), hashlib.sha256).hexdigest()


def _new_token(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(32)


def _scopes_for(kind: str, mode: str) -> list[str]:
    scopes = list(DESKTOP_SCOPES if kind == "desktop" else PHONE_SCOPES)
    if mode == "upstream":
        scopes.append(HUMAN_ACTION)
    return scopes


def _as_list(value) -> list:
    if isinstance(value, str):
        import json
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return list(value or [])


@dataclass
class Decision:
    allowed: bool
    reason: str
    http_status: int
    principal: Optional[dict] = None
    extra: dict = field(default_factory=dict)

    def as_data(self) -> dict:
        payload = {
            "allowed": self.allowed,
            "reason": self.reason,
            "principal": self.principal,
        }
        payload.update(self.extra)
        return payload


def _deny(reason: str, status: int, principal: Optional[dict] = None) -> Decision:
    return Decision(False, reason, status, principal)


def _ok(principal: dict, extra: Optional[dict] = None) -> Decision:
    return Decision(True, "ok", 200, principal, extra or {})


def contract() -> dict:
    """Machine-readable port. Later work packages import this shape."""
    return {
        "version": CONTRACT_VERSION,
        "principal_kinds": [
            "upstream_account",
            "workspace_token",
            "node",
            "controller_session",
            "agent",
        ],
        "controller_kinds": sorted(CONTROLLER_KINDS),
        "platforms": sorted(PLATFORMS),
        "separation": {
            "upstream_account": "Human IdP login. Never minted by standalone enrollment.",
            "workspace_token": "Machine bootstrap credential. Not a phone session and not a human login.",
            "node": "Connector identity from node pairing. Pairing is not phone login.",
            "controller_session": "Phone or desktop session with short-lived access and rotating refresh.",
            "agent": "Agent principal bound to one node inside one workspace.",
        },
        "consumers": {
            "WP-04": "Call authorize() before connector capability or file-protocol actions. Redeem stream tickets. Do not parse credentials.",
            "WP-05": "Desktop enroll, refresh, logout and server switch go through this port and the Windows fail-closed vault.",
            "WP-06": "Mobile enrollment uses the same endpoints and the Android keystore vault. Pairing codes stay on /v1/nodes/redeem.",
            "WP-07": "Messages, files, approvals and device management call authorize() with the controller access token and an action.",
        },
        "actions": {
            "phone": list(PHONE_SCOPES),
            "desktop": list(DESKTOP_SCOPES) + [HUMAN_ACTION],
            "node": list(NODE_SCOPES),
            "workspace_token": list(WORKSPACE_TOKEN_SCOPES),
        },
    }


def _audit(db: Session, workspace_id: str, action: str, principal_kind: str, reason: str, device_id: Optional[str] = None) -> None:
    db.add(IdentityAuditEvent(
        workspace_id=str(workspace_id),
        action=action,
        principal_kind=principal_kind,
        device_id=str(device_id) if device_id else None,
        reason=reason,
    ))


def _principal(
    kind: str,
    workspace_id: Optional[str],
    *,
    device_id: Optional[str] = None,
    node_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    upstream_user_id: Optional[str] = None,
    identity_mode: Optional[str] = None,
    human_login: bool = False,
    controller_kind: Optional[str] = None,
    platform: Optional[str] = None,
) -> dict:
    return {
        "kind": kind,
        "workspace_id": str(workspace_id) if workspace_id else None,
        "device_id": str(device_id) if device_id else None,
        "node_id": str(node_id) if node_id else None,
        "agent_name": agent_name,
        "upstream_user_id": str(upstream_user_id) if upstream_user_id else None,
        "identity_mode": identity_mode,
        "human_login": human_login,
        "controller_kind": controller_kind,
        "platform": platform,
    }


def _load_workspace(db: Session, workspace_id: str) -> Optional[Workspace]:
    ws = db.execute(select(Workspace).where(Workspace.id == workspace_id)).scalar_one_or_none()
    if ws is None or ws.status == "deleted":
        return None
    return ws


def _device_principal(device: ControllerDevice) -> dict:
    return _principal(
        "controller_session",
        device.workspace_id,
        device_id=device.id,
        upstream_user_id=device.upstream_user_id,
        identity_mode=device.identity_mode,
        human_login=device.identity_mode == "upstream" and bool(device.upstream_user_id),
        controller_kind=device.kind,
        platform=device.platform,
    )


def _find_credential(db: Session, raw: str, column) -> Optional[ControllerCredential]:
    if not raw:
        return None
    return db.execute(select(ControllerCredential).where(column == token_hash(raw))).scalar_one_or_none()


def _family_rows(db: Session, family_id: str) -> list[ControllerCredential]:
    return list(db.execute(
        select(ControllerCredential).where(ControllerCredential.family_id == family_id)
    ).scalars().all())


def _revoke_family(db: Session, credential: ControllerCredential, reason: str, now: datetime) -> None:
    for row in _family_rows(db, credential.family_id):
        if row.revoked_at is None:
            row.revoked_at = now
        if reason == "replay":
            row.revoke_reason = "replay"
        elif row.revoke_reason is None:
            row.revoke_reason = reason
    device = db.execute(select(ControllerDevice).where(ControllerDevice.id == credential.device_id)).scalar_one_or_none()
    if device is not None and reason in {"replay", "admin"}:
        device.status = "revoked"
        device.revoked_at = now


def _credential_block(db: Session, credential: ControllerCredential, device: ControllerDevice, now: datetime, *, refresh: bool) -> Optional[Decision]:
    principal = _device_principal(device)
    if credential.revoke_reason == "replay" or credential.replaced_at is not None:
        if credential.revoke_reason != "replay":
            _revoke_family(db, credential, "replay", now)
            _audit(db, device.workspace_id, "replay", "controller_session", "replayed", device.id)
        return _deny("replayed", 401, principal)
    if device.status == "revoked" or credential.revoke_reason == "admin":
        return _deny("revoked", 401, principal)
    if credential.revoked_at is not None or credential.revoke_reason == "logout":
        return _deny("logged_out", 401, principal)
    expires = credential.refresh_expires_at if refresh else credential.access_expires_at
    if _aware(expires) <= now:
        _audit(db, device.workspace_id, "expired", "controller_session", "expired", device.id)
        return _deny("expired", 401, principal)
    return None


def _request_expired(header: Optional[str], now: datetime) -> Optional[str]:
    if header is None or header == "":
        return None
    try:
        exp = int(header)
    except (TypeError, ValueError):
        return "malformed"
    if exp <= int(now.timestamp()):
        return "expired"
    return None


def _controller_from_bearer(db: Session, authorization: Optional[str]) -> tuple[Optional[ControllerCredential], Optional[ControllerDevice], Optional[str]]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None, None
    raw = authorization[7:].strip()
    if not raw.startswith(ACCESS_PREFIX):
        return None, None, None
    credential = _find_credential(db, raw, ControllerCredential.access_token_hash)
    if credential is None:
        return None, None, raw
    device = db.execute(select(ControllerDevice).where(ControllerDevice.id == credential.device_id)).scalar_one_or_none()
    return credential, device, raw


def enroll_controller(
    db: Session,
    *,
    workspace_id: str,
    device_key: str,
    kind: str,
    platform: str,
    display_name: Optional[str],
    mode: str,
    standalone_label: Optional[str],
    workspace_token: Optional[str],
    authorization: Optional[str],
) -> Decision:
    now = _now()
    if kind not in CONTROLLER_KINDS:
        return _deny("bad_kind", 400)
    if platform not in PLATFORMS:
        return _deny("bad_platform", 400)
    if mode not in {"standalone", "upstream"}:
        return _deny("bad_mode", 400)
    if not device_key or len(device_key) < 8 or len(device_key) > 200:
        return _deny("bad_device_key", 400)
    if standalone_label and ("@" in standalone_label or len(standalone_label) > 120):
        return _deny("standalone_label_is_not_an_account", 400)

    workspace = _load_workspace(db, workspace_id)
    if workspace is None:
        return _deny("not_found", 404)

    presented = (workspace_token or "").strip()
    if presented.startswith((ACCESS_PREFIX, REFRESH_PREFIX, TICKET_PREFIX)):
        return _deny("node_is_not_controller", 403)
    matched_ws, matched_node = resolve_machine_token(db, presented) if presented else (None, None)
    if matched_node is not None:
        _audit(db, workspace.id, "enroll_rejected", "node", "node_is_not_controller")
        return _deny("node_is_not_controller", 403, _principal("node", matched_node.workspace_id, node_id=matched_node.id))

    upstream_user: Optional[User] = None
    if mode == "upstream":
        upstream_user = resolve_current_user(db, authorization)
        role = resolve_user_role(db, workspace, authorization) if upstream_user or authorization else None
        if upstream_user is None or role is None:
            if matched_ws is not None and str(matched_ws.id) == str(workspace.id):
                return _deny("not_human", 403, _principal("workspace_token", workspace.id, human_login=False, identity_mode=None))
            return _deny("anonymous", 401)
        if role_at_least(role, "admin"):
            pass
        elif role_at_least(role, "member"):
            pass
        else:
            return _deny("scope_denied", 403)
    else:
        # Standalone bootstrap uses the workspace machine credential only.
        # A bearer, even a valid human one, is not copied onto the device.
        if matched_ws is None or str(matched_ws.id) != str(workspace.id):
            if matched_ws is not None:
                return _deny("cross_workspace", 403, _principal("workspace_token", matched_ws.id, human_login=False))
            return _deny("anonymous", 401)
        upstream_user = None

    device = db.execute(
        select(ControllerDevice).where(
            ControllerDevice.workspace_id == workspace.id,
            ControllerDevice.device_key == device_key,
        )
    ).scalar_one_or_none()
    if device is not None and device.status == "revoked":
        allowed_restore = mode == "standalone" or (
            upstream_user is not None and (
                str(device.upstream_user_id or "") == str(upstream_user.id)
                or role_at_least(resolve_user_role(db, workspace, authorization), "admin")
            )
        )
        if not allowed_restore:
            return _deny("revoked", 401, _device_principal(device))
        device.status = "active"
        device.revoked_at = None
    if device is None:
        device = ControllerDevice(
            workspace_id=workspace.id,
            device_key=device_key,
            kind=kind,
            platform=platform,
            identity_mode=mode,
            status="active",
        )
        db.add(device)
        db.flush()
    device.kind = kind
    device.platform = platform
    device.display_name = (display_name or "")[:120] or None
    device.identity_mode = mode
    device.upstream_user_id = upstream_user.id if upstream_user is not None else None
    device.standalone_label = standalone_label if mode == "standalone" else None
    device.last_seen_at = now

    previous = db.execute(
        select(ControllerCredential).where(
            ControllerCredential.device_id == device.id,
            ControllerCredential.revoked_at.is_(None),
            ControllerCredential.replaced_at.is_(None),
        )
    ).scalars().all()
    for row in previous:
        row.revoked_at = now
        row.revoke_reason = "reenroll"

    access = _new_token(ACCESS_PREFIX)
    refresh = _new_token(REFRESH_PREFIX)
    scopes = _scopes_for(kind, mode)
    credential = ControllerCredential(
        device_id=device.id,
        workspace_id=workspace.id,
        family_id=str(uuid.uuid4()),
        generation=1,
        access_token_hash=token_hash(access),
        refresh_token_hash=token_hash(refresh),
        scopes=scopes,
        access_expires_at=now + ACCESS_TTL,
        refresh_expires_at=now + REFRESH_TTL,
    )
    db.add(credential)
    _audit(db, workspace.id, "enroll", "controller_session", mode, device.id)
    db.commit()
    logger.info(
        "identity enroll workspace=%s device=%s kind=%s platform=%s mode=%s",
        workspace.id, device.id, kind, platform, mode,
    )
    principal = _device_principal(device)
    return _ok(principal, {
        "device_id": str(device.id),
        "access_token": access,
        "refresh_token": refresh,
        "access_expires_at": credential.access_expires_at.isoformat(),
        "refresh_expires_at": credential.refresh_expires_at.isoformat(),
        "scopes": scopes,
        "identity_mode": mode,
        "human_login": principal["human_login"],
        "upstream_account": (
            {"user_id": str(upstream_user.id)} if upstream_user is not None else None
        ),
    })


def refresh_controller(db: Session, refresh_token: str) -> Decision:
    now = _now()
    if not refresh_token or not refresh_token.startswith(REFRESH_PREFIX):
        return _deny("anonymous", 401)
    credential = _find_credential(db, refresh_token, ControllerCredential.refresh_token_hash)
    if credential is None:
        return _deny("anonymous", 401)
    device = db.execute(select(ControllerDevice).where(ControllerDevice.id == credential.device_id)).scalar_one_or_none()
    if device is None:
        return _deny("anonymous", 401)
    blocked = _credential_block(db, credential, device, now, refresh=True)
    if blocked is not None:
        db.commit()
        return blocked
    credential.replaced_at = now
    access = _new_token(ACCESS_PREFIX)
    refresh = _new_token(REFRESH_PREFIX)
    scopes = _as_list(credential.scopes)
    rotated = ControllerCredential(
        device_id=device.id,
        workspace_id=device.workspace_id,
        family_id=credential.family_id,
        generation=int(credential.generation) + 1,
        access_token_hash=token_hash(access),
        refresh_token_hash=token_hash(refresh),
        scopes=scopes,
        access_expires_at=now + ACCESS_TTL,
        refresh_expires_at=now + REFRESH_TTL,
    )
    db.add(rotated)
    device.last_seen_at = now
    _audit(db, device.workspace_id, "refresh", "controller_session", "rotated", device.id)
    db.commit()
    logger.info("identity refresh workspace=%s device=%s generation=%s", device.workspace_id, device.id, rotated.generation)
    return _ok(_device_principal(device), {
        "device_id": str(device.id),
        "access_token": access,
        "refresh_token": refresh,
        "access_expires_at": rotated.access_expires_at.isoformat(),
        "refresh_expires_at": rotated.refresh_expires_at.isoformat(),
        "scopes": scopes,
        "identity_mode": device.identity_mode,
        "human_login": device.identity_mode == "upstream" and bool(device.upstream_user_id),
        "generation": rotated.generation,
    })


def logout_controller(db: Session, authorization: Optional[str]) -> Decision:
    now = _now()
    credential, device, _raw = _controller_from_bearer(db, authorization)
    if credential is None or device is None:
        return _deny("anonymous", 401)
    blocked = _credential_block(db, credential, device, now, refresh=False)
    if blocked is not None:
        db.commit()
        return blocked
    credential.revoked_at = now
    credential.revoke_reason = "logout"
    _audit(db, device.workspace_id, "logout", "controller_session", "logged_out", device.id)
    db.commit()
    logger.info("identity logout workspace=%s device=%s", device.workspace_id, device.id)
    return _ok(_device_principal(device), {"device_id": str(device.id)})


def revoke_device(
    db: Session,
    *,
    device_id: str,
    authorization: Optional[str],
    workspace_token: Optional[str],
) -> Decision:
    now = _now()
    device = db.execute(select(ControllerDevice).where(ControllerDevice.id == device_id)).scalar_one_or_none()
    if device is None:
        return _deny("not_found", 404)
    caller = _caller(db, authorization, workspace_token, now)
    if isinstance(caller, Decision):
        db.commit()
        return caller
    kind, principal, scopes = caller
    if principal.get("workspace_id") and str(principal["workspace_id"]) != str(device.workspace_id):
        return _deny("cross_workspace", 403, principal)
    same_device = kind == "controller_session" and str(principal.get("device_id")) == str(device.id)
    if not same_device and "devices.manage" not in scopes and kind != "workspace_token":
        return _deny("scope_denied", 403, principal)
    device.status = "revoked"
    device.revoked_at = now
    rows = db.execute(select(ControllerCredential).where(ControllerCredential.device_id == device.id)).scalars().all()
    for row in rows:
        if row.revoked_at is None:
            row.revoked_at = now
        if row.revoke_reason is None:
            row.revoke_reason = "admin"
    _audit(db, device.workspace_id, "revoke", "controller_session", "revoked", device.id)
    db.commit()
    logger.info("identity revoke workspace=%s device=%s", device.workspace_id, device.id)
    return _ok(_device_principal(device), {"device_id": str(device.id), "status": "revoked"})


def list_devices(db: Session, *, workspace_id: str, authorization: Optional[str], workspace_token: Optional[str]) -> Decision:
    now = _now()
    workspace = _load_workspace(db, workspace_id)
    if workspace is None:
        return _deny("not_found", 404)
    caller = _caller(db, authorization, workspace_token, now)
    if isinstance(caller, Decision):
        db.commit()
        return caller
    _kind, principal, scopes = caller
    if str(principal.get("workspace_id")) != str(workspace.id):
        return _deny("cross_workspace", 403, principal)
    if "devices.read" not in scopes and _kind != "workspace_token":
        return _deny("scope_denied", 403, principal)
    rows = db.execute(
        select(ControllerDevice).where(ControllerDevice.workspace_id == workspace.id)
    ).scalars().all()
    devices = [{
        "device_id": str(row.id),
        "kind": row.kind,
        "platform": row.platform,
        "display_name": row.display_name,
        "identity_mode": row.identity_mode,
        "human_login": row.identity_mode == "upstream" and bool(row.upstream_user_id),
        "upstream_user_id": str(row.upstream_user_id) if row.upstream_user_id else None,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
    } for row in rows]
    return _ok(principal, {"devices": devices})


def bind_agent(
    db: Session,
    *,
    workspace_id: str,
    agent_name: str,
    node_id: str,
    authorization: Optional[str],
    workspace_token: Optional[str],
) -> Decision:
    now = _now()
    if not agent_name or len(agent_name) > 200:
        return _deny("bad_agent", 400)
    workspace = _load_workspace(db, workspace_id)
    if workspace is None:
        return _deny("not_found", 404)
    node = db.execute(select(Node).where(Node.id == node_id)).scalar_one_or_none()
    if node is None:
        return _deny("not_found", 404)
    if str(node.workspace_id) != str(workspace.id):
        return _deny("cross_workspace", 403, _principal("node", node.workspace_id, node_id=node.id))
    caller = _caller(db, authorization, workspace_token, now, node_hint=workspace_token)
    if isinstance(caller, Decision):
        db.commit()
        return caller
    kind, principal, scopes = caller
    if str(principal.get("workspace_id")) != str(workspace.id):
        return _deny("cross_workspace", 403, principal)
    if kind == "node" and str(principal.get("node_id")) != str(node.id):
        return _deny("cross_device", 403, principal)
    if kind == "controller_session" and "agents.bind" not in scopes:
        return _deny("scope_denied", 403, principal)
    if kind not in {"node", "workspace_token", "controller_session"}:
        return _deny("scope_denied", 403, principal)
    # A connector may bind an agent on its own node. That does not grant
    # phone or desktop controller scopes.
    binding = db.execute(
        select(AgentPrincipalBinding).where(
            AgentPrincipalBinding.workspace_id == workspace.id,
            AgentPrincipalBinding.agent_name == agent_name,
            AgentPrincipalBinding.node_id == node.id,
        )
    ).scalar_one_or_none()
    if binding is None:
        binding = AgentPrincipalBinding(
            workspace_id=workspace.id,
            agent_name=agent_name,
            node_id=node.id,
            status="active",
        )
        db.add(binding)
    binding.status = "active"
    binding.revoked_at = None
    _audit(db, workspace.id, "bind", "agent", "ok", principal.get("device_id"))
    db.commit()
    bound = _principal("agent", workspace.id, node_id=node.id, agent_name=agent_name)
    return _ok(bound, {"binding_id": str(binding.id)})


def _caller(db: Session, authorization: Optional[str], workspace_token: Optional[str], now: datetime, node_hint: Optional[str] = None):
    credential, device, raw = _controller_from_bearer(db, authorization)
    if raw and credential is None:
        return _deny("anonymous", 401)
    if credential is not None and device is not None:
        blocked = _credential_block(db, credential, device, now, refresh=False)
        if blocked is not None:
            return blocked
        return "controller_session", _device_principal(device), set(_as_list(credential.scopes))

    token = (workspace_token or "").strip()
    if token.startswith((ACCESS_PREFIX, REFRESH_PREFIX, TICKET_PREFIX)):
        return _deny("anonymous", 401)
    if token:
        matched_ws, matched_node = resolve_machine_token(db, token)
        if matched_node is not None:
            return "node", _principal("node", matched_node.workspace_id, node_id=matched_node.id, human_login=False), set(NODE_SCOPES)
        if matched_ws is not None:
            return "workspace_token", _principal("workspace_token", matched_ws.id, human_login=False), set(WORKSPACE_TOKEN_SCOPES)

    if authorization and authorization.lower().startswith("bearer "):
        user = resolve_current_user(db, authorization)
        if user is not None:
            return "upstream_account", _principal(
                "upstream_account", None, upstream_user_id=user.id, identity_mode="upstream", human_login=True,
            ), {HUMAN_ACTION, "workspace.read"}
    return _deny("anonymous", 401)


def authorize(
    db: Session,
    *,
    workspace_id: str,
    action: str,
    authorization: Optional[str],
    workspace_token: Optional[str],
    device_id: Optional[str] = None,
    node_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    request_expires: Optional[str] = None,
) -> Decision:
    now = _now()
    expiry = _request_expired(request_expires, now)
    if expiry == "malformed":
        return _deny("bad_request", 400)
    workspace = _load_workspace(db, workspace_id)
    if workspace is None:
        return _deny("not_found", 404)
    caller = _caller(db, authorization, workspace_token, now)
    if isinstance(caller, Decision):
        if caller.reason in {"replayed", "expired", "logged_out", "revoked"}:
            db.commit()
        return caller
    kind, principal, scopes = caller
    if expiry == "expired":
        _audit(db, workspace.id, "expired", kind, "expired", principal.get("device_id"))
        db.commit()
        return _deny("expired", 401, principal)

    if kind == "upstream_account":
        role = resolve_user_role(db, workspace, authorization)
        if role is None:
            return _deny("cross_workspace", 403, principal)
        principal = {**principal, "workspace_id": str(workspace.id)}
        if action == HUMAN_ACTION:
            return _ok(principal)
        if action in CONTROLLER_ONLY_ACTIONS:
            return _deny("upstream_account_is_not_controller", 403, principal)
        if action not in scopes:
            return _deny("scope_denied", 403, principal)
        return _ok(principal)

    if principal.get("workspace_id") and str(principal["workspace_id"]) != str(workspace.id):
        return _deny("cross_workspace", 403, principal)

    if kind == "controller_session":
        if device_id and str(device_id) != str(principal.get("device_id")):
            return _deny("cross_device", 403, principal)
        if action == HUMAN_ACTION and not principal.get("human_login"):
            return _deny("not_human", 403, principal)
        if action not in scopes:
            return _deny("scope_denied", 403, principal)
        return _ok(principal)

    if kind == "workspace_token":
        if action == HUMAN_ACTION:
            return _deny("not_human", 403, principal)
        if action in CONTROLLER_ONLY_ACTIONS:
            return _deny("workspace_token_is_not_controller", 403, principal)
        if action not in scopes:
            return _deny("scope_denied", 403, principal)
        return _ok(principal)

    if kind == "node":
        if node_id and str(node_id) != str(principal.get("node_id")):
            return _deny("cross_device", 403, principal)
        if action in CONTROLLER_ONLY_ACTIONS:
            return _deny("node_is_not_controller", 403, principal)
        if agent_name:
            binding = db.execute(
                select(AgentPrincipalBinding).where(
                    AgentPrincipalBinding.workspace_id == workspace.id,
                    AgentPrincipalBinding.agent_name == agent_name,
                    AgentPrincipalBinding.status == "active",
                )
            ).scalars().all()
            matched = [row for row in binding if str(row.node_id) == str(principal.get("node_id"))]
            other_node = [row for row in binding if str(row.node_id) != str(principal.get("node_id"))]
            if not matched and other_node:
                return _deny("cross_device", 403, principal)
            if not matched:
                return _deny("cross_agent", 403, principal)
            principal = _principal(
                "agent", workspace.id, node_id=principal.get("node_id"), agent_name=agent_name, human_login=False,
            )
        if action not in scopes and action not in NODE_SCOPES:
            return _deny("scope_denied", 403, principal)
        if action not in NODE_SCOPES:
            return _deny("scope_denied", 403, principal)
        return _ok(principal)

    return _deny("anonymous", 401)


def issue_stream_ticket(db: Session, authorization: Optional[str]) -> Decision:
    now = _now()
    credential, device, _raw = _controller_from_bearer(db, authorization)
    if credential is None or device is None:
        return _deny("anonymous", 401)
    blocked = _credential_block(db, credential, device, now, refresh=False)
    if blocked is not None:
        db.commit()
        return blocked
    if "messages.read" not in set(_as_list(credential.scopes)):
        return _deny("scope_denied", 403, _device_principal(device))
    raw = _new_token(TICKET_PREFIX)
    row = IdentityStreamTicket(
        workspace_id=device.workspace_id,
        device_id=device.id,
        ticket_hash=token_hash(raw),
        expires_at=now + TICKET_TTL,
    )
    db.add(row)
    _audit(db, device.workspace_id, "stream_ticket", "controller_session", "issued", device.id)
    db.commit()
    return _ok(_device_principal(device), {
        "stream_ticket": raw,
        "expires_at": row.expires_at.isoformat(),
    })


def consume_stream_ticket(db: Session, raw: str, workspace: Workspace) -> Decision:
    now = _now()
    if not raw or not raw.startswith(TICKET_PREFIX):
        return _deny("anonymous", 401)
    row = db.execute(
        select(IdentityStreamTicket).where(IdentityStreamTicket.ticket_hash == token_hash(raw))
    ).scalar_one_or_none()
    if row is None:
        return _deny("anonymous", 401)
    device = db.execute(select(ControllerDevice).where(ControllerDevice.id == row.device_id)).scalar_one_or_none()
    principal = _device_principal(device) if device is not None else None
    if str(row.workspace_id) != str(workspace.id):
        return _deny("cross_workspace", 403, principal)
    if device is None or device.status == "revoked":
        return _deny("revoked", 401, principal)
    if row.used_at is not None:
        _audit(db, workspace.id, "replay", "controller_session", "replayed", device.id)
        db.commit()
        return _deny("replayed", 401, principal)
    if _aware(row.expires_at) <= now:
        _audit(db, workspace.id, "expired", "controller_session", "expired", device.id)
        db.commit()
        return _deny("expired", 401, principal)
    row.used_at = now
    db.commit()
    return _ok(principal or _principal("controller_session", workspace.id))


def describe_principal(db: Session, authorization: Optional[str], workspace_token: Optional[str]) -> Decision:
    now = _now()
    caller = _caller(db, authorization, workspace_token, now)
    if isinstance(caller, Decision):
        if caller.reason in {"replayed", "expired", "logged_out", "revoked"}:
            db.commit()
        return caller
    _kind, principal, scopes = caller
    return _ok(principal, {"scopes": sorted(scopes)})
