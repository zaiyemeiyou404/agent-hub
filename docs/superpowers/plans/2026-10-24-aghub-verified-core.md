# AgentHub verified core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows Launcher, daemon and CLI use the exact repository core.

**Architecture:** Build a fixed core directory with a closed SHA-256 manifest;
embed the manifest in the app and resolve only that directory. Share validation
between build, Launcher and CLI. Disable independent upstream core updates.

**Tech Stack:** Node CommonJS, TypeScript, Electron, Vitest, NSIS.

**Spec:** docs/aghub/t02-core-design.md and Linear ZAI-17.

## Global Constraints

Preserve configuration and licenses. No production/preview, schema migration,
signing, publishing, merge or Done. G drive artifacts. Windows x64 NSIS first.
Use owned appId com.zaiyemeiyou.aghub and repository-local Connector identity.

## Review Focus

1. Equal versions with different bytes must be rejected by file hashing.
2. Extra files, traversal and symlinks must not escape the controlled tree.
3. A new global cache must never become a fallback after corruption.
4. Existing daemon identity mismatch must stop dispatch without killing it.
5. Chinese/spaced install paths and npm's shebang normalization must work.

### Task 1: Manifest and build resource

Files: Connector src/core-integrity.js; Launcher agents/core-manifest.ts,
core-manifest.test.ts; scripts/prepare-aghub-core.mjs and its executable test.

Produces resolveVerifiedCore(manifest, packagedRoot) -> directory, version,
sourceSha, entrypoints. Manifest fields: schemaVersion, connectorVersion,
sourceSha, hashes, entrypoints. Cover missing entry/hash mismatch/extra file,
bad schema/path/symlink, exact file bytes and Chinese/spaced directories.

- [ ] Write filesystem fixture tests; run npm test -- src/main/agents/core-manifest.test.ts and observe failures.
- [ ] Implement strict closed-tree verification and deterministic staging from repository Connector plus locked ws/blessed, never registry core.
- [ ] Verify tests green and stage a core, then tamper and verify rejection.
- [ ] Commit manifest implementation and tests.

### Task 2: One runtime and daemon source

Files: agents/runtime.ts/runtime.test.ts, daemon-process.ts, agent-manager.ts,
index.ts, github-bridge.ts, Connector daemon.js and CLI entry.

Consumes Task 1 resolver. Produces getVerifiedCore() with fixed packaged roots;
daemon status includes core identity and existing incompatible daemon blocks.

- [ ] Replace old precedence tests with bundled-only behavior and explicit development opt-in tests; observe old implementation fail.
- [ ] Remove registry bootstrap/update/status lookups and global module loading; use one verified source for all entrypoints and icons.
- [ ] Test daemon identity match/mismatch and absence without process termination; test CLI verification failure before command execution.
- [ ] Run Launcher targeted tests, whole suite, typecheck and build; commit.

### Task 3: Owned CLI/install identity and no upstream updater

Files: Connector package/lock, update-check.js and tests, cli.js; Launcher
package/lock/packaging; scripts/install.ps1/install.sh; install-candidate.md.

- [ ] Test update check returns disabled without network and update cannot spawn npm; test local install entry rejects missing/unverified candidate before mutation.
- [ ] Use own package/repository/product identity, preserve upstream copyright, fixed NSIS artifact; remove old remote installation/update paths.
- [ ] Run Connector suite and requested registry/pairing-network tests plus Launcher suite/build; commit.

### Task 4: Windows acceptance and writeback

Files: docs/aghub/t02-validation.md, G drive evidence directory.

- [ ] Build unsigned NSIS from a clean candidate source; record SHA/versions and install to a task-specific G path.
- [ ] Launch with a fresh profile and preexisting newer upstream cache; verify Launcher/daemon/CLI manifest identity and no upstream core lookup.
- [ ] Configure explicit API/Web/Auth, restart and inspect retained values; no DB writes or migrations. Pairing remains untested if no isolated ready schema/code.
- [ ] Review whole branch, write factual evidence to ZAI-17 and related ZAI-16/ZAI-15, leave review status and unmet gates explicit.
