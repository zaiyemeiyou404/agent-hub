# -*- coding: utf-8 -*-
"""Stable identity port for later AgentHub work packages.

WP-04 (protocol and connector) imports ``authorize`` and
``consume_stream_ticket``. It must not parse access tokens, refresh tokens,
workspace tokens or node tokens itself.

WP-05 (desktop product) calls the enroll, refresh, logout and revoke
endpoints and stores the returned refresh credential in the Windows
fail-closed vault. It does not invent a second controller session store.

WP-06 (mobile foundation) uses the same endpoints and the Android keystore
vault. Node pairing remains ``POST /v1/nodes/redeem`` and never enrolls a phone.

WP-07 (mobile core) sends the controller access token to ``authorize`` with
the action it is about to perform (messages, files, approvals, device
management). A ``revoked`` decision is the revocation signal; WP-07 does not
delete connector nodes to log a phone out.
"""

from app.services.controller_identity import (
    CONTRACT_VERSION,
    authorize,
    consume_stream_ticket,
    contract,
)

__all__ = [
    "CONTRACT_VERSION",
    "authorize",
    "consume_stream_ticket",
    "contract",
]
