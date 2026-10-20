'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  inspectAndSnapshot,
  loadSnapshot,
  classifySnapshot,
} = require('../src/local-file-transfer');

let tmp;
let root;
let snapshots;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agn-local-file-'));
  root = path.join(tmp, 'allowed');
  snapshots = path.join(tmp, 'snapshots');
  fs.mkdirSync(root);
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function inspect(relativePath, extra = {}) {
  return inspectAndSnapshot({
    requestId: 'req-1',
    recipientAgentId: 'laptop-agent',
    rootId: 'documents',
    relativePath,
    roots: [{ id: 'documents', path: root, agentIds: ['laptop-agent'] }],
    snapshotDir: snapshots,
    ...extra,
  });
}

describe('secure local-file snapshots', () => {
  it('rejects traversal, absolute paths, unauthorized agents, and symlink escapes', () => {
    fs.writeFileSync(path.join(tmp, 'outside.txt'), 'outside');
    fs.symlinkSync(path.join(tmp, 'outside.txt'), path.join(root, 'link.txt'));
    for (const relativePath of ['../outside.txt', '/etc/passwd', 'link.txt']) {
      assert.throws(() => inspect(relativePath), /path|symlink|root/i);
    }
    fs.writeFileSync(path.join(root, 'inside.txt'), 'inside');
    assert.throws(
      () => inspect('inside.txt', { recipientAgentId: 'other-agent' }),
      /authorized/i,
    );
  });

  it('snapshots immutable bytes and records size and sha256', () => {
    const source = path.join(root, 'notes.txt');
    fs.writeFileSync(source, 'first bytes');
    const manifest = inspect('notes.txt');
    fs.writeFileSync(source, 'changed later');
    const loaded = loadSnapshot('req-1', snapshots);
    assert.equal(fs.readFileSync(loaded.snapshotPath, 'utf8'), 'first bytes');
    assert.equal(loaded.sha256, manifest.sha256);
    assert.equal(loaded.size, Buffer.byteLength('first bytes'));
    assert.equal(loaded.rootId, 'documents');
    assert.equal(loaded.relativePath, 'notes.txt');
  });

  it('classifies secrets, unsupported binary, and normal text deterministically', () => {
    const secret = classifySnapshot(Buffer.from('API_KEY=super-secret-value'), '.env');
    assert.equal(secret.classification, 'sensitive');
    assert.ok(secret.reasons.some((reason) => reason.code === 'credential_pattern'));

    const binary = classifySnapshot(Buffer.from([0, 1, 2, 3, 255]), 'blob.bin');
    assert.equal(binary.classification, 'uncertain');
    assert.ok(binary.reasons.some((reason) => reason.code === 'unsupported_binary'));

    const safe = classifySnapshot(Buffer.from('meeting notes only\n'), 'notes.txt');
    assert.deepEqual(safe, { classification: 'safe', reasons: [] });
  });

  it('fails closed for encrypted or unknown extensions', () => {
    const encrypted = classifySnapshot(Buffer.from('not plaintext'), 'vault.gpg');
    assert.equal(encrypted.classification, 'uncertain');
    assert.ok(encrypted.reasons.some((reason) => reason.code === 'encrypted_file'));

    const unknown = classifySnapshot(Buffer.from('plain looking'), 'data.weirdext');
    assert.equal(unknown.classification, 'uncertain');
    assert.ok(unknown.reasons.some((reason) => reason.code === 'unsupported_type'));
  });
});
