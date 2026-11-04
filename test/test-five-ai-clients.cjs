'use strict';
// Five independent MCP HTTP clients against ONE isolated coordinator.
// This is a protocol/load simulation, NOT five real model applications.
const assert=require('node:assert/strict');
const http=require('node:http');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const CLIENTS=5;
const ROUNDS=15;
const BURST=12;
const until=async(check,timeout=12000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await wait(10);}
  throw Error('Timed out waiting for multi-client condition');
};
const quantile=(values,q)=>values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*q)];
(async()=>{
 const env=await environment(CLIENTS);
 const agents=Array.from({length:CLIENTS},()=>new http.Agent({keepAlive:true,maxSockets:8}));
 const samples=[];
 const lag=monitorEventLoopDelay({resolution:20});
 lag.enable();
 const exec=async(client,shell,command,timeout=15000)=>{
   const start=performance.now();
   const output=await tool(env.port,'execute_shell_command_code',
     {shell_id:'connection_'+shell,command,timeout},{agent:agents[client]});
   const decoded=JSON.parse(output.output);
   assert.equal(output.exit_code,0);
   assert.equal(decoded.command,command,'Replies cannot be mixed between clients');
   assert.equal(decoded.shell,'connection_'+shell,'Each tool call must route to the requested shell');
   samples.push(performance.now()-start);
   return output;
 };
 try{
   // A single coordinator can accept five independent client connections;
   // commands on distinct shells must overlap instead of sharing one mutex.
   const begin=performance.now();
   await Promise.all(Array.from({length:CLIENTS},(_,i)=>
     exec(i,i,'delay:180:parallel_client_'+i)));
   const parallelMs=Math.round(performance.now()-begin);
   const firstWave=env.issued.filter(x=>x.command.includes('parallel_client_'));
   const firstDone=env.finished.filter(x=>x.command.includes('parallel_client_'));
   assert.equal(firstWave.length,CLIENTS);
   assert.equal(firstDone.length,CLIENTS);
   assert.ok(Math.max(...firstWave.map(x=>x.at))<Math.min(...firstDone.map(x=>x.at)),
     'Five distinct terminals should be simultaneously executing');
   assert.equal(env.hub.sessions.size,0,'No leftover MCP sessions after parallel wave');

   // Sustained parallel calls: each client has its own connection pool and shell.
   const sustainedStart=performance.now();
   await Promise.all(agents.map(async(_agent,i)=>{
     for(let cycle=0;cycle<ROUNDS;cycle++){
       await exec(i,i,'delay:8:client_'+i+'_cycle_'+cycle);
     }
   }));
   const sustainedMs=Math.round(performance.now()-sustainedStart);

   // 60 total requests across five clients, in 20-request waves to respect
   // the main MCP listener's 32 in-flight request ceiling.
   const burstStart=performance.now();
   for(let offset=0;offset<BURST;offset+=4){
     await Promise.all(agents.flatMap((_agent,i)=>Array.from({length:4},(_,n)=>
       exec(i,i,'burst_'+i+'_'+(offset+n)))));
   }
   const burstMs=Math.round(performance.now()-burstStart);
   assert.equal(env.managers.reduce((sum,m)=>sum+m.list()[0].queued,0),0,
     'No shell queue should remain after a burst');
   assert.ok(env.workers.every(worker=>worker.requests.size===0),
     'Worker HTTP requests should be released');
   assert.equal(env.hub.sessions.size,0,'MCP sessions should be released');

   // Same-shell contention is intentionally SERIAL, never concurrent.
   const hold=exec(0,0,'hold:five_ai_shared');
   await until(()=>env.holds.has('five_ai_shared'));
   const waiting=agents.map((_agent,i)=>exec(i,0,'shared_'+i));
   try{
     await until(()=>env.managers[0].list()[0].queued===CLIENTS);
     assert.equal(env.issued.filter(x=>x.command.startsWith('shared_')).length,0,
       'No waiting client may bypass the active command on this shell');
   }finally{env.releaseHold('five_ai_shared');}
   await Promise.all([hold,...waiting]);
   const shared=env.issued.filter(x=>/^shared_\d+$/.test(x.command));
   assert.equal(shared.length,CLIENTS);
   assert.equal(new Set(shared.map(x=>x.command)).size,CLIENTS);
   for(let i=1;i<shared.length;i++){
     const prior=env.finished.find(x=>x.command===shared[i-1].command);
     assert.ok(prior&&shared[i].at>=prior.at,
       'Commands targeting one shell must run one after another');
   }

   // Negative security demonstration: a client with access to the endpoint
   // can address ANOTHER client's shell. Profiles are labels, NOT identities.
   await exec(4,0,'cross_client_access_allowed_by_current_server');
   assert.ok(env.issued.some(x=>x.shell==='connection_0'&&
     x.command==='cross_client_access_allowed_by_current_server'));

   const summary={
     clients:CLIENTS,coordinatorCount:1,workers:CLIENTS,
     requests:CLIENTS+CLIENTS*ROUNDS+CLIENTS*BURST+1+CLIENTS+1,
     parallelMs,sustainedMs,burstMs,
     p50Ms:Math.round(quantile(samples,.50)),
     p95Ms:Math.round(quantile(samples,.95)),
     p99Ms:Math.round(quantile(samples,.99)),
     eventLoopLagP99Ms:Math.round(lag.percentile(99)/1e6*10)/10,
     sameShellQueue: 'serialized',
     clientIdentityIsolation: false,
     transport:'loopback HTTP MCP (five independent agents)',
     realAiProvidersTested:0
   };
   console.log('PASS five-client MCP coordinator load '+JSON.stringify(summary));
 }finally{
   lag.disable();
   env.releaseHold('five_ai_shared');
   agents.forEach(a=>a.destroy());
   await env.stop();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});