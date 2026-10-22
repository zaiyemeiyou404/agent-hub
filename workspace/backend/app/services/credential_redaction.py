# -*- coding: utf-8 -*-
"""Separate redaction for URL queries, URL fragments, and diagnostic text.

The three entry points are intentionally independent. A caller that only
scrubs a query string must not be assumed to have scrubbed a fragment, and
diagnostic text is not parsed as a request URL.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

QUERY_SECRET_KEYS = frozenset({
    "token",
    "access_token",
    "refresh_token",
    "session_token",
    "custom_token",
    "ct",
    "password",
    "workspace_token",
})

_SECRET_JSON = re.compile(
    r'("(?:refresh_token|access_token|token|custom_token|identity_token|session_token|'
    r'password|api_key|apiKey|authorization|workspace_token|secret|stream_ticket|ticket)"\s*:\s*")([^"]*)(")',
    re.IGNORECASE,
)
_BEARER = re.compile(r"(?i)(bearer\s+)\S+")
_PREFIXED = re.compile(r"\boa_(?:at|rt|st)_[A-Za-z0-9_\-]+")
_QUERY_IN_TEXT = re.compile(
    r"(?i)([?#&](?:token|access_token|refresh_token|session_token|custom_token|ct|password|workspace_token)=)[^&#\s]+"
)


def _strip_secret_pairs(query: str) -> str:
    pairs = parse_qsl(query, keep_blank_values=True)
    kept = [(key, value) for key, value in pairs if key.lower() not in QUERY_SECRET_KEYS]
    return urlencode(kept)


def redact_query(url: str) -> str:
    """Drop credential query keys. The fragment is returned unchanged."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, _strip_secret_pairs(parts.query), parts.fragment))


def redact_fragment(url: str) -> str:
    """Drop credential keys that live in the fragment. The query is unchanged."""
    parts = urlsplit(url)
    fragment = parts.fragment
    if not fragment:
        return url
    if "?" in fragment:
        path, query = fragment.split("?", 1)
        stripped = _strip_secret_pairs(query)
        fragment = path + (("?" + stripped) if stripped else "")
    elif "=" in fragment:
        fragment = _strip_secret_pairs(fragment)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, fragment))


def credential_in_url(url: str) -> bool:
    """True when a query or fragment carries a credential key."""
    parts = urlsplit(url)
    query_keys = {key.lower() for key, _ in parse_qsl(parts.query, keep_blank_values=True)}
    if query_keys & QUERY_SECRET_KEYS:
        return True
    fragment = parts.fragment
    if "?" in fragment:
        fragment = fragment.split("?", 1)[1]
    frag_keys = {key.lower() for key, _ in parse_qsl(fragment, keep_blank_values=True)}
    return bool(frag_keys & QUERY_SECRET_KEYS)


def redact_diagnostic(text: str) -> str:
    """Scrub credential material in free-form diagnostic text.

    This does not parse the string as a URL. Query redaction and fragment
    redaction stay on their own functions.
    """
    if not text:
        return text
    scrubbed = _SECRET_JSON.sub(r"\1[redacted]\3", text)
    scrubbed = _BEARER.sub(r"\1[redacted]", scrubbed)
    scrubbed = _PREFIXED.sub("[redacted]", scrubbed)
    scrubbed = _QUERY_IN_TEXT.sub(r"\1[redacted]", scrubbed)
    return scrubbed


def redact_url(url: str) -> str:
    """Apply query and fragment redaction as two explicit steps."""
    return redact_fragment(redact_query(url))
