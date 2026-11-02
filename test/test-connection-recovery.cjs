'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {environment,rpc,tool,wait}=require('./connection-fixture.cjs');
async function until(check,ms=4000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await wait(10);}throw Error('Recovery exceeded '+ms+'ms');}
const execute=(env,id,command,signal)=>tool(env.port,'execute_shell_command_code',
 {shell_id:id,command,timeout:5000},{signal,headers:{connection:'close'}}).then(value=>({value}),error=>({error}));
let phase='setup';
(async()=>{
 const env=await environment();
 try{
  await env.router.setAlias('connection_0','stable_alias');
  for(let cycle=0;cycle<30;cycle++){
   phase='worker restart '+cycle;
   const index=cycle%3;await env.workers[index].stop();
   const shells=await env.router.list();assert.equal(shells.some(s=>s.shell_id==='connection_'+index),false);
   const other=await execute(env,'connection_'+((index+1)%3),'other_window_'+cycle);
   assert.ok(other.value,'A disconnected worker must not block another window');
   await env.workers[index].start();await env.register(index);
   const result=await execute(env,'connection_'+index,'worker_reconnected_'+cycle);assert.ok(result.value);
   assert.equal(env.router.resolve('stable_alias'),'connection_0');
  }
  for(let cycle=0;cycle<20;cycle++){
   phase='hub restart '+cycle;
   await env.restartHub();assert.equal(env.hub.sessions.size,0);
   // A reconnect opens a new TCP connection; stale keep-alive sockets from a
   // deliberately stopped server are not a valid new connection.
   const response=await rpc(env.port,'tools/list',{}, {headers:{connection:'close'}});assert.ok(response.result.tools.length);
   const values=await Promise.all([0,1,2].map(index=>execute(env,'connection_'+index,'hub_reconnected_'+cycle+'_'+index)));
   assert.ok(values.every(value=>value.value));
  }
  // Disconnected queued requests must never execute after reconnect.
  const first=execute(env,'connection_0','delay:600:queue_barrier');
  phase='queued cancellation';
  await until(()=>env.managers[0].list()[0].busy);
  const controllers=Array.from({length:100},()=>new AbortController());
  const queued=controllers.map((controller,index)=>execute(env,'connection_0','queue_'+index,controller.signal));
  await until(()=>env.managers[0].list()[0].queued>=50);
  controllers.forEach((controller,index)=>{if(index%5!==0)controller.abort();});
  const settled=await Promise.all(queued);assert.ok((await first).value);
  settled.forEach((value,index)=>assert.equal(!!value.value,index%5===0));
  assert.equal(env.issued.filter(item=>/^queue_/.test(item.command)).length,20);
  assert.equal(env.managers[0].list()[0].queued,0);

  // The hub can disappear while a user command continues in its worker.
  const active=execute(env,'connection_1','delay:2300:preserved_on_hub_loss');
  phase='hub loss during active work';
  await until(()=>env.managers[1].list()[0].busy);
  const cancelled=execute(env,'connection_1','must_not_run_after_hub_loss');
  await until(()=>env.managers[1].list()[0].queued===1);
  const previous=env.hub;await env.restartHub();
  assert.equal(previous.sessions.size,0);
  assert.ok((await active).error);assert.ok((await cancelled).error);
  await until(()=>!env.managers[1].list()[0].busy);
  assert.equal(env.issued.filter(item=>item.command==='preserved_on_hub_loss'||item.command==='delay:2300:preserved_on_hub_loss').length,1);
  assert.equal(env.issued.some(item=>item.command==='must_not_run_after_hub_loss'),false);
  assert.ok((await execute(env,'connection_1','after_hub_loss')).value);

  env.router.workers.get(env.workers[0].id).lastSeen=Date.now()-13000;
  assert.throws(()=>env.router.resolve('stable_alias'),/Unknown shell_id/);
  await env.register(0);assert.equal(env.router.resolve('stable_alias'),'connection_0');
  assert.equal((await env.router.list()).length,3);
  console.log('PASS: 30 worker reconnects, 20 hub restarts, 100 queued requests with 80 cancellations, preserved active command, no replay and stale-registration recovery');
 }finally{await env.stop();}
})().catch(error=>{console.error(phase,error);process.exitCode=1;});
