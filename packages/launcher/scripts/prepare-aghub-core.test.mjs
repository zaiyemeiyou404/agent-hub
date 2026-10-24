import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('stages only repository source and exact installed dependencies with reproducible hashes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aghub 构建 '));
  try {
    const source = path.join(dir, 'connector');
    fs.mkdirSync(path.join(source, 'src'), { recursive: true });
    fs.mkdirSync(path.join(source, 'bin'));
    fs.mkdirSync(path.join(source, 'node_modules/ws'), { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({name: '@zaiyemeiyou/aghub-connector', version: '0.2.196', main:'src/index.js', bin:{agn:'bin/agent-connector.js'}, files:['src/','bin/'], dependencies:{ws:'1.0.0'}}));
    fs.writeFileSync(path.join(source, 'src/index.js'), 'module.exports = require("ws");\n');
    fs.writeFileSync(path.join(source, 'bin/agent-connector.js'), '#!/usr/bin/env node\nconsole.log("fixture");\n');
    fs.writeFileSync(path.join(source, 'node_modules/ws/package.json'), '{"name":"ws","version":"1.0.0","main":"index.js"}');
    fs.writeFileSync(path.join(source, 'node_modules/ws/index.js'), 'module.exports = "owned-dependency";');
    fs.writeFileSync(path.join(source, 'not-shipped.txt'), 'private fixture');
    const { prepareCore } = await import('./prepare-aghub-core.mjs');
    const out = path.join(dir, 'output');
    const options = { connectorRoot: source, outputRoot: out, sourceSha: 'b'.repeat(40) };
    const a = await prepareCore(options);
    const manifest = fs.readFileSync(path.join(out, 'manifest.json'), 'utf8');
    assert.equal(a.sourceSha, 'b'.repeat(40));
    assert.equal(fs.existsSync(path.join(out, 'core/not-shipped.txt')), false);
    assert.equal(a.hashes['node_modules/ws/index.js'], '9adfcfa4957ac24431f86f1a6f6702a4ab95153a357a6dcee1c9778c2b4cf8cf');
    await prepareCore(options);
    assert.equal(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'), manifest);
    fs.writeFileSync(path.join(source, 'node_modules/ws/index.js'), 'module.exports = "modified";');
    const b = await prepareCore(options);
    assert.notEqual(a.hashes['node_modules/ws/index.js'], b.hashes['node_modules/ws/index.js']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
