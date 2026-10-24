# T02: verified repository core

The installed Launcher must execute the Connector built from this repository,
regardless of a newer upstream cache. Build a separate core resource and a
SHA-256 manifest from the source tree and locked runtime dependencies. Embed
the trusted manifest in app.asar; keep an identical external copy for the
standalone CLI and compare it before spawning. A missing, modified, symlinked,
or unexpected executable file fails closed. No registry fallback is allowed.

Launcher, daemon and CLI report the same version, source commit and directory.
Existing incompatible daemons block new dispatch; they are not killed. Retain
the legacy configuration directory for compatibility; do not silently migrate
or delete data. Packaged builds never accept a developer core override.

The implementation uses existing Node/Electron/TypeScript tooling. Vendor Node
and optional agent downloads remain distinct from the forbidden upstream core
download. Updates require a separately reviewed AgentHub build. No publishing,
database operations, signing, merging or Done transition is authorized.

Alternative rejected: pin an official npm version or prefer its cache. Neither
proves that the running code is the candidate repository source. Updating T01
in place would also erase the acceptance boundary, so use a separate T02 branch
based on PR #5 0900e8cb623669e62e7f60d3217db41926c9523f.

Full task specification: Linear ZAI-17, read 2026-10-24. Product identity and
installation entry points must also stop offering upstream core updates.
