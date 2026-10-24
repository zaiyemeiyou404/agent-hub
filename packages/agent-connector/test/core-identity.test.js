'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
test('managed CLI refuses altered source and a different launcher manifest before executing a command', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'aghub-cli 中文 '));
  try {
    const core = path.join(root,'core');
    fs.mkdirSync(path.join(core,'src'),{recursive:true}); fs.mkdirSync(path.join(core,'bin'));
    const files = {
      'package.json':JSON.stringify({name:'@zaiyemeiyou/aghub-connector',version:'0.2.196',main:'src/index.js',bin:{agn:'bin/agent-connector.js'},aghubManagedCore:true}),
      'src/index.js':'module.exports = {};',
      'bin/agent-connector.js':'const {verifyManagedCore}=require("../src/core-identity"); console.log(JSON.stringify(verifyManagedCore()));',
    };
    for(const name of ['core-identity.js','core-integrity.js']) {
      const file=path.resolve(__dirname,'../src',name);
      assert.ok(fs.existsSync(file), 'managed core verification must exist');
      files['src/'+name]=fs.readFileSync(file,'utf8');
    }
    for(const [name,bytes] of Object.entries(files))fs.writeFileSync(path.join(core,name),bytes);
    const manifest=JSON.stringify({schemaVersion:1,connectorVersion:'0.2.196',sourceSha:'d'.repeat(40),entrypoints:{main:'src/index.js',cli:'bin/agent-connector.js'},hashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(v)]))});
    fs.writeFileSync(path.join(root,'manifest.json'),manifest);
    const run=(digest=hash(manifest))=>spawnSync(process.execPath,[path.join(core,'bin/agent-connector.js')],{encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,AGHUB_CORE_MANIFEST_SHA256:digest}});
    const good=run();assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).sourceSha,'d'.repeat(40));
    const wrong=run('e'.repeat(64));assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/manifest/i);
    fs.unlinkSync(path.join(root,'manifest.json'));
    const env={...process.env};delete env.AGHUB_CORE_MANIFEST_SHA256;
    const missing=spawnSync(process.execPath,[path.join(core,'bin/agent-connector.js')],{encoding:'utf8',windowsHide:true,env});
    assert.notEqual(missing.status,0,'shipped CLI must refuse a missing manifest without Launcher env');
    fs.writeFileSync(path.join(root,'manifest.json'),manifest);
    fs.writeFileSync(path.join(core,'src/index.js'),'module.exports = { changed:true };');
    const changed=run();assert.notEqual(changed.status,0);assert.match(changed.stderr,/hash/i);assert.equal(changed.stdout,'');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test('verified standalone CLI does not load optional ws addons from outside the manifest',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aghub-addon-'));
  try{
    const core=path.join(root,'core');fs.mkdirSync(path.join(core,'src'),{recursive:true});fs.mkdirSync(path.join(core,'bin'));
    fs.mkdirSync(path.join(core,'node_modules/ws/lib'),{recursive:true});
    for(const name of ['buffer-util.js','constants.js'])fs.copyFileSync(path.join(path.dirname(require.resolve('ws/package.json')),'lib',name),path.join(core,'node_modules/ws/lib',name));
    fs.mkdirSync(path.join(root,'node_modules/bufferutil'),{recursive:true});
    const marker=path.join(root,'UNMANAGED_ADDON_EXECUTED');
    fs.writeFileSync(path.join(root,'node_modules/bufferutil/index.js'),'require("fs").writeFileSync('+JSON.stringify(marker)+',"loaded");module.exports={};');
    fs.writeFileSync(path.join(core,'package.json'),JSON.stringify({name:'@zaiyemeiyou/aghub-connector',version:'0.2.196',main:'src/index.js',bin:{agn:'bin/agent-connector.js'},aghubManagedCore:true}));
    fs.writeFileSync(path.join(core,'src/index.js'),'module.exports={};');
    fs.writeFileSync(path.join(core,'bin/agent-connector.js'),'require("../src/core-identity").verifyManagedCore();require("../node_modules/ws/lib/buffer-util");console.log("verified");');
    for(const name of ['core-identity.js','core-integrity.js'])fs.copyFileSync(path.resolve(__dirname,'../src',name),path.join(core,'src',name));
    const {listControlledFiles}=require('../src/core-integrity');
    fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:1,connectorVersion:'0.2.196',sourceSha:'f'.repeat(40),entrypoints:{main:'src/index.js',cli:'bin/agent-connector.js'},hashes:Object.fromEntries(listControlledFiles(core).map(name=>[name,hash(fs.readFileSync(path.join(core,name)))]))}));
    const env={...process.env};delete env.WS_NO_BUFFER_UTIL;delete env.WS_NO_UTF_8_VALIDATE;delete env.AGHUB_CORE_MANIFEST_SHA256;
    const result=spawnSync(process.execPath,[path.join(core,'bin/agent-connector.js')],{encoding:'utf8',env,windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/verified/);
    assert.equal(fs.existsSync(marker),false,'external addon must never execute after verification');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
