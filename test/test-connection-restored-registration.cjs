'use strict';
const assert=require('node:assert/strict');
const {environment,wait}=require('./connection-fixture.cjs');
(async()=>{
 const env=await environment(1);let restored;
 try{
  const original='main-restored-1234abcd',cwd=env.workers[0].workspace;
  env.managers[0].create(original,cwd,true,'automatic');await env.register(0);
  await env.workers[0].stop();
  restored=new env.MultiWindowController(env.port,env.secret,cwd,async()=>{
   throw Object.assign(Error('Existing coordinator'),{code:'EADDRINUSE'});
  },()=>{},undefined,original);
  restored.localShells.create(original,cwd,true,'automatic');
  restored.localShells.awaitRestoredMainTerminals=async()=>original;
  const starting=restored.start().then(()=>({ok:true}),error=>({error}));
  const early=await Promise.race([starting,wait(150).then(()=>({waiting:true}))]);
  assert.ok(early.waiting,'A restored terminal must not permanently fail startup while the old window registration expires');
  // Advance only the old registration's TTL, without a 12-second test sleep.
  env.router.workers.get(env.workers[0].id).lastSeen=Date.now()-12001;
  const result=await starting;assert.ok(result.ok,result.error?.stack);
  assert.equal(env.router.ownerOf(original),restored.worker.id);
  assert.equal(restored.primaryShellId,original);
  assert.equal((await env.router.execute(original,'after_restore')).exit_code,0);
  console.log('PASS: a real HTTP coordinator accepts restored identities after the previous registration expires');
 }finally{await restored?.stop(true);await env.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
