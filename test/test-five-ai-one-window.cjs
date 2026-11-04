'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {performance}=require('node:perf_hooks');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const COUNT=5;
const until=async(check,timeout=8000)=>{
  const untilAt=Date.now()+timeout;
  while(Date.now()<untilAt){if(await check()){return;}await wait(10);}
  throw Error('One-window test timed out while waiting for state');
};
(async()=>{
 const env=await environment(1);
 const clients=Array.from({length:COUNT},()=>new http.Agent({keepAlive:true,maxSockets:8}));
 const shellNames=['connection_0'];
 const commands=Array.from({length:COUNT},()=>[]);
 try{
  assert.equal(env.router.windows().length,1);
  // Every simulated IA gets a separate terminal and separate working directory
  // in the SAME VS Code worker. No public ports or real user shells are touched.
  for(let i=1;i<COUNT;i++){
    const cwd=path.join(env.root,'ai-project-'+i);
    fs.mkdirSync(cwd);
    const name='ai_shell_'+i;
    env.managers[0].create(name,cwd,false,'user');
    shellNames.push(name);
  }
  assert.throws(()=>env.managers[0].create('shared_forbidden',
    path.join(env.root,'window0'),false,'user'),/already uses this directory/,
    'A second shell should not silently share a workspace without opt-in');
  await env.register(0);
  assert.equal(env.managers[0].list().length,COUNT);
  assert.equal((await env.router.list()).length,COUNT);

  const request=async(client,command,shell=shellNames[client])=>{
    const out=await tool(env.port,'execute_shell_command_code',
      {shell_id:shell,command,timeout:12000},{agent:clients[client]});
    assert.equal(out.exit_code,0);
    const result=JSON.parse(out.output);
    assert.equal(result.command,command);
    assert.equal(result.shell,shell);
    commands[client].push(command);
    return result;
  };
  const parallelAt=performance.now();
  await Promise.all(shellNames.map((_name,i)=>request(i,'delay:160:parallel_'+i)));
  const parallelMs=Math.round(performance.now()-parallelAt);
  const starts=env.issued.filter(x=>x.command.includes('parallel_'));
  const finishes=env.finished.filter(x=>x.command.includes('parallel_'));
  assert.equal(starts.length,COUNT);
  assert.equal(finishes.length,COUNT);
  assert.ok(Math.max(...starts.map(x=>x.at))<Math.min(...finishes.map(x=>x.at)),
    'One VS Code window must support five concurrent terminal executions');

  // Across 5 clients, 10 rounds of mixed bursts and 5 active shells.
  for(let wave=0;wave<10;wave++){
    await Promise.all(clients.flatMap((_c,i)=>Array.from({length:4},(_,j)=>
      request(i,'wave_'+wave+'_ai_'+i+'_job_'+j))));
  }
  assert.equal(env.managers[0].list().filter(x=>x.busy||x.queued>0).length,0);
  assert.equal(env.workers[0].requests.size,0);
  assert.equal(env.hub.sessions.size,0);

  // Queue protection within the SAME worker: client #1 holds its own shell,
  // while client #2 completes another shell without waiting for that hold.
  const held=request(1,'hold:one_window_barrier');
  await until(()=>env.holds.has('one_window_barrier'));
  const queued=request(2,'other_shell_unblocked');
  const result=await queued;
  assert.equal(result.command,'other_shell_unblocked');
  assert.ok(env.managers[0].list().some(x=>x.shell_id===shellNames[1]&&x.busy),
    'Held terminal should remain busy while another terminal finishes');
  env.releaseHold('one_window_barrier');
  await held;
  console.log('PASS five MCP clients, one coordinator, one VS Code worker, five distinct shells '+
    JSON.stringify({parallelMs,clients:COUNT,workerWindows:1,
      shellCount:COUNT,completedRequests:COUNT+COUNT*4*10+2,
      workspacesDistinct:true,explicitWorkspaceSharingGuard:true,
      independenceWithBlockedShell:true,clientAuthentication:false}));
 }finally{
  env.releaseHold('one_window_barrier');
  clients.forEach(a=>a.destroy());
  await env.stop();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
