'use strict';

/**
 * ZAI-19 / T04a — lock Codex and OpenCode capability facts.
 *
 * Live CLI probes are NOT_READY (no Codex login; OpenCode free tier blocks
 * headless run). These tests exercise adapter code paths and the recorded
 * probe disposition. They do not spawn codex or opencode, and they do not
 * claim a live tool, approval, cancel, or resume succeeded.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CodexAdapter = require('../src/adapters/codex');
const OpenCodeAdapter = require('../src/adapters/opencode');
const {
  BASELINE,
  PROBE,
  CODEX_EXEC_FLAGS,
  OPENCODE_RUN_PREFIX,
  codexLiveCells,
  opencodeLiveCells,
  codePaths,
  allowLiveVerified,
  assertProbeDoesNotClaimSuccess,
  codexExecProbeDisposition,
  LIVE_STATUS,
} = require('../src/adapters/runtime-capabilities');

const DOC = path.join(__dirname, '..', '..', '..', 'docs', 'aghub', 'runtime-capabilities.md');
const CODEX_SRC = path.join(__dirname, '..', 'src', 'adapters', 'codex.js');
const OPENCODE_SRC = path.join(__dirname, '..', 'src', 'adapters', 'opencode.js');

const AUTH_401 = 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header';

function codexWithBin(bin, env) {
  class ProbeCodex extends CodexAdapter {
    _findCodexBinary() { return bin; }
  }
  return new ProbeCodex({
    workspaceId: 'ws',
    channelName: 'general',
    token: 'token',
    agentName: 'codex-cap-test',
    agentEnv: env,
    logSink: () => {},
  });
}

function execAdapter(overrides = {}) {
  const calls = [];
  const sent = [];
  const adapter = Object.assign(Object.create(CodexAdapter.prototype), {
    _codexBin: 'codex',
    _directApiKey: '',
    _directBaseUrl: '',
    _directModel: '',
    _customProvider: null,
    _channelThreads: {},
    workingDir: '/work',
    agentEnv: {},
    _effectiveModel() { return ''; },
    _buildSystemContext() { return 'ctx'; },
    _attachmentInstructions() { return ''; },
    _log() {},
    _saveSessions() {},
    _spawnCodex: async (cmd) => {
      calls.push(cmd);
      return { responseText: 'ok', exitCode: 0, turnFailed: false, errorMessage: '', stderr: '' };
    },
    sendResponse: async (_channel, content) => { sent.push({ kind: 'response', content }); },
    sendError: async (_channel, content) => { sent.push({ kind: 'error', content }); },
  }, overrides);
  return { adapter, calls, sent };
}

describe('T04a probe record', () => {
  it('keeps every live cell at NOT_READY or UNSUPPORTED', () => {
    assert.strictEqual(allowLiveVerified(PROBE), false);
    assert.strictEqual(PROBE.authenticated, false);
    assert.strictEqual(PROBE.codex.version, '0.164.0');
    assert.strictEqual(PROBE.codex.loginStatus, 'Not logged in');
    assert.strictEqual(PROBE.codex.outcome, '401 Unauthorized');
    assert.strictEqual(PROBE.codex.processExitCode, 0);
    assert.strictEqual(PROBE.opencode.version, '1.4.7');
    assert.strictEqual(PROBE.opencode.outcome, 'FreeTierError');
    assert.strictEqual(BASELINE.commit, 'd32e46c8011dbc6d04735cb612b84ec498943041');
    assert.strictEqual(BASELINE.delta, 'none');
    assert.strictEqual(assertProbeDoesNotClaimSuccess(codexLiveCells()), true);
    assert.strictEqual(assertProbeDoesNotClaimSuccess(opencodeLiveCells()), true);
    for (const status of Object.values(codexLiveCells())) {
      assert.strictEqual(status, LIVE_STATUS.NOT_READY);
    }
    assert.strictEqual(opencodeLiveCells().probed_cli_vs_adapter_floor, LIVE_STATUS.UNSUPPORTED);
  });

  it('refuses to mark the T04a record live-verified', () => {
    assert.throws(
      () => assertProbeDoesNotClaimSuccess({ tool_call: LIVE_STATUS.LIVE_VERIFIED }),
      /LIVE_VERIFIED/,
    );
    assert.strictEqual(allowLiveVerified({ authenticated: true, observed: false }), false);
    assert.strictEqual(allowLiveVerified({ authenticated: true, observed: true }), true);
  });

  it('reads a 401 exec transcript as NOT_READY, including when a thread id was issued', () => {
    const events = [
      { type: 'thread.started', thread_id: 'redacted' },
      { type: 'turn.started' },
      { type: 'error', message: AUTH_401 },
      { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Falling back from WebSockets to HTTPS transport' } },
      { type: 'turn.failed', error: { message: AUTH_401 } },
    ];
    assert.strictEqual(codexExecProbeDisposition(events), LIVE_STATUS.NOT_READY);
    assert.strictEqual(codexExecProbeDisposition([]), LIVE_STATUS.NOT_READY);
    assert.strictEqual(codexExecProbeDisposition([
      { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } },
    ]), 'REACHED_TOOL');
  });
});

describe('Codex — start mode and exec interface', () => {
  it('selects CLI mode for a native or subscription setup, and direct mode for a non-Responses gateway', () => {
    const cli = codexWithBin('codex', {});
    assert.strictEqual(cli._useCliMode, true);
    assert.strictEqual(cli._directMode, false);

    const native = codexWithBin('codex', {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
    assert.strictEqual(native._useCliMode, true);
    assert.strictEqual(native._directMode, false);

    const gateway = codexWithBin('codex', {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://gateway.example/v1',
    });
    assert.strictEqual(gateway._useCliMode, false);
    assert.strictEqual(gateway._directMode, true);
    assert.strictEqual(gateway._customProvider, null);

    const responses = codexWithBin('codex', {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://gateway.example/v1',
      CODEX_WIRE_API: 'responses',
    });
    assert.strictEqual(responses._useCliMode, true);
    assert.strictEqual(responses._directMode, false);
    assert.strictEqual(responses._customProvider.baseUrl, 'https://gateway.example/v1');

    const directOnly = codexWithBin(null, {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://gateway.example/v1',
    });
    assert.strictEqual(directOnly._useCliMode, false);
    assert.strictEqual(directOnly._directMode, true);

    const neither = codexWithBin(null, {});
    assert.strictEqual(neither._useCliMode, false);
    assert.strictEqual(neither._directMode, false);
  });

  it('builds exec argv with the bypass flags and resume after the exec options', async () => {
    const { adapter, calls } = execAdapter({ _channelThreads: { general: 'thread-1' } });
    await adapter._handleViaSubprocess('ping', 'general', []);
    const cmd = calls[0];
    assert.deepStrictEqual(cmd.slice(0, 2), ['codex', 'exec']);
    for (const flag of CODEX_EXEC_FLAGS) {
      assert.ok(cmd.includes(flag), `missing ${flag}`);
    }
    assert.deepStrictEqual(cmd.slice(2, 5), CODEX_EXEC_FLAGS);
    assert.ok(!cmd.includes('--approve-for-me'));
    assert.ok(!cmd.includes('--sandbox'));
    assert.ok(!cmd.includes('--dangerously-skip-permissions'));
    assert.ok(cmd.indexOf('-C') < cmd.indexOf('resume'));
    assert.deepStrictEqual(cmd.slice(-2), ['resume', 'thread-1']);
    assert.deepStrictEqual(codePaths().codex, {
      tool_call: 'WIRED',
      approval: 'BYPASSED',
      approval_reject: 'ABSENT',
      cancel: 'WIRED',
      resume: 'WIRED',
    });
  });

  it('omits resume until a thread id exists', async () => {
    const { adapter, calls } = execAdapter();
    await adapter._handleViaSubprocess('ping', 'general', []);
    assert.ok(!calls[0].includes('resume'));
    assert.deepStrictEqual(calls[0].slice(2, 5), CODEX_EXEC_FLAGS);
  });

  it('treats the probed 401 shape (turn.failed, process exit 0, no text) as a failure and keeps the thread id', async () => {
    const { adapter, calls, sent } = execAdapter({
      _channelThreads: { general: 'thread-probe' },
      _spawnCodex: async (cmd) => {
        calls.push(cmd);
        return { responseText: '', exitCode: 0, turnFailed: true, errorMessage: AUTH_401, stderr: '' };
      },
    });
    await adapter._handleViaSubprocess('ping', 'general', []);
    assert.strictEqual(calls.length, 1, 'exit 0 is not the stale-thread retry');
    assert.strictEqual(adapter._channelThreads.general, 'thread-probe');
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].kind, 'error');
    assert.match(sent[0].content, /401/);
    assert.match(sent[0].content, /Missing bearer/);
    assert.strictEqual(CodexAdapter._endedEarly({ exitCode: 0, turnFailed: true }), true);
  });

  it('drops a saved thread id when a signalled process exits null with no text, then refuses the follow-up spawn after Stop', async () => {
    let calls = 0;
    const realSpawn = CodexAdapter.prototype._spawnCodex;
    const { adapter } = execAdapter({
      _channelThreads: { general: 'thread-1' },
      _channelRunGeneration: { general: '0:0' },
      _stopGeneration: 1,
      _channelStopGeneration: {},
      _stoppingChannels: new Set(),
      _spawnCodex: async function spawn(cmd, env, channel, prompt) {
        calls += 1;
        if (calls === 1) {
          return { responseText: '', exitCode: null, turnFailed: false, errorMessage: '', stderr: '' };
        }
        return realSpawn.call(this, cmd, env, channel, prompt);
      },
    });
    await adapter._handleViaSubprocess('ping', 'general', []);
    assert.strictEqual(calls, 2);
    assert.strictEqual(adapter._channelThreads.general, undefined);
    assert.ok(adapter._stoppingChannels.has('general'));
  });

  it('parses a fixture exec transcript: 401 persists the thread and is a failed turn', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cap-'));
    const script = path.join(dir, 'fake-codex.js');
    fs.writeFileSync(script, `
      let buf = '';
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => {
        const lines = [
          { type: 'thread.started', thread_id: 'thread-from-fixture' },
          { type: 'turn.started' },
          { type: 'error', message: ${JSON.stringify(AUTH_401)} },
          { type: 'turn.failed', error: { message: ${JSON.stringify(AUTH_401)} } },
        ];
        for (const line of lines) process.stdout.write(JSON.stringify(line) + '\\n');
        process.exit(0);
      });
    `);
    const adapter = Object.assign(Object.create(CodexAdapter.prototype), {
      _channelThreads: {},
      _channelProcesses: {},
      _channelRunGeneration: {},
      workingDir: dir,
      _log() {},
      _saveSessions() {},
      sendThinking: async () => {},
      sendStatus: async () => {},
    });
    const result = await adapter._spawnCodex([process.execPath, script], { ...process.env }, 'general', 'ping');
    assert.strictEqual(adapter._channelThreads.general, 'thread-from-fixture');
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.turnFailed, true);
    assert.strictEqual(result.responseText, '');
    assert.match(result.errorMessage, /401/);
    assert.strictEqual(codexExecProbeDisposition([
      { type: 'thread.started', thread_id: 'thread-from-fixture' },
      { type: 'turn.failed', error: { message: result.errorMessage } },
    ]), LIVE_STATUS.NOT_READY);
  });

  it('parses a fixture command_execution event as tool output, separate from the live probe', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cap-tool-'));
    const script = path.join(dir, 'fake-codex.js');
    fs.writeFileSync(script, `
      process.stdin.resume();
      process.stdin.on('end', () => {
        const lines = [
          { type: 'thread.started', thread_id: 'thread-tool' },
          { type: 'item.completed', item: { type: 'command_execution', command: 'pwd', exit_code: 0, output: '/work' } },
          { type: 'item.completed', item: { type: 'agent_message', text: 'done' } },
        ];
        for (const line of lines) process.stdout.write(JSON.stringify(line) + '\\n');
        process.exit(0);
      });
    `);
    const statuses = [];
    const adapter = Object.assign(Object.create(CodexAdapter.prototype), {
      _channelThreads: {},
      _channelProcesses: {},
      _channelRunGeneration: {},
      workingDir: dir,
      _log() {},
      _saveSessions() {},
      sendThinking: async () => {},
      sendStatus: async (_channel, status) => { statuses.push(status); },
    });
    const result = await adapter._spawnCodex([process.execPath, script], { ...process.env }, 'general', 'ping');
    assert.strictEqual(result.responseText, 'done');
    assert.strictEqual(result.turnFailed, false);
    assert.ok(statuses.some((status) => status.includes('pwd')));
    assert.strictEqual(codexExecProbeDisposition([
      { type: 'item.completed', item: { type: 'command_execution', command: 'pwd' } },
    ]), 'REACHED_TOOL');
  });

  it('direct-mode completions payload has no tools field', () => {
    const src = fs.readFileSync(CODEX_SRC, 'utf8');
    const start = src.indexOf('const payload = JSON.stringify');
    const end = src.indexOf('return new Promise', start);
    const payload = src.slice(start, end);
    assert.match(payload, /stream:\s*true/);
    assert.ok(!/\btools\b/.test(payload));
  });
});

describe('Codex — cancel signals', () => {
  it('returns immediately when the child has already exited', async () => {
    const adapter = Object.create(CodexAdapter.prototype);
    let killed = false;
    await adapter._stopProcess({ pid: 1, exitCode: 0, kill() { killed = true; } });
    assert.strictEqual(killed, false);
  });

  it('falls back to proc.kill SIGTERM then SIGKILL when the process group signal fails', async (t) => {
    if (process.platform === 'win32') return;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(process, 'kill', () => {
      throw Object.assign(new Error('esrch'), { code: 'ESRCH' });
    });
    const signals = [];
    const adapter = Object.create(CodexAdapter.prototype);
    const proc = {
      pid: 4242,
      exitCode: null,
      kill(sig) { signals.push(sig); },
      on() {},
    };
    const pending = adapter._stopProcess(proc);
    t.mock.timers.tick(5000);
    await pending;
    assert.deepStrictEqual(signals, ['SIGTERM', 'SIGKILL']);
  });
});

describe('OpenCode — run interface, version floor, free-tier failure', () => {
  it('pins run to --format json and resumes with --session only', () => {
    const fresh = OpenCodeAdapter.prototype._buildRunArgs.call({}, {
      runCwd: '/work',
      model: 'openai/gpt-4o',
      sessionId: '',
    });
    assert.deepStrictEqual(fresh.slice(0, 3), OPENCODE_RUN_PREFIX);
    assert.deepStrictEqual(fresh, ['run', '--format', 'json', '--dir', '/work', '--model', 'openai/gpt-4o']);

    const resumed = OpenCodeAdapter.prototype._buildRunArgs.call({}, {
      runCwd: '/work',
      model: 'opencode/big-pickle',
      sessionId: 'ses_example',
    });
    assert.deepStrictEqual(resumed, [
      'run', '--format', 'json', '--dir', '/work', '--model', 'opencode/big-pickle', '--session', 'ses_example',
    ]);
    assert.ok(!resumed.includes('--dangerously-skip-permissions'));
    assert.ok(!resumed.includes('--continue'));
    assert.ok(!resumed.includes('--fork'));
    assert.deepStrictEqual(codePaths().opencode.approval, 'ABSENT');
    assert.deepStrictEqual(codePaths().opencode.resume, 'WIRED');
  });

  it('classifies the probed CLI 1.4.7 as unsupported against the 1.17.0 floor', () => {
    assert.strictEqual(OpenCodeAdapter._classifyVersion('1.4.7'), 'unsupported');
    assert.strictEqual(OpenCodeAdapter._classifyVersion('1.16.9'), 'unsupported');
    assert.strictEqual(OpenCodeAdapter._classifyVersion(PROBE.opencode.adapterMin), 'ok');
    assert.strictEqual(OpenCodeAdapter._classifyVersion(PROBE.opencode.adapterPin), 'ok');
  });

  it('classifies a headless free-tier stderr as unknown_error, which is not a tool success', () => {
    const stderr = "Error: OpenCode's free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building.";
    const cls = OpenCodeAdapter._classifyFailure({ code: 1, signal: null, stdout: '', stderr });
    assert.strictEqual(cls.category, 'unknown_error');
    assert.match(cls.detail, /free tier/);
    assert.ok(!/tool/i.test(cls.category));
  });

  it('lets an opencode/ model through credential preflight when no key file is present', (t) => {
    t.mock.method(fs, 'existsSync', (p) => {
      const target = String(p);
      if (target.includes(`${path.sep}opencode${path.sep}`) || target.endsWith(`${path.sep}opencode.json`) || target.endsWith(`${path.sep}auth.json`)) {
        return false;
      }
      return fs.existsSync.mock.original(p);
    });
    const adapter = Object.create(OpenCodeAdapter.prototype);
    adapter.agentEnv = { OPENCODE_MODEL: 'opencode/big-pickle' };
    adapter.agentHome = path.join(os.tmpdir(), 'opencode-cap-missing');
    assert.strictEqual(adapter._credentialState(), 'unknown');
    adapter.agentEnv = {};
    assert.strictEqual(adapter._credentialState(), 'missing');
  });

  it('returns immediately when the child has already exited', async () => {
    const adapter = Object.create(OpenCodeAdapter.prototype);
    let killed = false;
    await adapter._stopProcess({ pid: 1, exitCode: 0, kill() { killed = true; } });
    assert.strictEqual(killed, false);
  });

  it('falls back to proc.kill SIGTERM then SIGKILL when the process group signal fails', async (t) => {
    if (process.platform === 'win32') return;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(process, 'kill', () => {
      throw Object.assign(new Error('esrch'), { code: 'ESRCH' });
    });
    const signals = [];
    const adapter = Object.create(OpenCodeAdapter.prototype);
    const proc = {
      pid: 4343,
      exitCode: null,
      kill(sig) { signals.push(sig); },
      once() {},
    };
    const pending = adapter._stopProcess(proc);
    t.mock.timers.tick(1500);
    t.mock.timers.tick(1000);
    await pending;
    assert.deepStrictEqual(signals, ['SIGTERM', 'SIGKILL']);
  });
});

describe('runtime-capabilities.md', () => {
  it('records the same baseline, versions, and live statuses as the probe module', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    assert.match(doc, new RegExp(BASELINE.commit));
    assert.match(doc, /Baseline delta \| none/);
    assert.match(doc, /0\.164\.0/);
    assert.match(doc, /1\.4\.7/);
    assert.match(doc, /1\.17\.11/);
    assert.match(doc, /1\.17\.0/);
    assert.match(doc, /NOT_READY/);
    assert.match(doc, /UNSUPPORTED/);
    assert.match(doc, /Not logged in/);
    assert.match(doc, /FreeTierError|free tier/);
    assert.match(doc, /--dangerously-bypass-approvals-and-sandbox/);
    assert.match(doc, /--format json/);
    assert.match(doc, /T04b/);
    assert.ok(!/sk-[A-Za-z0-9]{8,}/.test(doc));
    assert.ok(!/Bearer [A-Za-z0-9._-]{8,}/.test(doc));
    assert.ok(!doc.includes('LIVE_VERIFIED | yes'));
  });
});
