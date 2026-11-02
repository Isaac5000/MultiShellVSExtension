'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment}=require('./connection-fixture.cjs');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
async function scenario(name,run){
 const env=await environment(1),extra=[];
 async function replacement(id='connection_0'){
  const cwd=path.join(env.root,'replacement');fs.mkdirSync(cwd);
  const manager=new env.ShellManager(async()=> 'unknown');
  if(id)manager.create(id,cwd,true,'mcp');
  const worker=new env.WindowWorker(manager,env.secret,cwd);extra.push({worker,manager});await worker.start();
  env.router.register({window_id:env.workers[0].id,workspace:cwd,worker_port:worker.port});
  return{manager,worker,cwd};
 }
 try{await run(env,replacement);console.log('PASS: '+name);}
 finally{for(const {worker,manager} of extra){await worker.stop();manager.dispose(true);}await env.stop();}
}
(async()=>{
 const failures=[];
 for(const [name,run] of [
  ['late alias acknowledgement cannot publish a dangling alias',async(env,replace)=>{
   const entered=deferred(),release=deferred();
   env.workers[0].onAliasChanged=async()=>{entered.resolve();await release.promise;};
   const changing=env.router.setAlias('connection_0','late_alias').then(value=>({value}),error=>({error}));
   await entered.promise;await replace();release.resolve();const result=await changing;
   assert.match(result.error?.message||'',/connection changed|reconnect/i);
   assert.equal(env.router.aliases.has('late_alias'),false);
   await env.router.reconcile(env.workers[0].id);
   assert.equal(env.router.pendingAliasShells.size,0);assert.equal(env.router.reservedAliases.size,0);
  }],
  ['late creation cannot rename or close a replacement terminal',async(env,replace)=>{
   const send=env.router.send.bind(env.router),entered=deferred(),release=deferred();
   env.router.send=async(id,action,...rest)=>{const value=await send(id,action,...rest);
    if(action.op==='create'){entered.resolve();await release.promise;}return value;};
   const creating=env.router.create('late_create',env.workers[0].workspace,true,env.workers[0].id)
    .then(value=>({value}),error=>({error}));
   await entered.promise;const current=await replace('late_create');current.worker.aliases.set('late_create','replacement_alias');
   release.resolve();const result=await creating;
   assert.match(result.error?.message||'',/connection changed|reconnect/i);
   assert.equal(current.manager.list().length,1);assert.equal(current.worker.aliases.get('late_create'),'replacement_alias');
   assert.equal(env.router.assigned.has('late_create'),false);
  }],
  ['late close acknowledgement cannot remove a replacement assignment',async(env,replace)=>{
   await env.router.create('late_close',env.workers[0].workspace,true,env.workers[0].id);
   const send=env.router.send.bind(env.router),entered=deferred(),release=deferred();
   env.router.send=async(id,action,...rest)=>{const value=await send(id,action,...rest);
    if(action.op==='close'){entered.resolve();await release.promise;}return value;};
   const closing=env.router.close('late_close').then(()=>({ok:true}),error=>({error}));
   await entered.promise;const current=await replace('late_close');await env.router.reconcile(env.workers[0].id);
   release.resolve();const result=await closing;
   assert.match(result.error?.message||'',/connection changed|reconnect/i);
   assert.equal(env.router.root('late_close'),current.cwd);assert.equal(current.manager.list().length,1);
  }],
  ['late failed discovery cannot mark a replacement worker offline',async(env,replace)=>{
   const send=env.router.send.bind(env.router),entered=deferred(),release=deferred();let first=true;
   env.router.send=async(id,action,...rest)=>{if(first&&action.op==='list'){
    first=false;entered.resolve();await release.promise;throw Error('Old connection failed');
   }return send(id,action,...rest);};
   const listing=env.router.list();await entered.promise;const current=await replace();
   await env.router.reconcile(env.workers[0].id);release.resolve();await listing;
   assert.equal(env.router.windows()[0].online,true);assert.equal(env.router.root('connection_0'),current.cwd);
  }],
  ['late successful discovery cannot return the previous terminal snapshot',async(env,replace)=>{
   const send=env.router.send.bind(env.router),entered=deferred(),release=deferred();let first=true;
   env.router.send=async(id,action,...rest)=>{const value=await send(id,action,...rest);
    if(first&&action.op==='list'){first=false;entered.resolve();await release.promise;}return value;};
   const listing=env.router.list();await entered.promise;await replace();await env.router.reconcile(env.workers[0].id);
   release.resolve();assert.deepEqual(await listing,[]);assert.equal((await env.router.list()).length,1);
  }]
 ]){try{await scenario(name,run);}catch(error){failures.push(name+': '+error.message);}}
 assert.deepEqual(failures,[]);
})().catch(error=>{console.error(error);process.exitCode=1;});
