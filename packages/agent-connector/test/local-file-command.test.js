'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Daemon } = require('../src/daemon');
const { WorkspaceClient } = require('../src/workspace-client');

let tmp;
let root;
let snapshots;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agn-local-command-'));
  root = path.join(tmp, 'allowed');
  snapshots = path.join(tmp, 'snapshots');
  fs.mkdirSync(root);
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function commandHarness() {
  const agent = { name: 'laptop-agent', network: 'workspace-one', node_id: 'node-1' };
  const daemon = new Daemon(
    { getAgent: (name) => name === agent.name ? agent : null, getAgents: () => [agent] },
    {},
    {},
  );
  daemon._localFileRoots = [{ id: 'documents', path: root, agentIds: ['laptop-agent'] }];
  daemon._localFileSnapshotDir = snapshots;
  const calls = { inspection: [], upload: [], generic: [] };
  daemon._nodeClients.set('node-1', {
    submitLocalFileInspection: async (...args) => calls.inspection.push(args),
    uploadLocalFileContent: async (...args) => calls.upload.push(args),
    nodeCommandResult: async (...args) => calls.generic.push(args),
  });
  const node = {
    node_id: 'node-1', workspace_id: 'workspace-id', workspace_slug: 'workspace-one',
    token: 'machine-token', endpoint: 'https://workspace.invalid',
  };
  return { daemon, node, calls };
}

describe('local-file command protocol', () => {
  it('declares protocol capability on the node heartbeat', async () => {
    const client = new WorkspaceClient('https://api.example.com');
    let body = null;
    client._post = async (_path, value) => { body = value; return { data: {} }; };
    await client.nodeHeartbeat('node-1', 'tok', { capabilities: ['local_file_request.v1'] });
    assert.deepEqual(body.capabilities, ['local_file_request.v1']);
  });

  it('inspects only the explicitly addressed agent root and submits a manifest without file bytes', async () => {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'meeting notes only');
    const { daemon, node, calls } = commandHarness();
    await daemon._runNodeCommand(node, {
      commandId: 'cmd-inspect',
      action: 'local_file_inspect',
      args: {
        protocolVersion: 1,
        requestId: 'req-1',
        recipientAgentId: 'laptop-agent',
        rootId: 'documents',
        relativePath: 'notes.txt',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    assert.equal(calls.inspection.length, 1);
    const [requestId, token, manifest] = calls.inspection[0];
    assert.equal(requestId, 'req-1');
    assert.equal(token, 'machine-token');
    assert.equal(manifest.classification, 'safe');
    assert.equal(manifest.filename, 'notes.txt');
    assert.equal(typeof manifest.sha256, 'string');
    assert.equal(JSON.stringify(manifest).includes('meeting notes only'), false);
    assert.equal(calls.generic.length, 0);
  });

  it('uploads only the approved immutable snapshot and then removes it', async () => {
    const source = path.join(root, 'notes.txt');
    fs.writeFileSync(source, 'approved bytes');
    const { daemon, node, calls } = commandHarness();
    const inspectArgs = {
      protocolVersion: 1, requestId: 'req-1', recipientAgentId: 'laptop-agent',
      rootId: 'documents', relativePath: 'notes.txt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await daemon._runNodeCommand(node, { commandId: 'cmd-inspect', action: 'local_file_inspect', args: inspectArgs });
    const manifest = calls.inspection[0][2];
    fs.writeFileSync(source, 'replaced source bytes');
    await daemon._runNodeCommand(node, {
      commandId: 'cmd-release',
      action: 'local_file_release',
      args: {
        ...inspectArgs,
        approvalId: 'approval-1',
        authorization: 'human_approval',
        approvedContentSha256: manifest.sha256,
      },
    });
    assert.equal(calls.upload.length, 1);
    const [, , upload] = calls.upload[0];
    assert.equal(Buffer.from(upload.content_base64, 'base64').toString(), 'approved bytes');
    assert.equal(upload.sha256, crypto.createHash('sha256').update('approved bytes').digest('hex'));
    assert.throws(() => fs.readFileSync(path.join(snapshots, 'req-1.snapshot')), /ENOENT/);
    assert.equal(calls.generic.length, 0);
  });

  it('fails closed when release manifest does not match the inspected snapshot', async () => {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'approved bytes');
    const { daemon, node, calls } = commandHarness();
    const inspectArgs = {
      protocolVersion: 1, requestId: 'req-1', recipientAgentId: 'laptop-agent',
      rootId: 'documents', relativePath: 'notes.txt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await daemon._runNodeCommand(node, { commandId: 'cmd-inspect', action: 'local_file_inspect', args: inspectArgs });
    await daemon._runNodeCommand(node, {
      commandId: 'cmd-release', action: 'local_file_release',
      args: { ...inspectArgs, approvalId: 'approval-1', authorization: 'human_approval', approvedContentSha256: 'f'.repeat(64) },
    });
    assert.equal(calls.upload.length, 0);
    assert.equal(calls.generic.length, 1);
    assert.equal(calls.generic[0][2].ok, false);
  });

  it('accepts an automatic-safe release without a human approval id', async () => {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'safe bytes');
    const { daemon, node, calls } = commandHarness();
    const inspectArgs = {
      protocolVersion: 1, requestId: 'req-1', recipientAgentId: 'laptop-agent',
      rootId: 'documents', relativePath: 'notes.txt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await daemon._runNodeCommand(node, { commandId: 'cmd-inspect', action: 'local_file_inspect', args: inspectArgs });
    const manifest = calls.inspection[0][2];
    await daemon._runNodeCommand(node, {
      commandId: 'cmd-release', action: 'local_file_release',
      args: { ...inspectArgs, authorization: 'automatic_safe', approvalId: null, approvedContentSha256: manifest.sha256 },
    });
    assert.equal(calls.upload.length, 1);
    assert.equal(calls.generic.length, 0);
  });
});
