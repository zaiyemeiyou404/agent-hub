# Secure Cross-Device Local File Requests

## Problem

Agent Hub can exchange workspace files and queue node commands, but an agent cannot securely request a local file from an agent on another paired device. Generic node commands and configurable approvals are insufficient because they can expose arbitrary paths, lose commands after delivery, or auto-allow sensitive data.

## Goal

Implement a small-file request workflow in which an authenticated requesting agent asks a mandatory recipient agent for a file within an explicitly allowed local root. The connector classifies the file before egress. Sensitive or uncertain files require a non-bypassable human approval containing the complete request/recipient identity snapshot. Approved bytes are bound to their SHA-256 and uploaded as a private workspace file.

## Non-Goals

- Large-file chunking or resumable multipart transfer.
- End-to-end encryption in the first phase.
- Arbitrary filesystem browsing.
- Automatic transfer of prohibited files.
- LLM-based sensitivity downgrades.
- Generic role-based agent routing.

## Affected Areas

- `workspace/backend/app/models.py`
- `workspace/backend/app/routers/nodes.py`
- `workspace/backend/app/routers/approvals.py`
- `workspace/backend/app/routers/files.py`
- backend migrations and tests
- `packages/agent-connector/src/daemon.js`
- `packages/agent-connector/src/workspace-client.js`
- connector tests and MCP/tool schema
- frontend approval/request status UI

## Required Identity Snapshot

Every request, approval record, approval API response, audit event, and authenticated approval detail view must contain:

- requester Agent ID;
- requester device ID and immutable device-name snapshot;
- recipient Agent ID, supplied explicitly and never inferred;
- recipient device ID and immutable device-name snapshot;
- deterministically redacted request content;
- requested root and display-relative path;
- sensitivity reason codes and safe descriptions;
- request ID, creation time, expiry, and approval status.

Push/lock-screen notifications may contain only opaque IDs and a generic approval notice. Sensitive values, file bytes, absolute local paths, and matching secret excerpts must never appear in notifications, command results, or logs.

## Acceptance Criteria

- [ ] `recipient_agent_id` is mandatory and cannot be inferred from a device or channel.
- [ ] Shared workspace tokens cannot create or approve local-file requests; requester identity is bound to a per-device token and agent membership.
- [ ] The recipient must resolve to a paired device advertising `local_file_request.v1`.
- [ ] Requests use a named local root plus validated relative path; no default roots or arbitrary absolute paths are exposed.
- [ ] The connector rejects traversal, symlinks/reparse points, non-regular files, oversized files, malformed protocol messages, wrong recipient identities, and expired requests.
- [ ] Sensitive or uncertain classification always creates a pending human approval, regardless of configurable allow/block policies.
- [ ] Only the owner of the recipient device can approve or reject; agent, node, workspace, webhook, and machine tokens cannot approve.
- [ ] Approval is bound to request ID, both agent/device identities, root/path, size, SHA-256, sensitivity findings, policy version, and expiry.
- [ ] The approved bytes are the bytes transferred; a changed hash invalidates approval.
- [ ] Upload verifies recipient device identity, state, size, and SHA-256, then creates a private `FileRecord` owned by the requesting agent.
- [ ] Internal inspect/release actions cannot be submitted through the public generic node-command API.
- [ ] Unknown protocol versions, classifier errors, or unsupported files fail closed.
- [ ] Safe files in an explicitly allowed root can complete without human approval; sensitive or uncertain files cannot.
- [ ] Future connectors must declare the protocol capability and pass the same typed server contract; prompts alone cannot bypass it.
- [ ] Targeted tests, full affected test suites, typechecks/builds, and an end-to-end smoke pass.

## Risks

- Local path traversal and symlink races.
- Approval substitution or replay.
- Metadata leakage through notifications/logging.
- Request/recipient identity spoofing.
- Duplicate execution and uploads.
- Existing node commands becoming stuck after a lost heartbeat response.

The MVP mitigates duplicate execution with request/upload idempotency. Lease-based queue redelivery is included if required by the existing command lifecycle for a reliable smoke test; otherwise it remains the first follow-up and must be documented as a limitation rather than hidden.
