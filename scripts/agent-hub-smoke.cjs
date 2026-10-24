// Runs against a disposable local deployment; uses no model/provider credentials.
'use strict';
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { WorkspaceClient } = require('../packages/agent-connector/src/workspace-client');
const { CustomAgent } = require('../workspace/agent-hub/custom-agent.cjs');

async function until(check, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(500);
  }
  throw new Error(`Timed out: ${label}`);
}

async function main() {
  const endpoint = process.env.OPENAGENTS_ENDPOINT || 'http://127.0.0.1:8000';
  const client = new WorkspaceClient(endpoint);
  const workspace = await client.createWorkspace({ name: 'Disposable Agent Hub smoke test', agentName: 'custom-demo' });
  const { workspaceId, token, channelName } = workspace;
  assert.ok(channelName, 'workspace has an initial thread');
  const agent = new CustomAgent({ endpoint, workspaceId, token, agentName: 'custom-demo', channelName });
  let ready = false;
  let runError;
  agent._log = message => { if (message === 'Starting poll loop...') ready = true; };
  const running = agent.run().catch(error => { runError = error; });
  try {
    await until(() => { if (runError) throw runError; return ready; }, 'agent polling readiness');
    const marker = `agent-hub-smoke-${Date.now()}`;
    await client.sendMessage(workspaceId, channelName, token, `@custom-demo ${marker}`, {
      senderType: 'human', senderName: 'smoke',
    });
    await until(async () => {
      const messages = await client.pollMessages(workspaceId, channelName, token);
      return messages.find(message => (message.content || '').startsWith('Demo complete.'));
    }, 'custom agent reply');
    // Read as the agent that owns the report; a bare machine token must not
    // bypass file visibility rules merely because it can manage this workspace.
    const agentClient = client.withAgent('custom-demo');
    const listing = await agentClient.listFiles(workspaceId, token);
    const file = listing.files.find(item => item.filename.endsWith('custom-agent-report.txt'));
    assert.ok(file, 'custom agent uploaded the shared report');
    const content = await agentClient.readFile(workspaceId, token, file.id);
    assert.ok(content.toString().includes(marker), 'downloaded report contains the request');
    console.log('PASS: workspace creation, agent join/poll, group reply, shared-file upload and download');
  } finally {
    agent.stop();
    await running;
    await client.deleteWorkspace(workspaceId, token);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
