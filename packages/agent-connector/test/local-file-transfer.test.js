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
  reapSnapshots,
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
  it('removes crash leftovers and keeps a live snapshot', () => {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'keep');
    inspect('notes.txt');
    fs.writeFileSync(path.join(snapshots, 'orphan.snapshot'), 'leftover');
    fs.writeFileSync(path.join(snapshots, 'orphan.json'), '{}');
    const outside = path.join(tmp, 'outside-secret.txt');
    fs.writeFileSync(outside, 'do not delete');
    fs.symlinkSync(outside, path.join(snapshots, 'linked.snapshot'));
    const removed = reapSnapshots(snapshots, ['req-1']);
    assert.deepEqual(removed, ['orphan']);
    assert.equal(fs.existsSync(path.join(snapshots, 'req-1.snapshot')), true);
    assert.equal(fs.existsSync(path.join(snapshots, 'orphan.snapshot')), false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'do not delete');
  });

  it('rejects a directory junction that leaves the authorized root', () => {
    if (process.platform !== 'win32') return;
    const outside = path.join(tmp, 'outside-dir');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
    assert.throws(() => inspect('linked/secret.txt'), /symlink|path|root/i);
  });

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

  it('does not treat missed secret shapes as safe', () => {
    const cases = [
      [Buffer.from('{"password":"json-secret-value"}\n'), 'config.json', 'sensitive', 'structured_credential'],
      [Buffer.from('password: "quoted-secret-value"\n'), 'config.txt', 'sensitive', 'credential_pattern'],
      [Buffer.from('token sk-testsecretvalue\n'), 'notes.txt', 'sensitive', 'credential_pattern'],
      [Buffer.from('{"password":"json-secret-value"}\n'), 'credentials.json', 'sensitive', 'sensitive_filename'],
      [Buffer.from('{not json'), 'config.json', 'uncertain', 'structured_parse_failed'],
    ];
    for (const [bytes, filename, classification, code] of cases) {
      const found = classifySnapshot(bytes, filename);
      assert.equal(found.classification, classification, filename);
      assert.notEqual(found.classification, 'safe', filename);
      assert.ok(found.reasons.some((reason) => reason.code === code), `${filename} missing ${code}`);
    }
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
