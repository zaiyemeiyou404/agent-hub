# T02 Windows candidate validation — 2026-10-25 (Asia/Shanghai)

## Result and exact candidate

The reviewed core-source drift fix and native first-run service configuration
passed the Windows checks below. This is not full product/release acceptance.
ZAI-15/T00 and ZAI-16/T01 remain In Review; ZAI-17/T02 is ready for review,
with real pairing, Linux execution and human release review still outstanding.

Base PR #5: `0900e8cb623669e62e7f60d3217db41926c9523f`.
PR #4 remains `b2ba9e6d0c706f90816948fb131e6bb41a5569fb`.
Frozen runtime source: `23e5af4e7ed20f37bc16f499a4dadbd33cdb236c`.
Subsequent documentation-only commits do not change the tested code. The
installer manifest deliberately reports the frozen runtime SHA, not a later
documentation commit. Candidate branch: `codex/zai-17-verified-core`.

Evidence root: `G:\codex日常\tmp\aghub-win-t02-23e5af4e`.
Earlier rejected attempts are preserved in `aghub-win-t02-0d356593`,
`aghub-win-t02-37236943` and `aghub-win-t02-final` under the same parent.
Only the 23e5af4e installation is the final tested candidate.

## Environment and immutable artifacts

Windows 11 Home Chinese x64, build 10.0.26200; build Node 24.14.0 / npm 11.9.0;
Electron 42.3.3 / electron-builder 26.15.0; Launcher 1.1.1;
repository Connector 0.2.196. Test runtime Node v24.21.0 was copied from the
previous dedicated test profile, together with the deliberately newer upstream
0.2.204 cache. Application userData was new and contained no account/pairing.

| Artifact | SHA-256 / result |
| --- | --- |
| Fresh `git archive 23e5af4e` source.tar | `9350A1EA6E3AD63FF379A218D5F02D394DF0E1004FE0259B33CB6C3F4F8A93E2` |
| `artifacts/AgentHub-1.1.1-win-x64.exe` | `87D648A4FEC91A94A37C84DE7C890DFF339F88E1E5883AC231C301FBA475894E`; 120312173 bytes; NotSigned |
| Installed `AgentHub.exe` | NotSigned; installed in `installed 中文 space` on G: |
| Embedded/external core manifest | both identical; `bc9defa70ecdd89992446771acb442e11912d8a35f6d1eb5eb7c89ae2fabdf8f`; 219 controlled files |
| `artifacts/aghub-connector-23e5af4e.tar.gz` | `A68CBC8FC9F2B809C9D4BA26E06B556E4DFC091623556C3D0F9D62DBF8744126` |
| Intentionally retained official 0.2.204 package.json | unchanged `2100CC9788F27FC131E10469099AFB5BB9D53D9EF8C902883123D896C1D3A988` |

## Commands and observed outcomes

All heavy files/cache/logs are on G:. The original repository and Android
artifacts were not modified. Fresh archive directories had no node_modules.
`install-dependencies.ps1` and `build-unsigned.ps1` in the evidence root record
the exact environment and commands. Relevant operations:

```text
git archive --format=tar --output <evidence>/source.tar 23e5af4e7ed20f37bc16f499a4dadbd33cdb236c
npm ci --prefer-offline --foreground-scripts --no-audit --no-fund
# separately in workspace/frontend, packages/agent-connector and packages/launcher
npm run typecheck
AGHUB_SOURCE_SHA=23e5af4e7ed20f37bc16f499a4dadbd33cdb236c npm run build
node node_modules/electron-builder/cli.js --win nsis --x64 --publish never --config.win.signAndEditExecutable=true --config.win.signExecutable=false --config.forceCodeSigning=false --config.directories.output=<evidence>/artifacts
AgentHub-1.1.1-win-x64.exe /S /CURRENTUSER /D=<evidence>/installed 中文 space
```

`CSC_IDENTITY_AUTO_DISCOVERY=false`, signing credential variables removed.
`signAndEditExecutable=true` edits the owned icon/ASAR integrity resource;
`signExecutable=false` skips actual signing. NSIS install and app executable
were independently checked as NotSigned. No keys/certificates or publication.
Clean dependency installs succeeded (586 frontend, 2 Connector, 667 Launcher
packages); typecheck, shared Vite and Electron main/preload/renderer builds
passed. afterPack verified the entire core before generating NSIS.

Installed application launch used a fresh task-only HOME/USERPROFILE/APPDATA/
LOCALAPPDATA/userData and process-scoped sanitized environment. The installed
path contains Chinese characters and spaces. Native Windows computer use
observed the actual first-run form, entered API/auth
`http://127.0.0.1:18000`, web `http://127.0.0.1:13000`, enabled explicit local
development and saved. Saved settings.json was read back. After stopping only
the task-owned app/daemon processes and relaunching the same installation,
the three addresses and dev flag were unchanged and visibly repopulated when
opening Service settings. This was a process restart after confirmed disk
write, not an installer upgrade or a claim about account migration.

