# Runtime capabilities (ZAI-19 / T04a)

Capability verification for the Codex and OpenCode adapters. This record separates a code path that exists in the adapter from a live CLI run that exercised it.

T04b remote approval integration is out of scope. No approval callback, workspace permission protocol, or remote reject/resume chain is added here.

## Baseline

| Field | Value |
| --- | --- |
| Repo | https://github.com/zaiyemeiyou404/agent-hub.git |
| Branch | `feat/secure-local-file-requests` |
| Known commit at task start | `d32e46c8011dbc6d04735cb612b84ec498943041` |
| Re-verified local HEAD | `d32e46c8011dbc6d04735cb612b84ec498943041` |
| Re-verified `origin/feat/secure-local-file-requests` | `d32e46c8011dbc6d04735cb612b84ec498943041` |
| Baseline delta | none |

Re-verified before the ZAI-19 commit. Subject of that tip: `docs: 将 AgentHub 产品计划切回 GitHub 基线`.

Work branch: `feat/zai-19-runtime-capabilities`. `main` is untouched.

## How to read the matrix

| Status | Meaning |
| --- | --- |
| `WIRED` | Adapter source starts this capability when the CLI can run. |
| `BYPASSED` | Adapter turns the CLI feature off with a flag. Prompts are skipped. |
| `ABSENT` | Adapter has no request/response path for this capability. |
| `NOT_READY` | Live probe on 2026-10-24 did not reach a successful observation. |
| `UNSUPPORTED` | Probed CLI build is outside the adapter's supported range. |
| `LIVE_VERIFIED` | An authenticated run on the probe host exercised the capability. |

No cell in this record is `LIVE_VERIFIED`. The machine-readable copy is `packages/agent-connector/src/adapters/runtime-capabilities.js`. Tests in `packages/agent-connector/test/runtime-capabilities.test.js` lock the flags, the mode switch, the 401 / free-tier disposition, and the rule that this probe cannot be marked verified.

## Probe host

Evidence is the attached bundle from the grok-bot Linux host, probed at `2026-10-24T16:38:09.803512+08:00`:

- `summary.json` — structured status
- Codex exec excerpt — `codex-cli 0.164.0` JSON events ending in 401 / `Not logged in`
- Host excerpt — OpenCode `1.4.7` free-tier failure on a headless run
- `opencode run --help` — CLI surface for run, session, and permissions

This cloud workspace re-checked the git tip and confirmed `codex`, `opencode`, `~/.codex/auth.json`, and the OpenCode auth files are absent. It did not install either CLI, did not log in, and did not re-run the live exec. Versions and outcomes below are from that bundle.

Request ids, cf-ray ids, thread ids, and session ids from the raw logs are omitted.

## Codex

### Versions

| Source | Value |
| --- | --- |
| Probed package | `@openai/codex` via `npx` (binary not on `PATH`) |
| Probed version | `codex-cli 0.164.0` |
| Unrelated npm package `codex` | `0.2.3` (Jake Luer). That package is not this adapter. |
| Adapter pin | none. Registry install is `npm install -g @openai/codex` (floating). |
| Resume flag order comment | checked against codex-cli `0.154.0` in `codex.js` |

### Chosen integration mode

Primary mode is a CLI subprocess, one `codex exec` per workspace message.

`CodexAdapter` selects CLI mode when a binary is found and any of these hold:

- no `OPENAI_BASE_URL`, or the base URL contains `api.openai.com`
- no `OPENAI_API_KEY` (subscription / `codex login`)
- `CODEX_WIRE_API=responses` with an API key and a non-OpenAI base URL (custom provider passed as `-c` overrides; nothing is written to `~/.codex/config.toml`)

Direct mode is the fallback: `OPENAI_API_KEY` plus a non-OpenAI base URL without `CODEX_WIRE_API=responses`. It calls `POST {base}/chat/completions` with `stream: true` and no `tools` field. It has no sandbox, no command execution, and no thread resume. History is an in-memory list capped at 50 user/assistant pairs. Direct mode is outside the tool matrix.

Binary search order in `_findCodexBinary`:

1. `~/.openagents/runtimes/codex/node_modules/.bin/codex`
2. `~/.openagents/nodejs/node_modules/.bin/codex`
3. `PATH` via `whereBinary('codex')`
4. directory of the current Node binary
5. `npm config get prefix`
6. `~/.local/bin`, `~/.npm-global/bin`, Homebrew, `/usr/local/bin` (Windows: `%APPDATA%/npm/codex.cmd`)
7. WSL via `resolveWslBinary('codex')`

