'use strict';
const assert=require('node:assert/strict');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const until=async(test,ms=5000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await test();if(value)return value;await wait(25);}throw Error('Timed out waiting for background command.');};
(async()=>{
 const env=await environment(1);
 let busyRequest;
 try{
  busyRequest=tool(env.port,'execute_shell_command_code',{
   shell_id:'connection_0',command:'hold:user_busy',timeout:15000});
  await until(()=>env.holds.has('user_busy'));
  const startedAt=Date.now();
  const job=await tool(env.port,'start_background_command_code',{
   shell_id:'connection_0',
   command:process.platform==='win32'?"Write-Output 'PARALLEL_DONE'":"printf PARALLEL_DONE",
   timeout:7000});
  assert.ok(Date.now()-startedAt<1400,'Job must be accepted while an integrated terminal is busy');
  const finished=await until(async()=>{
   const state=await tool(env.port,'get_background_command_code',{
    shell_id:'connection_0',job_id:job.job_id});
   return state.status==='completed'?state:undefined;
  });
  assert.match(finished.output_tail,/PARALLEL_DONE/);
  assert.equal(env.managers[0].list()[0].busy,true,
   'Background completion must not unlock or interrupt a busy user terminal');
  assert.equal(env.issued.filter(e=>e.command==='hold:user_busy').length,1);
  env.releaseHold('user_busy');
  const main=await busyRequest;
  assert.equal(main.exit_code,0);
  assert.equal(env.managers[0].list()[0].busy,false);
  console.log('PASS background execution completes while same user terminal remains busy and untouched');
 }finally{env.releaseHold('user_busy');await busyRequest?.catch(()=>{});await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
