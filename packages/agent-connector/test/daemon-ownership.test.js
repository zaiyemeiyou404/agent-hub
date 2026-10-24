'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {Config}=require('../src/config');
const {Daemon}=require('../src/daemon');
test('command writes and automatic stops cannot affect a live incompatible daemon',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aghub-owner-'));
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  await once(child,'spawn');
  try{
    fs.writeFileSync(path.join(dir,'daemon.pid'),String(child.pid));
    fs.writeFileSync(path.join(dir,'daemon.status.json'),JSON.stringify({pid:child.pid,core:{directory:'other-core',version:'99.0.0',sourceSha:'a'.repeat(40)}}));
    assert.throws(()=>new Config(dir).writeCommand('start:agent'),/incompatible|identity/i);
    assert.equal(fs.existsSync(path.join(dir,'daemon.cmd')),false);
    assert.throws(()=>Daemon.stopDaemon(dir),/incompatible|identity/i);
    assert.doesNotThrow(()=>process.kill(child.pid,0));
    const old=new Date(Date.now()-60000);fs.utimesSync(path.join(dir,'daemon.status.json'),old,old);
    assert.throws(()=>Daemon.readDaemonPid(dir),/incompatible|identity|uncertain/i);
    assert.equal(fs.readFileSync(path.join(dir,'daemon.pid'),'utf8'),String(child.pid));
  }finally{child.kill();await once(child,'exit').catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
test('status identity must belong to the PID being controlled',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aghub-pid-'));
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});await once(child,'spawn');
  try{
    const expected=require('../src/core-identity').verifyManagedCore();
    fs.writeFileSync(path.join(dir,'daemon.pid'),String(child.pid));
    fs.writeFileSync(path.join(dir,'daemon.status.json'),JSON.stringify({pid:process.pid,core:expected}));
    assert.throws(()=>new Config(dir).writeCommand('reload'),/identity|PID/i);
    assert.equal(fs.existsSync(path.join(dir,'daemon.cmd')),false);
  }finally{child.kill();await once(child,'exit').catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
