'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Registry } = require('../src/registry');
const { checkForUpdate } = require('../src/update-check');
const {
  ConfigurationRequired,
  DEV_API_BASE,
  DEV_WEB_BASE,
  resolveServiceUrl,
  tokenForService,
} = require('../src/service-endpoints');

describe('independent connector endpoints', () => {
  it('returns configuration_required for a missing or illegal URL', () => {
    assert.throws(() => resolveServiceUrl(undefined, 'api', {}), ConfigurationRequired);
    assert.throws(() => resolveServiceUrl('http://example.com', 'api', {}), ConfigurationRequired);
    assert.throws(() => resolveServiceUrl(DEV_API_BASE, 'api', {}), ConfigurationRequired);
  });

  it('accepts only the explicit dev loopback contract', () => {
    const env = { AGHUB_DEV_LOOPBACK: '1' };
    assert.equal(resolveServiceUrl(DEV_API_BASE, 'api', env), DEV_API_BASE);
    assert.equal(resolveServiceUrl(DEV_WEB_BASE, 'web', env), DEV_WEB_BASE);
    assert.throws(() => resolveServiceUrl('http://127.0.0.1:19999', 'api', env), ConfigurationRequired);
  });

  it('does not carry a token onto a different service', () => {
    const stored = { apiBase: 'https://old.example.com', token: 'old-token' };
    assert.equal(tokenForService(stored, 'https://new.example.com'), null);
    assert.equal(tokenForService(stored, 'https://old.example.com'), 'old-token');
  });

  it('loads the bundled catalog without an official registry request', async () => {
    const requests = [];
    const original = http.request;
    http.request = (...args) => {
      requests.push(args[0]);
      return original.apply(http, args);
    };
    try {
      const registry = new Registry(require('os').tmpdir(), undefined, { remoteEnabled: false });
      const catalog = await registry.getCatalog();
      assert.ok(Array.isArray(catalog));
      assert.equal(requests.length, 0);
    } finally {
      http.request = original;
    }
  });

  it('does not query npm when updates are disabled', async () => {
    const previous = process.env.AGHUB_UPDATE_ENABLED;
    delete process.env.AGHUB_UPDATE_ENABLED;
    const requests = [];
    const original = http.request;
    http.request = (...args) => {
      requests.push(args[0]);
      return original.apply(http, args);
    };
    try {
      const info = await checkForUpdate();
      assert.equal(info, null);
      assert.equal(requests.length, 0);
    } finally {
      http.request = original;
      if (previous === undefined) delete process.env.AGHUB_UPDATE_ENABLED;
      else process.env.AGHUB_UPDATE_ENABLED = previous;
    }
  });
});
