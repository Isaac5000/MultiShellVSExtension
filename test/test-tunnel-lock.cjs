'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {TunnelLaunchLock,processIsAlive}=require('../out/tunnel-lock.js');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-tunnel-lock-'));
 try{
  let active=false;
  const locked=new TunnelLaunchLock(root,async()=>active);
  const contender=new TunnelLaunchLock(root,async()=>active);
  assert.equal(processIsAlive(process.pid),true);
  assert.equal(processIsAlive(0),false);
  assert.equal(await locked.acquire('profile-a',3000),true);
  assert.equal(await contender.acquire('profile-a',3000),false,'Two windows cannot acquire the same lock');
  let snapshot=await locked.inspect();
  assert.equal(snapshot.ownerPid,process.pid);
  assert.equal(snapshot.endpointPort,3000);
  await locked.setChild(process.pid);
  snapshot=await contender.inspect();
  assert.equal(snapshot.childPid,process.pid);
  locked.detach(); // Extension reload: child survives; new extension must not steal lock.
  assert.equal(await contender.acquire('profile-a',3000),false);
  assert.ok(fs.existsSync(locked.filename));
  // Simulated crash leaves a dead owner and child; recovery is allowed only
  // when the port is also unoccupied.
  await fs.promises.writeFile(locked.filename,JSON.stringify({
   token:'stale',ownerPid:99999999,childPid:99999998,
   profile:'profile-a',createdAt:Date.now()-90000,endpointPort:3000
  }));
  active=true;
  assert.equal(await contender.acquire('profile-a',3000),false,
   'Never steal a stale-looking lock while a listener is active');
  active=false;
  assert.equal(await contender.acquire('profile-a',3000),true,
   'Reclaim stale lock when owner, child and listener are all absent');
  const after=await contender.inspect();
  assert.notEqual(after.token,'stale');
  await contender.release();
  assert.equal(fs.existsSync(locked.filename),false);
  // Regression: during the asynchronous port probe another process creates
  // a new valid lock. A stale reclaimer must never rename that new lock.
  const injected=new TunnelLaunchLock(root,async()=>{
    await fs.promises.writeFile(injected.filename,JSON.stringify({
      token:'new-live-owner',ownerPid:process.pid,createdAt:Date.now(),
      profile:'profile-a',endpointPort:3000
    }));
    return false;
  });
  await fs.promises.writeFile(injected.filename,JSON.stringify({
    token:'stale-owner',ownerPid:99999999,createdAt:Date.now()-90000,
    profile:'profile-a',endpointPort:3000
  }));
  assert.equal(await injected.acquire('profile-b',3000),false);
  assert.equal((await injected.inspect()).token,'new-live-owner',
    'Recovery must not delete a lock that changed during an async operation');
  await fs.promises.unlink(injected.filename);
  // Parallel stale recovery must elect one winner, never replace its lock.
  await fs.promises.writeFile(injected.filename,JSON.stringify({
    token:'old-stale',ownerPid:99999999,createdAt:Date.now()-90000,
    profile:'profile-a',endpointPort:3000
  }));
  const a=new TunnelLaunchLock(root,async()=>false);
  const b=new TunnelLaunchLock(root,async()=>false);
  const results=await Promise.all([a.acquire('profile-x',3000),b.acquire('profile-y',3000)]);
  assert.equal(results.filter(Boolean).length,1,'Concurrent reclaimers must have only one winner');
  await a.release();await b.release();
  // If a recovery process crashes, fail closed rather than opening the race.
  await fs.promises.writeFile(injected.filename,JSON.stringify({
    token:'old-stale',ownerPid:99999999,createdAt:Date.now()-90000,
    profile:'profile-a',endpointPort:3000
  }));
  await fs.promises.mkdir(injected.filename+'.reclaim');
  assert.equal(await contender.acquire('profile-x',3000),false,
    'Recovery guard residue must block unsafe reclaim');
  await fs.promises.rmdir(injected.filename+'.reclaim');
  await fs.promises.unlink(injected.filename);
  assert.equal(await locked.acquire('profile-c',3000),true);
  await locked.release();
  console.log('PASS: atomic shared lock; duplicate rejection, child persistence across reload, external-port protection and stale crash recovery');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});