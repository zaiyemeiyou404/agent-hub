# Design

## Protocol

1. Requester calls a typed local-file request API with its authenticated Agent identity, mandatory `recipient_agent_id`, root ID, relative path, and purpose.
2. Server resolves and snapshots both Agent/device identities, checks authorization and `local_file_request.v1`, redacts purpose text, and queues an internal inspect command.
3. Recipient connector safely resolves the relative path under a configured root, stages a snapshot, calculates size/SHA-256, and performs deterministic path/content classification without returning bytes or secret matches.
4. Safe files proceed to upload. Sensitive or uncertain files enter forced human approval.
5. Approval details contain both sides' Agent/device IDs and names, redacted request content, display path, size/hash, and sensitivity reasons.
6. Approval queues a release command bound to the immutable manifest. Rejection terminates the request.
7. Connector uploads the staged bytes. Server verifies device identity, request state, size and SHA-256, creates a private file record, and marks the request complete.

## State Machine

`queued_inspection -> inspecting -> awaiting_approval | uploading | failed`

`awaiting_approval -> queued_release | rejected | expired`

`queued_release -> releasing -> uploading | failed`

`uploading -> completed | failed`

## Trust Boundaries

- Server authenticates Agents/devices and owns lifecycle/approval state.
- Connector owns filesystem resolution and must fail closed independently.
- Human approval authorizes one immutable manifest only.
- Notification delivery is informational and never grants authorization.

## Path Model

The server addresses `root_id + relative_path`; the connector alone knows each root's absolute local path. Zero roots are shared by default. The connector rejects absolute paths, parent traversal, symlinks/reparse points, filesystem special files, and paths outside the root.

## Sensitivity

Deterministic path/name rules cover environment files, SSH/GPG/cloud/Kubernetes credentials, browser/keychain/password stores, private-key names/extensions, shell history, wallets, dumps, and Agent Hub credentials. Content rules cover PEM private keys, known token formats, JWT/bearer values, credential assignments, connection strings, and scanner uncertainty. Rules return safe reason codes only.

## Approval

`local_file_access` approvals bypass generic auto-allow/auto-block policy. They start pending and may be decided only by the authenticated owner of the recipient device. The approval subject hash binds the full immutable manifest and identity snapshot. Approval is short-lived and single-use.

## Compatibility

Older connectors do not advertise `local_file_request.v1` and are rejected with a clear unsupported-capability response. This prevents silent unsafe fallback. Future connectors implement the same typed prepare/classify/release contract.

Self-hosted deployments using `AUTH_MODE=workspace_token` may use the workspace token as the human owner credential for device pairing and local-file approval, even when a newly created workspace carries `require_login=true`. Such devices are recorded with owner `token`; only the workspace token receives the narrow `local_file_access` owner exception. Hosted/Firebase mode still requires an authenticated member identity. Legacy non-login workspaces retain their existing token behavior.
