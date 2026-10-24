#!/usr/bin/env node
'use strict';

// Source facts only. Never load .env, local account files or runtime secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = ['pyproject.toml', 'LICENSE', 'packages/launcher/package.json', 'packages/launcher/package-lock.json', 'packages/agent-connector/package.json', 'packages/agent-connector/package-lock.json', 'workspace/frontend/package.json', 'workspace/frontend/package-lock.json', 'sdk/studio/package.json', 'workspace/backend/requirements.txt', 'workspace/backend/requirements.production.lock'];
const entries = files.map(file => {
  const bytes = fs.readFileSync(path.join(root, file));
  const entry = { path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  if (file.endsWith('.json')) {
    const data = JSON.parse(bytes);
    Object.assign(entry, { name: data.name, version: data.version, license: data.license || null });
    if (file.endsWith('package-lock.json')) {
      entry.lockfileVersion = data.lockfileVersion;
      entry.rootConnectorDependency = data.packages?.['']?.dependencies?.['@openagents-org/agent-launcher'] || null;
      entry.connector = data.packages?.['node_modules/@openagents-org/agent-launcher'] || null;
    }
  }
  return entry;
});
const snapshot = {
  measuredOn: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  node: process.version, platform: process.platform, arch: process.arch,
  files: entries,
};
const target = path.join(root, 'docs', 'aghub', 'baseline-snapshot.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n');
console.log(target);
