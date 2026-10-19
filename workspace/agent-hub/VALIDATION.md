# Agent Hub validation

Baseline: `195c93e3f3c2fa89582a08dcc7ce17b0709b02ac`, upstream `develop`.

- Native GitHub fork created as `zaiyemeiyou404/agent-hub` without a naming collision.
- All 509 advertised refs matched upstream at creation: 382 branches, 110 tags plus annotated-tag dereferences; 3,560 commits reachable from `develop`.
- Original license and copyright files retained.
- Connector targeted suite on Node 24 / Windows, isolated home directory: 146 passed, 1 skipped, 0 failed.
- `bash -n scripts/agent-hub-init.sh`: passed on Ubuntu 22.04 / WSL.
- Environment initialization and Docker Compose configuration parsing: passed.
- `node --check workspace/agent-hub/custom-agent.cjs`: passed.
- Existing `.env` overwrite refusal verified, including a byte-for-byte hash comparison.
- Ubuntu / Python 3.12 / Node 22: **147 connector tests and 281 backend tests passed**, no skips/failures. [Successful run](https://github.com/zaiyemeiyou404/agent-hub/actions/runs/39239126850).
- Upstream sync workflow enabled and manually executed successfully. The branch was already current; this verifies its fetch/tag/no-change path, not the future changed-upstream PR/conflict path. [Successful run](https://github.com/zaiyemeiyou404/agent-hub/actions/runs/39239164263).
- The twelve other inherited workflows were disabled in repository settings; original workflow source files remain intact.

- **Complete Linux Docker deployment passed**: backend and frontend images built, PostgreSQL became healthy, Alembic migration completed, backend readiness returned `database: ok`, frontend HTTP succeeded, and the custom agent joined/polled/replied/uploaded/downloaded a report containing the request marker. [Successful full-stack run](https://github.com/zaiyemeiyou404/agent-hub/actions/runs/39239341022).
- The disposable CI deployment was removed after verification. There is no permanent hosted instance or user server deployment.

No live model calls have been made. Provider credentials and a destination Linux server have not been supplied.
Automatic routing/review tests use mocked model responses; real Codex/OpenCode inference and automatic coordination with a real provider remain operator acceptance steps.
