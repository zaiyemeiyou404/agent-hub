/**
 * ZAI-19 / T04a capability record.
 *
 * Splits two questions the live probes must not blur together:
 *   - Does the adapter source wire a capability (code path)?
 *   - Did an authenticated CLI run on the probe host exercise it (live)?
 *
 * The 2026-10-24 grok-bot probes never logged in. Every live cell is
 * NOT_READY or UNSUPPORTED. This module does not spawn Codex or OpenCode
 * and does not upgrade a cell to LIVE_VERIFIED.
 */

'use strict';

const LIVE_STATUS = Object.freeze({
  NOT_READY: 'NOT_READY',
  UNSUPPORTED: 'UNSUPPORTED',
  LIVE_VERIFIED: 'LIVE_VERIFIED',
});

const CODE_STATUS = Object.freeze({
  WIRED: 'WIRED',
  BYPASSED: 'BYPASSED',
  ABSENT: 'ABSENT',
});

/** Baseline this record was written against. Re-verify HEAD before committing. */
const BASELINE = Object.freeze({
  repo: 'https://github.com/zaiyemeiyou404/agent-hub.git',
  branch: 'feat/secure-local-file-requests',
  commit: 'd32e46c8011dbc6d04735cb612b84ec498943041',
  delta: 'none',
});

/**
 * Structured facts from the attached probe bundle. No secrets, tokens,
 * request ids, or session ids.
 */
const PROBE = Object.freeze({
  task: 'ZAI-19 / T04a',
  probedAt: '2026-10-24T16:38:09.803512+08:00',
  host: 'grok-bot box (linux)',
  authenticated: false,
  observed: false,
  codex: Object.freeze({
    package: '@openai/codex',
    version: '0.164.0',
    cliOnPath: false,
    authFile: 'absent',
    loginStatus: 'Not logged in',
    outcome: '401 Unauthorized',
    processExitCode: 0,
  }),
  opencode: Object.freeze({
    version: '1.4.7',
    adapterPin: '1.17.11',
    adapterMin: '1.17.0',
    authFile: 'absent',
    outcome: 'FreeTierError',
  }),
});

/** Flags CodexAdapter always pushes for `codex exec` before resume. */
const CODEX_EXEC_FLAGS = Object.freeze([
  '--json',
  '--dangerously-bypass-approvals-and-sandbox',
  '--skip-git-repo-check',
]);

/** Flags OpenCodeAdapter always passes to `opencode run`. */
const OPENCODE_RUN_PREFIX = Object.freeze(['run', '--format', 'json']);

const CAPABILITIES = Object.freeze([
  'tool_call',
  'approval',
  'approval_reject',
  'cancel',
  'resume',
]);

function codexLiveCells() {
  const cells = {};
  for (const name of CAPABILITIES) cells[name] = LIVE_STATUS.NOT_READY;
  return cells;
}

function opencodeLiveCells() {
  return {
    tool_call: LIVE_STATUS.NOT_READY,
    approval: LIVE_STATUS.NOT_READY,
    approval_reject: LIVE_STATUS.NOT_READY,
    cancel: LIVE_STATUS.NOT_READY,
    resume: LIVE_STATUS.NOT_READY,
    // Probed CLI is below the adapter floor (1.4.7 < 1.17.0).
    probed_cli_vs_adapter_floor: LIVE_STATUS.UNSUPPORTED,
  };
}

/**
 * Code-path column. Independent of whether a live CLI authenticated.
 * Approval on Codex is BYPASSED (the exec flag skips prompts). Reject is
 * ABSENT on both runtimes: nothing in the adapter accepts or denies a prompt.
 */
function codePaths() {
  return {
    codex: {
      tool_call: CODE_STATUS.WIRED,
      approval: CODE_STATUS.BYPASSED,
      approval_reject: CODE_STATUS.ABSENT,
      cancel: CODE_STATUS.WIRED,
      resume: CODE_STATUS.WIRED,
    },
    opencode: {
      tool_call: CODE_STATUS.WIRED,
      approval: CODE_STATUS.ABSENT,
      approval_reject: CODE_STATUS.ABSENT,
      cancel: CODE_STATUS.WIRED,
      resume: CODE_STATUS.WIRED,
    },
  };
}

/**
 * LIVE_VERIFIED is allowed only when a probe record explicitly says the run
 * authenticated and the capability was observed. The T04a record sets both
 * to false.
 */
function allowLiveVerified(probe) {
  return Boolean(probe && probe.authenticated === true && probe.observed === true);
}

function assertProbeDoesNotClaimSuccess(cells) {
  for (const [name, status] of Object.entries(cells || {})) {
    if (status === LIVE_STATUS.LIVE_VERIFIED) {
      throw new Error(`live cell ${name} is LIVE_VERIFIED but this probe is not authenticated`);
    }
    if (status !== LIVE_STATUS.NOT_READY && status !== LIVE_STATUS.UNSUPPORTED) {
      throw new Error(`live cell ${name} has unknown status ${status}`);
    }
  }
  return true;
}

/**
 * What a Codex `--json` exec transcript supports. Tool use is only
 * `item.completed` / `command_execution` or `file_change`. An auth failure
 * keeps the transcript at NOT_READY even if a thread id was issued.
 */
function codexExecProbeDisposition(events) {
  const list = Array.isArray(events) ? events : [];
  const sawTool = list.some((event) => {
    if (!event || event.type !== 'item.completed' || !event.item) return false;
    return event.item.type === 'command_execution' || event.item.type === 'file_change';
  });
  const authFailed = list.some((event) => {
    if (!event) return false;
    const message = event.type === 'turn.failed'
      ? (event.error && event.error.message) || ''
      : (event.type === 'error' ? event.message || '' : '');
    return /401|unauthorized|not logged in|missing bearer/i.test(String(message));
  });
  if (authFailed || !sawTool) return LIVE_STATUS.NOT_READY;
  return 'REACHED_TOOL';
}

module.exports = {
  LIVE_STATUS,
  CODE_STATUS,
  BASELINE,
  PROBE,
  CODEX_EXEC_FLAGS,
  OPENCODE_RUN_PREFIX,
  CAPABILITIES,
  codexLiveCells,
  opencodeLiveCells,
  codePaths,
  allowLiveVerified,
  assertProbeDoesNotClaimSuccess,
  codexExecProbeDisposition,
};
