# AgentHub candidate: build from source

This is the ZAI-16 review candidate, not a published installer release. There
are no owned Windows/macOS/Linux installer downloads or automatic install
scripts for this candidate yet. Do not substitute an upstream release.

## Connector / CLI

Install Git and Node.js 20 or later, then run these commands in PowerShell,
bash or zsh. Choose a writable working directory first.

```text
git clone --branch codex/zai-16-independent-endpoints --single-branch https://github.com/zaiyemeiyou404/agent-hub.git aghub
cd aghub
npm --prefix packages/agent-connector ci
npm link --prefix packages/agent-connector
agn --help
```

`npm link` installs the `agn` command from this local checkout into your npm
prefix; it may require a user-writable npm prefix. Record `git rev-parse HEAD`
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
