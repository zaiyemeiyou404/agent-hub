'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WorkspaceClient } = require('../src/workspace-client');
const BaseAdapter = require('../src/adapters/base');

const saved = process.env.AGHUB_DEV_LOOPBACK;

function restore() {
  if (saved === undefined) delete process.env.AGHUB_DEV_LOOPBACK;
  else process.env.AGHUB_DEV_LOOPBACK = saved;
}

describe('WorkspaceClient service URL contract', () => {
  it('rejects remote HTTP, userinfo, a path, a query, and a hash', () => {
    for (const raw of [
      'http://example.com',
      'https://user:pw@api.example.com',
      'https://api.example.com/v1',
      'https://api.example.com/?q=1',
      'https://api.example.com/#token',
    ]) {
      assert.throws(() => new WorkspaceClient(raw), /configuration_required/, raw);
    }
  });

  it('allows the dev API origin only when loopback mode is explicit', () => {
    delete process.env.AGHUB_DEV_LOOPBACK;
    assert.throws(() => new WorkspaceClient('http://127.0.0.1:18000'), /configuration_required/);
    process.env.AGHUB_DEV_LOOPBACK = '1';
    try {
      assert.equal(new WorkspaceClient('http://127.0.0.1:18000').endpoint, 'http://127.0.0.1:18000');
      assert.throws(() => new WorkspaceClient('http://127.0.0.1:19999'), /configuration_required/);
    } finally {
      restore();
    }
  });

  it('keeps a closed HTTPS port as a connection failure', async () => {
    const client = new WorkspaceClient('https://127.0.0.1:1');
    await assert.rejects(() => client._get('/v1/health'), (err) => {
      assert.notEqual(err.message, 'configuration_required');
      assert.equal(err.code, 'ECONNREFUSED');
      return true;
    });
  });

  it('rejects a remote HTTP endpoint on the adapter and keeps an HTTPS endpoint', () => {
    const opts = { workspaceId: 'w', channelName: 'c', token: 't', agentName: 'a' };
    assert.throws(() => new BaseAdapter({ ...opts, endpoint: 'http://10.0.0.8' }), /configuration_required/);
    const adapter = new BaseAdapter({ ...opts, endpoint: 'https://api.example.com' });
    assert.equal(adapter.endpoint, 'https://api.example.com');
  });
});