### Real call interface (CLI mode)

```text
codex exec \
  --json \
  --dangerously-bypass-approvals-and-sandbox \
  --skip-git-repo-check \
  [-m <model>] \
  [-c model_provider=openagents ...] \
  [-C <workingDir>] \
  [resume <threadId>]
```

The prompt is written to stdin, then stdin is closed. Stdout is newline-delimited JSON. Resume is appended after `-m`, `--json`, the bypass flag, and `-C`. Putting `-C` after `resume` fails on the CLI (`unexpected argument '-C'`).

Events the adapter handles:

| Event | Effect |
| --- | --- |
| `thread.started` | Stores `thread_id` for that channel immediately, including when the turn later fails |
| `item.completed` + `agent_message` | Assistant text |
| `item.completed` + `command_execution` | Tool/command status (`command`, `exit_code`, `output`) |
| `item.completed` + `file_change` | Edit status (`changes[].path`, legacy `filename`) |
| `turn.failed` | Failure. Counts as an early end even when the process exit code is 0 |
| `error` | Logged. A recovered retry (`Reconnecting...`) is an early end only together with `turn.failed` or a non-zero exit |

`item.type === 'error'` is ignored by the tool branch. There is no branch for an approval request.

Registry readiness (`registry/codex.json`) accepts `OPENAI_API_KEY` + `OPENAI_BASE_URL`, or `codex login status`. The not-ready string is `Not configured. Set OPENAI_API_KEY + OPENAI_BASE_URL, or run: codex login`.

### Capability matrix

| Capability | Code path | Live probe |
| --- | --- | --- |
| Tool call | `WIRED` — `command_execution` / `file_change` on the JSON stream | `NOT_READY` |
| Approval | `BYPASSED` — every exec passes `--dangerously-bypass-approvals-and-sandbox` | `NOT_READY` |
| Approval reject | `ABSENT` — `--approve-for-me` and `--sandbox` are never passed; no reject callback | `NOT_READY` |
| Cancel | `WIRED` — workspace Stop kills the child (see below) | `NOT_READY` |
| Resume | `WIRED` — `codex exec ... resume <threadId>` | `NOT_READY` |

### Live evidence (2026-10-24)

- `~/.codex/auth.json` absent.
- Structured probe field `openai_api_key_env`: unset.
- `codex login status` printed `Not logged in`.
- Minimal `codex exec` read a prompt from stdin and emitted JSON: `thread.started`, `turn.started`, repeated `error` events, then `turn.failed`.
- Failure text: `unexpected status 401 Unauthorized: Missing bearer or basic authentication in header` against `wss://api.openai.com/v1/responses`, then the same 401 on `https://api.openai.com/v1/responses`.
- Process exit code: `0`.
- No `command_execution` or `file_change` event. No approval prompt. No cancel of a running tool. No second turn that resumed the thread.

Adapter behavior on that shape (covered by tests, fixture transcript, not a live CLI):

- `_endedEarly({ exitCode: 0, turnFailed: true })` is true, so exit 0 is still a failure.
- `_failureDetail` surfaces the 401 / missing-bearer sentence.
- Exit code 0 with empty text does not take the stale-thread retry. The saved thread id stays.
- A `thread.started` event that arrives before `turn.failed` is persisted. The next message will pass `resume <that id>` first.

### Cancel and resume wiring

Workspace Stop is a control action `stop`. `BaseAdapter._handleUserStop` mutes the channel and calls `_stopChannelWork`, which calls `CodexAdapter._stopProcess`:

- Windows: `taskkill /F /T /PID <pid>`
- Other platforms: `SIGTERM` to the process group (`process.kill(-pid)`), then `SIGKILL` after 5s. `spawn` uses `detached: true` so the group can be signalled.

`CodexAdapter` does not override `stop()`. Daemon shutdown calls `adapter.stop()`, and the base implementation only sets `_running = false`. It does not signal the child. A detached Codex process can outlive that path. Workspace Stop is the path that kills it.

Signal death reports exit code `null`. With empty text and a saved thread id, `_handleViaSubprocess` treats `exitCode !== 0` as a stale thread, deletes the id, and tries a fresh exec. The second `_spawnCodex` checks `_stoppedBeforeStart` and refuses to start when Stop landed during the turn. The id is already gone, so the next user message starts a new thread.

CLI `resume` / `fork` / `--last` exist in `codex exec` help (0.164.0). The adapter uses only `resume <threadId>`. It does not use `fork` or `--last`.

