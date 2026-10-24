#!/usr/bin/env node
'use strict';

// Run existing baseline tests with synthetic home/config directories and no
// inherited credentials. This does not start services or run Alembic.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
const output = path.resolve(option('--output-dir', path.join(root, '.tmp', 'aghub-baseline', new Date().toISOString().replace(/[:.]/g, '-'))));
const home = path.join(output, 'synthetic-home');
const temp = path.join(output, 'tmp');
for (const dir of [home, temp, path.join(home, 'AppData', 'Roaming'), path.join(home, 'AppData', 'Local')]) fs.mkdirSync(dir, { recursive: true });
const env = {};
for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'windir', 'COMSPEC', 'ComSpec', 'PATHEXT', 'PROCESSOR_ARCHITECTURE']) {
  if (process.env[key]) env[key] = process.env[key];
}
const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
Object.assign(env, {
  PATH: [path.dirname(process.execPath), ...(systemRoot ? [path.join(systemRoot, 'System32'), systemRoot] : ['/usr/bin', '/bin'])].join(path.delimiter),
  HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: path.join(home, '.config'),
  XDG_DATA_HOME: path.join(home, '.local', 'share'), TEMP: temp, TMP: temp, TMPDIR: temp,
  DATABASE_URL: 'sqlite://', FILE_STORAGE_PATH: path.join(output, 'files'),
  AUTH_MODE: 'workspace_token', IDENTITY_MODE: 'standalone',
  BACKGROUND_JOBS_ENABLED: 'false', ANALYTICS_ENABLED: 'false', YUMI_ENABLED: 'false',
  ROUTER_LLM_ENABLED: 'false', CAMPAIGN_ENABLED: 'false',
  // The session-exchange unit test mocks HTTP but expects a nonempty key.
  FIREBASE_PROJECT_ID: '', FIREBASE_CREDENTIALS_JSON: '', FIREBASE_WEB_API_KEY: 'aghub-synthetic-test-key',
  POSTHOG_API_KEY: '', ACCOUNT_API_URL: 'http://127.0.0.1:18000',
  WORKSPACE_ENDPOINT: 'http://127.0.0.1:18000', PUBLIC_API_BASE: 'http://127.0.0.1:18000',
  FRONTEND_BASE_URL: 'http://127.0.0.1:13000', OPENAGENTS_ENDPOINT: 'http://127.0.0.1:18000',
  PYTHONDONTWRITEBYTECODE: '1', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1',
  PYTHONUTF8: '1', NO_COLOR: '1',
});
const results = [];
function run(name, command, commandArgs, cwd) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.message}\n` : ''}`;
  fs.writeFileSync(path.join(output, `${name}.log`), log);
  const entry = { name, command: [command, ...commandArgs], exitCode: result.status, signal: result.signal, durationMs: Date.now() - started };
  results.push(entry);
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}; ${path.join(output, `${name}.log`)}`);
}
run('connector', process.execPath, ['--test', 'test/agent-identity-header.test.js', 'test/local-file-transfer.test.js', 'test/local-file-command.test.js', 'test/approval-tools.test.js', 'test/codex.test.js', 'test/opencode.test.js'], path.join(root, 'packages', 'agent-connector'));
const python = option('--backend-python', null);
if (python) run('backend', python, ['-B', '-m', 'pytest', '-q', '-p', 'no:cacheprovider', '--basetemp', path.join(temp, 'pytest'), 'tests/test_workspaces.py', 'tests/test_local_file_requests.py', 'tests/test_node_tokens.py', 'tests/test_workspace_session.py'], path.join(root, 'workspace', 'backend'));
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ isolation: 'synthetic home; whitelisted process environment; SQLite in-memory; external features disabled; no migrations', backendRequested: Boolean(python), results }, null, 2) + '\n');
process.exitCode = results.every(result => result.exitCode === 0) ? 0 : 1;