Launcher startup log, daemon.status.json and installed CLI `core-info` all
reported version 0.2.196, source `23e5af4e7ed20f37bc16f499a4dadbd33cdb236c`
and the same installed `resources/aghub-core` directory. The newer official
cache remained on disk with identical hash. It was neither adopted nor deleted.
No full packet capture or OS-wide offline test was performed; startup source
selection is supported by the exact packaged code and the three runtime records.

Guide installation used an empty task-only npm global prefix, `npm link` from
the candidate Connector cwd, then the resulting `agn.cmd --help` (exit 0).
The junction points to this source archive. Source-link mode is explicitly
unverified development (`sourceSha:null`). The installed managed CLI independently
passed `--help` and `core-info`. Appending a comment to the installed main core
file caused `core-info` to exit 1 with `Core hash mismatch: src/index.js`.
The original bytes were restored in a finally block; identical hash and CLI
exit 0 were confirmed. Task-owned test processes remaining: 0.

## Automated checks and baseline failures

| Check | Outcome |
| --- | --- |
| Final Launcher complete `npm test` | 99 files; **974 passed / 12 skipped** |
| Launcher `npm run typecheck` | passed |
| Shared frontend complete `npm test` | **529 passed** |
| Manifest/runtime/identity targeted checks | passed; missing/changed/extra files, unsafe paths, symlinks, higher official cache, Chinese/spaced paths |
| Build staging, actual electron-builder resource copy, out-of-repo validator bundle | **3 passed** |
| Connector affected daemon/identity/updater/GitHub checks | **87 passed** |
| Full Connector in synthetic HOME + task-only temporary transport | **2046 passed / 6 failed / 65 skipped**; not all green |

The first normal full Connector run hit the existing 18000 test service and
inherited machine state. A scratch-only test preload remapped fixture HTTP
traffic to ephemeral ports while preserving the fixed logical dev origin;
production HTTP validation was not widened. The same clean environment and
preload were run against frozen original PR #5 source: **2058 passed / 7 failed /
65 skipped**. Candidate failure names are a subset of those baseline failures:

* `mini.test.js`: `_stopProcess signals the process (group) with SIGTERM`.
* `probe.test.js`: declared CLI stdout success, endpoint out-of-credit reason,
  healthy-endpoint CLI timeout verdict, vague-endpoint CLI timeout verdict.
* `skill-installer.test.js`: injected `cat` path resolves SKILL.md (cat ENOENT).

Baseline additionally failed `openworker.test.js` live-turn interruption;
that timing-sensitive test passed in the final candidate run. Different total
counts include removal of obsolete npm updater behavior tests and new ownership/
integrity tests. These are not represented as full Connector green.

## Review, packaging failures and limitations

One independent read-only review requested changes to the initial 0d356593
implementation. The fix pass added failing-then-passing tests for retained raw
validator require, command/quit ownership bypass, stale status/PID mismatch,
disabled-updater cache access and unhashed ws optional addons. Native addon
tests use real ws files and a marker-producing external addon. The first broad
directory-copy fixture caused a Windows Node native process failure; it was
narrowed, the missing protection reproduced, and the fixed behavior passed.

Real artifact inspection caught electron-builder excluding a resource-root
node_modules tree. A regression using the actual copier now reproduces the
failure, explicit mapping retains dependency/notice files, and afterPack fails
the build if staged/core resources diverge. Earlier incomplete packages were
not accepted; task-only old installations were uninstalled, logs retained.
The first old CLI update regression was insufficiently isolated and attempted
global npm before being rejected by filesystem permissions. No package was
present at the attempted global destination; subsequent regression subprocesses
block network/package mutation and use task-only configuration.

Known diagnostic limitation: during the brief interval between spawning the
owned daemon and its first status write, a settings:set/tray refresh can log
`Incompatible daemon identity/PID`. It fails closed and then recovers after the
matching status arrives; the tested service save/restart succeeds. This startup
diagnostic remains to refine and is not hidden as a clean startup log.
The implementation also permits vendor Node bootstrap before fatal core
verification. Staging hashes installed dependency bytes; lock provenance relies
on the recorded fresh npm ci, not a claim that staging rechecks tarball integrity.

Linux server bundle was built on Windows but **not executed on Linux**.
Own macOS/Linux desktop icons, upgrade compatibility and explicit legacy user
data import remain unverified; T09 handles import. Upstream copyright/license
metadata and notices are retained. Unsigned manifests detect drift/corruption,
not publisher authenticity if someone replaces the whole unsigned application.

Read-only isolated service checks: frontend /, backend /health and /ready all
200; public application table count is 0, no one-time pairing code exists.
**Real pairing and fresh backend device heartbeat: NOT TESTED.** No schema
initialization, migration, account/workspace creation or API credential entry.
No production/preview change, signing/release, merge or Done transition.
