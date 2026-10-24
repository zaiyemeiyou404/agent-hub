import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {build} from 'vite';
import config from '../electron.vite.config.ts';

test('bundled validator executes outside the repository source tree',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aghub-bundle-'));
  try{
    const result=await build({configFile:false,logLevel:'silent',plugins:config.main.plugins,
      build:{...config.main.build,ssr:path.resolve('src/main/agents/core-manifest.ts'),write:false,minify:false,
        rollupOptions:{output:{format:'cjs'}}}});
    const chunk=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk');
    const module={exports:{}};
    vm.runInNewContext(chunk.code,{module,exports:module.exports,require:createRequire(path.join(dir,'main.cjs')),__dirname:dir,process,console});
    // Real validator rejection proves its implementation was bundled and loaded.
    assert.throws(()=>module.exports.resolveVerifiedCore({},dir),/schema/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
