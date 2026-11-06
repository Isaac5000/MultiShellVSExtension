'use strict';
const assert=require('node:assert/strict');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const until=async(fn,ms=7000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await wait(50);}throw Error('Timed out awaiting background job state.');};
(async()=>{
 const env=await environment(2);
 const shell='connection_0',other='connection_1';
 try{
  const command=process.platform==='win32'
   ?"Write-Output 'BG_BEGIN'; Start-Sleep -Seconds 2; Write-Output 'BG_END'"
   :"printf BG_BEGIN; sleep 2; printf BG_END";
  const begin=Date.now();
  console.log('BG_MCP_STAGE=start');
  const started=await tool(env.port,'start_background_command_code',{
   shell_id:shell,command,timeout:10000});
  assert.ok(Date.now()-begin<1500,'start must return without waiting for command completion');
  assert.equal(started.status,'running');
  assert.match(started.job_id,/^[0-9a-f-]{36}$/i);
  const job_id=started.job_id;
  console.log('BG_MCP_STAGE=progress');
  const active=await until(async()=>{
   const status=await tool(env.port,'get_background_command_code',{shell_id:shell,job_id});
   return status.output_tail.includes('BG_BEGIN')?status:undefined;
  });
  assert.equal(active.status,'running','Streaming output should be visible before completion');
  assert.ok(active.last_output_at);
  assert.equal(env.issued.length,0,'Background command must not touch integrated terminal queue');

  console.log('BG_MCP_STAGE=restart_hub');
  await env.restartHub();
  console.log('BG_MCP_STAGE=hub_restarted');
  // An HTTP coordinator restart may invalidate an idle keep-alive socket.
  // Retry only the read-only status request, NEVER re-submit the command.
  const recovered=await until(async()=>{
   try{return await tool(env.port,'get_background_command_code',{shell_id:shell,job_id});}
   catch(error){if(error?.cause?.code==='ECONNRESET')return undefined;throw error;}
  });
  assert.ok(['running','completed'].includes(recovered.status),
   'Worker-owned job must survive leader listener restart');
  console.log('BG_MCP_STAGE=completion');
  const done=await until(async()=>{
   const status=await tool(env.port,'get_background_command_code',{shell_id:shell,job_id});
   return status.status==='completed'?status:undefined;
  });
  assert.match(done.output_tail,/BG_END/);
  assert.equal(done.exit_code,0);
  assert.ok((await tool(env.port,'list_background_commands_code',{shell_id:shell})).jobs.some(j=>j.job_id===job_id));
  const denied=await tool(env.port,'get_background_command_code',{shell_id:other,job_id})
   .then(()=>false,()=>true);
  assert.equal(denied,true,'Another shell cannot read another job');
  console.log('BG_MCP_STAGE=cancel');
  const pending=await tool(env.port,'start_background_command_code',{
   shell_id:shell,command:process.platform==='win32'?'Start-Sleep -Seconds 20':'sleep 20',
   timeout:30000});
  const cancelled=await tool(env.port,'cancel_background_command_code',{
   shell_id:shell,job_id:pending.job_id});
  assert.ok(['cancelling','cancelled'].includes(cancelled.status));
  await until(async()=>{
   const status=await tool(env.port,'get_background_command_code',{
    shell_id:shell,job_id:pending.job_id});
   return status.status==='cancelled';
  });
  const after=await tool(env.port,'list_shells_code',{});
  assert.equal(after.shells.filter(s=>s.shell_id===shell).length,1,
   'Cancelling an isolated job must preserve its VS Code terminal');
  console.log('PASS MCP async job instant ID, live output, leader recovery, exact shell scope and isolated cancellation');
 }finally{await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
