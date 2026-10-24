'use strict';
const fs=require('fs'),path=require('path');
const {resolveVerifiedCore}=require('../../agent-connector/src/core-integrity');
module.exports=async context=>{
  const resources=context.packager.getResourcesDir(context.appOutDir);
  const manifest=fs.readFileSync(path.join(context.packager.projectDir,'.aghub-core/manifest.json'));
  const external=fs.readFileSync(path.join(resources,'aghub-core-manifest.json'));
  if(!manifest.equals(external))throw new Error('Packaged core manifest differs from staged manifest');
  const result=resolveVerifiedCore(JSON.parse(manifest),path.join(resources,'aghub-core'));
  console.log(`Verified packaged AgentHub core ${result.version} source=${result.sourceSha}`);
};