`BaseAdapter` also resumes a workspace poll cursor from `~/.openagents/cursors/`. That cursor is the event stream, not a Codex thread.

### Limits

- CLI mode skips approval prompts. A live reject cannot be observed while that flag is set, and this task does not remove it.
- Direct mode cannot run tools.
- The probed process exited 0 on auth failure. Callers that treat exit 0 as success will mis-read the transcript. The adapter uses `turn.failed` as well as the exit code.
- Thread ids are stored before the turn succeeds.

## OpenCode

### Versions

| Source | Value |
| --- | --- |
| Probed binary | OpenCode `1.4.7` |
| Adapter pin (`OPENCODE_PINNED_VERSION`) | `1.17.11` |
| Adapter floor (`OPENCODE_MIN_VERSION`) | `1.17.0` |
| Adapter tested max | `1.17.11` (`degraded` above that, run still allowed) |
| Registry install | `npm install -g opencode-ai@1.17.11` |
| `_classifyVersion('1.4.7')` | `unsupported` |

A run through the adapter against 1.4.7 stops in preflight with `unsupported_version` and does not spawn. The live probe invoked the CLI directly, so it reached the provider error instead of that gate.

### Chosen integration mode

One subprocess per message:

```text
opencode run --format json --dir <cwd> --model <provider/model> [--session <sessionId>]
```

There is no direct HTTP fallback. The prompt is written to stdin and stdin is closed. On the first turn the prompt includes the workspace system context. On a resumed session the prompt is the user message only.

`--dir` and the spawn `cwd` are the agent `workingDir`, or `~/.openagents/agents/<agentName>/` when no working directory is configured. OpenCode confines file tools to that directory. The adapter comment records that a tool reaching outside it is auto-rejected by OpenCode with `user rejected permission`.

Custom OpenAI-compatible gateways are declared in `<cwd>/.opencode/opencode.json` under provider id `openagents-gateway` (`@ai-sdk/openai-compatible`, `/chat/completions`). The API key is referenced as `{env:OPENAI_API_KEY}` and is not written into the file.

Model flag is required. `opencode run` without `--model` waits for an interactive picker until the idle watchdog kills it. The adapter reads `OPENCODE_MODEL` or `LLM_MODEL`. A value that already contains `/` is passed through. Otherwise it becomes `openai/<model>`, `anthropic/<model>`, or `openagents-gateway/<model>`.

### Real call interface

JSON events the adapter reads:

- Text on `part.text` / `part.content` (control types `step_start`, `step_finish`, `tool_use`, `tool` contribute no assistant text)
- Tool events: top-level type `tool_use` or `tool`, or `part.type === 'tool'`
- Session id from `sessionID`, `session.id`, or `part.sessionID`, stored per channel
- Structured `error` events, classified by `_classifyFailure`

`opencode run --help` on the probed CLI also offers `-c/--continue`, `-s/--session`, `--fork`, `--format json|default`, and `--dangerously-skip-permissions` (default false). The adapter passes `--session` and `--format json`. It does not pass `--continue`, `--fork`, or `--dangerously-skip-permissions`.

Credential preflight (`_credentialState`):

- A known provider API key, or a non-empty OpenCode auth/config file, is `present`.
- A model whose provider is neither `openai` nor `anthropic` (including `opencode/big-pickle`) is `unknown` and is allowed through. OpenCode Zen free models are expected to need no local key.
- No key, no file, and no such model is `missing` (`credential_missing`).

### Capability matrix

| Capability | Code path | Live probe |
| --- | --- | --- |
| Tool call | `WIRED` on CLI `>= 1.17.0` via `--format json` tool events. Probed `1.4.7` is `UNSUPPORTED` at the adapter floor | `NOT_READY` |
| Approval | `ABSENT` — `--dangerously-skip-permissions` is not passed; no prompt protocol | `NOT_READY` |
| Approval reject | `ABSENT` — no adapter hook for OpenCode's own `user rejected permission` | `NOT_READY` |
| Cancel | `WIRED` — workspace Stop and `adapter.stop()` both signal the child | `NOT_READY` |
| Resume | `WIRED` — `--session <id>` for the same `--dir` | `NOT_READY` |

### Live evidence (2026-10-24)

