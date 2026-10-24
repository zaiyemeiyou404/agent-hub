'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('legacy update opt-in cannot turn a source candidate into an upstream core', async () => {
  const previous = process.env.AGHUB_UPDATE_ENABLED;
  const request = https.request;
  process.env.AGHUB_UPDATE_ENABLED = '1';
  https.request = () => { throw new Error('forbidden registry request'); };
  try {
    const { checkForUpdate, runUpdate } = require('../src/update-check');
    assert.equal(await checkForUpdate(), null);
    assert.equal(runUpdate({ spawn:() => { throw new Error('forbidden package mutation'); } }), false);
  } finally {
    https.request = request;
    if (previous === undefined) delete process.env.AGHUB_UPDATE_ENABLED; else process.env.AGHUB_UPDATE_ENABLED = previous;
  }
});
test('agn update explains controlled releases and performs no package installation', () => {
  const r = spawnSync(process.execPath, ['--require',path.join(__dirname,'block-core-update.cjs'),path.resolve(__dirname,'../bin/agent-connector.js'),'update'], { encoding:'utf8', timeout:10000, env:{ ...process.env, AGHUB_UPDATE_ENABLED:'1' }, windowsHide:true });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /reviewed AgentHub|controlled release/i);
  assert.doesNotMatch(r.stdout + r.stderr, /Running:.*npm|Updating \d/);
});
