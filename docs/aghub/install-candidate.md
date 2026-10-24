# AgentHub candidate: build from source

This is the ZAI-17 core review candidate, not a published installer release. There
are no owned Windows/macOS/Linux installer downloads or automatic install
scripts for this candidate yet. Do not substitute an upstream release.

## Connector / CLI

Install Git and Node.js 20 or later, then run these commands in PowerShell,
bash or zsh. Choose a writable working directory first.
Use a writable npm global prefix whose executable directory is on `PATH`.
`npm prefix -g` prints that prefix: Windows uses the prefix itself for command
shims; macOS/Linux use its `bin` subdirectory. A custom prefix needs its own
`PATH` entry in the current shell before running `agn`.

```text
git clone --branch codex/zai-17-verified-core --single-branch https://github.com/zaiyemeiyou404/agent-hub.git aghub
cd aghub
npm --prefix packages/agent-connector ci
cd packages/agent-connector
npm link
cd ../..
agn --help
```

Run `npm link` **inside** `packages/agent-connector`. The `--prefix` option also
changes npm's global destination, so using it on `npm link` can report success
while linking back into the source tree and leaving the configured global
command directory empty.

`npm link` installs `agn` from this checkout into the configured npm global
prefix. If the global prefix is not writable or `agn` is not on `PATH`, run the
local CLI from the repository root after the
`npm --prefix packages/agent-connector ci` step:

```text
node packages/agent-connector/bin/agent-connector.js --help
```

In subsequent CLI examples, replace the leading `agn` with
`node packages/agent-connector/bin/agent-connector.js` when using this local form.
Record `git rev-parse HEAD`
when reporting results because the candidate branch can receive review fixes.
Agent runtime installation and credentials remain separate prerequisites.

## Desktop source build

From the same checkout:

```text
npm --prefix workspace/frontend ci
npm --prefix packages/launcher ci
npm --prefix packages/launcher run build
npm --prefix packages/launcher run preview
```

This starts the local Electron build, without publishing or signing an installer.
An installed desktop candidate must include the generated `dist-desktop` bundle.

## Configure your own service

On first opening the web or embedded workspace, enter API, web and authentication
origins in **Service settings**. Use three explicit HTTPS origins (they may be
equal), with no credentials, path, query or fragment. Saving signs out the old
session and reloads. The settings button stays available after configuration.
The browser stores only these origins locally; desktop settings are saved by the
desktop host. The desktop must be rebuilt to support the settings-save bridge.

For a deliberately local development stack, enable the local development
checkbox and use API/auth `http://127.0.0.1:18000` and web
`http://127.0.0.1:13000`. This does not start services or initialize a database.
For CLI use, explicitly configure `OPENAGENTS_ENDPOINT` for your own API
before pairing; local HTTP additionally requires `AGHUB_DEV_LOOPBACK=1`.
Use the pairing command shown by your own workspace. Keep workspace tokens
private. There is no official host fallback.

This build guide does not authorize database migrations, deployment, signing,
or production changes. Installer interaction and independent review are still
required before marking T01 complete.

## Verified Windows core and standalone server bundle

Commit the candidate changes before building; the core build records the source
commit and refuses an uncommitted Connector tree. An exported source archive
must supply `AGHUB_SOURCE_SHA` from the reviewed archive commit. Do not use this
variable to hide local modifications.

`npm run build` stages the repository Connector and its installed locked runtime
dependencies into `packages/launcher/.aghub-core/core`, with `manifest.json`
beside it. No upstream core package is downloaded. The manifest has a closed
file list with SHA-256 hashes and fixed main/CLI entrypoints. The packaged app
embeds its trusted manifest in app.asar and checks the external CLI copy too.

From `packages/launcher`, build an unsigned Windows x64 NSIS test artifact:

```text
node node_modules/electron-builder/cli.js --win nsis --x64 --publish never --config.win.signExecutable=false --config.win.signAndEditExecutable=false --config.forceCodeSigning=false
```

Set `CSC_IDENTITY_AUTO_DISCOVERY=false` and use a clean environment without
certificate/signing credentials. Record the resulting installer SHA-256 and
`Get-AuthenticodeSignature` result; a successful command does not prove unsigned.

For a self-built server bundle (Node.js 20+ already installed), archive the
entire `.aghub-core` directory after the verified build. Transfer it as a
reviewed artifact with its separately recorded archive hash, not as an npm
registry update. On the server, extract both `core/` and `manifest.json` as
siblings, then run:

```text
node core/bin/agent-connector.js core-info
node core/bin/agent-connector.js --help
```

For the installed Windows package, the same CLI is at
`<install>/resources/aghub-core/bin/agent-connector.js`; the manifest is
`<install>/resources/aghub-core-manifest.json`. `core-info` must report the
same source SHA/version/directory as the Launcher startup log and daemon status.
Copying only `core/` loses the verified release boundary; preserve the manifest.
Source `npm link` remains a development command and reports `sourceSha: null`,
not an independently verified release. `agn update` cannot replace this core.

The app now uses product name AgentHub and appId `com.zaiyemeiyou.aghub`.
Existing OpenAgents profiles and caches remain in place; they are not silently
moved, overwritten, or used as executable cores. Legacy data import is T09.
An already running daemon with a missing/different core identity blocks new
dispatch and must be stopped deliberately before using this candidate.

Unsigned integrity manifests detect packaging corruption and source drift;
they do not prove publisher authenticity against someone who can replace the
entire unsigned application. Signing and human release review remain separate.