- OpenCode auth file absent.
- `opencode models` listed free `opencode/*` models, including `opencode/big-pickle`.
- A headless `opencode run` selected `providerID=opencode` `modelID=big-pickle` and failed before any tool event.
- Error name in the log: `AI_APICallError`. User-visible text: `OpenCode's free tier can only be used from within OpenCode.` The summary names this `FreeTierError`.
- The banner (`build · big-pickle`) matches default formatted output. The probe did not show a `--format json` tool stream.
- `_classifyFailure` on that stderr (no structured stdout error) returns `unknown_error`. There is no free-tier category. The category is a failure classification, not a completed tool call.

### Cancel and resume wiring

`OpenCodeAdapter._stopProcess`:

- Windows: `SIGINT`, then `taskkill /F /T /PID` after 1.5s
- Other platforms: process-group `SIGTERM`, then `SIGKILL` after 1.5s
- Idle watchdog (5 minutes with no stdout/stderr) calls the same helper

`stop()` kills in-flight children (`_stopAllProcesses`) and then calls `BaseAdapter.stop()`. Workspace Stop uses the same `_stopProcess` via `_stopChannelWork`. Spawn is `detached: true` off Windows.

Resume stores the session id in `~/.openagents/agents/<agent>/sessions.json`, or `sessions-<workingDir slug>.json` when a working directory is set. An id is valid only for the `--dir` that created it. `--continue` and `--fork` from the CLI help are unused.

Poll-cursor resume in `BaseAdapter` is the workspace event cursor, not an OpenCode session.

## Repro commands

Recorded shape of the 2026-10-24 probe. This workspace did not re-run them.

```bash
# Codex — version, login, non-interactive exec.
# Use @openai/codex. The npm package named "codex" is a different project.
npx --yes @openai/codex --version
# observed: codex-cli 0.164.0

npx --yes @openai/codex login status
# observed: Not logged in

# Prompt on stdin. Observed stdout starts with thread.started / turn.started
# and ends with turn.failed 401. Observed process exit code: 0.
npx --yes @openai/codex exec --json --skip-git-repo-check -
```

```bash
# OpenCode — version, model list, headless run.
opencode --version
# observed: 1.4.7

opencode models
# observed: opencode/* free models, including opencode/big-pickle

opencode run --help
# shows --format json, --session, --continue, --fork,
# --dangerously-skip-permissions (default false)

opencode run --model opencode/big-pickle
# observed: FreeTierError / "free tier can only be used from within OpenCode"
```

Adapter invocations once auth and a supported CLI exist (these were not run live):

```bash
codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C <dir> -m <model>
# follow-up: the same flags, then `resume <threadId>`

opencode run --format json --dir <dir> --model <provider/model>
# follow-up: add `--session <sessionId>`
```

## Blockers handed to T04b

1. Codex live tool, approval, cancel, and resume are `NOT_READY`. The probe host has no Codex login (`Not logged in`, auth file absent, exec 401 missing bearer). Exit code was 0.
2. OpenCode live tool, approval, cancel, and resume are `NOT_READY`. Headless `opencode run` on 1.4.7 died with the free-tier error before a tool event. `opencode models` succeeding is not a tool call.
3. The probed OpenCode CLI is `UNSUPPORTED` by the adapter (`1.4.7` < `1.17.0`). The integration target is `opencode-ai@1.17.11`. A T04b run has to use a CLI at or above 1.17.0 or preflight will refuse to spawn.
4. Codex approval is bypassed in code (`--dangerously-bypass-approvals-and-sandbox`). Reject is absent. T04b needs a real approval channel. Removing the bypass flag is a product change with its own sandbox story; this task leaves the flag in place.
5. OpenCode approval and reject are absent. The CLI flag `--dangerously-skip-permissions` exists and defaults to false. The adapter does not pass it, and it has no stdin protocol to answer a permission prompt. Out-of-directory tools are rejected inside OpenCode (`user rejected permission`) with no adapter hook.
6. Cancel is process-group kill, not a runtime cancel RPC. Codex `adapter.stop()` (daemon shutdown) does not signal the child. A Codex turn killed with exit code `null` and no text drops the saved thread id before the stopped follow-up spawn is refused.
7. Resume is local CLI state (`thread_id` / `--session`), scoped to the Codex home or the OpenCode `--dir`. It is not a remote approval resume. `BaseAdapter` cursor resume is a different mechanism.
8. Direct Codex chat-completions mode has no tools. It cannot host an approval chain.

## Items not executed

- Live Codex tool call, approval, reject, cancel, and resume on an authenticated CLI.
- Live OpenCode tool call, approval, reject, cancel, and resume on a headless provider that accepts the run.
- Any T04b remote approval implementation.
- Re-running the grok-bot probes from this workspace (CLIs are not installed; installing or logging in was out of scope).
