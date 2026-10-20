# Agent Hub Engineering Contract

## Development rules

- Non-trivial security, protocol, storage, or multi-subsystem changes require an OpenSpec change under `openspec/changes/` before implementation.
- New behavior follows test-driven development: targeted tests must fail for the missing behavior before production code is added.
- Security decisions must be enforced by server and connector code, not by model prompts alone.
- Unknown protocol versions, missing capabilities, classifier failures, and malformed identities fail closed.
- Git changes are developed and pushed only on feature branches.

## Verification ladder

1. Targeted backend/connector tests.
2. Full affected-package test suites.
3. Backend and frontend type/lint/build checks.
4. A live end-to-end smoke test for the changed protocol.
5. Security review of authentication, authorization, path handling, redaction, replay, and audit data.
