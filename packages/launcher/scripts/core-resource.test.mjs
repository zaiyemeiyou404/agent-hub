import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {getFileMatchers,copyFiles}=require('app-builder-lib/out/fileMatcher.js');
const integrity=require('../../agent-connector/src/core-integrity.js');

test('electron-builder extraResources preserves every hashed core dependency',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aghub-resource-'));
  try{
    const staging=path.join(root,'.aghub-core'),core=path.join(staging,'core');
    fs.mkdirSync(path.join(core,'src'),{recursive:true});fs.mkdirSync(path.join(core,'bin'));fs.mkdirSync(path.join(core,'node_modules/ws'),{recursive:true});
    const files={'package.json':JSON.stringify({name:'@zaiyemeiyou/aghub-connector',version:'1.0.0',main:'src/index.js',bin:{agn:'bin/agent-connector.js'}}),'src/index.js':'module.exports=require("ws");','bin/agent-connector.js':'console.log("core");','node_modules/ws/index.js':'module.exports="own";','node_modules/ws/LICENSE':'fixture-license','node_modules/ws/.npmignore':'fixture'};
    for(const [name,bytes] of Object.entries(files))fs.writeFileSync(path.join(core,name),bytes);
    const manifest={schemaVersion:1,connectorVersion:'1.0.0',sourceSha:'a'.repeat(40),entrypoints:{main:'src/index.js',cli:'bin/agent-connector.js'},hashes:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,integrity.sha256(bytes)]))};
    fs.writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(manifest));
    const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
    const mappings=pkg.build.extraResources.filter(x=>x.from.startsWith('.aghub-core'));
    const dest=path.join(root,'resources');
    await copyFiles(getFileMatchers({extraResources:mappings},'extraResources',dest,{defaultSrc:root,globalOutDir:path.join(root,'dist'),customBuildOptions:{},macroExpander:x=>x}),null,false);
    const verified=integrity.resolveVerifiedCore(manifest,path.join(dest,'aghub-core'));
    assert.equal(require(verified.entrypoints.main),'own');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
