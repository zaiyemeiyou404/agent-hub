"""Shared apiBase / webBase / authBase rules. No official host is implied."""

from __future__ import annotations

from urllib.parse import urlsplit

DEV_API_BASE = "http://127.0.0.1:18000"
DEV_WEB_BASE = "http://127.0.0.1:13000"
OFFICIAL_MARKERS = ("openagents.org", "openagentsweb.firebaseapp.com", "posthog.com")


class ConfigurationRequired(Exception):
    code = "configuration_required"

    def __init__(self, field: str):
        super().__init__("configuration_required")
        self.field = field


def resolve_service_url(raw: str | None, role: str, *, dev_loopback: bool = False) -> str:
    value = (raw or "").strip().rstrip("/")
    if not value:
        raise ConfigurationRequired(role)
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        raise ConfigurationRequired(role) from exc
    if parts.username or parts.password or parts.query or parts.fragment:
        raise ConfigurationRequired(role)
    if parts.path not in ("", "/"):
        raise ConfigurationRequired(role)
    if not parts.scheme or not parts.netloc:
        raise ConfigurationRequired(role)
    origin = f"{parts.scheme}://{parts.netloc}"
    if parts.scheme == "https":
        return origin
    allowed = DEV_WEB_BASE if role == "web" else DEV_API_BASE
    if dev_loopback and origin == allowed:
        return origin
    raise ConfigurationRequired(role)


def contains_official_host(value: str | None) -> bool:
    text = (value or "").lower()
    return any(marker in text for marker in OFFICIAL_MARKERS)
