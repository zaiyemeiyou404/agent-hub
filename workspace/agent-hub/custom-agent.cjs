// Agent Hub example, Apache-2.0. Reuses the upstream adapter's lifecycle,
// permissions, event queues, stop handling and completion correlation.
'use strict';
const BaseAdapter = require('../../packages/agent-connector/src/adapters/base');

class CustomAgent extends BaseAdapter {
  async _handleMessage(message) {
    const channel = message.sessionId || this.channelName;
    await this.sendThinking(channel, 'Preparing a shared report');
    // Replace this with your own model/tool service. This demo invokes no model.
    const report = `Custom agent received:\n${message.content || ''}\n`;
    const file = await this.client.uploadFile(
      this.workspaceId, this.token, 'custom-agent-report.txt',
      Buffer.from(report).toString('base64'), {
        contentType: 'text/plain', source: `openagents:${this.agentName}`,
        channelName: channel, visibility: 'inherit',
      },
    );
    await this.sendResponse(channel, `Demo complete. Shared file: ${file.filename || 'custom-agent-report.txt'}`);
  }
}

async function main() {
  for (const key of ['OPENAGENTS_ENDPOINT', 'WORKSPACE_ID', 'WORKSPACE_TOKEN']) {
    if (!process.env[key]) throw new Error(`Set ${key} before starting the agent`);
  }
  const agent = new CustomAgent({
    endpoint: process.env.OPENAGENTS_ENDPOINT,
    workspaceId: process.env.WORKSPACE_ID,
    token: process.env.WORKSPACE_TOKEN,
    agentName: process.env.AGENT_NAME || 'custom-demo',
    channelName: process.env.CHANNEL_NAME || 'general',
    workingDir: process.cwd(), agentType: 'custom',
  });
  process.once('SIGINT', () => agent.stop());
  process.once('SIGTERM', () => agent.stop());
  await agent.run();
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { CustomAgent };
