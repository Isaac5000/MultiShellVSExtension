'use strict';
const assert=require('node:assert/strict');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const until=async(fn,ms=6000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(50);}throw Error('Timed out.');};
(async()=>{
 const env=await environment(1);
 let newHub;
 try{
  const started=await tool(env.port,'start_background_command_code',{
   shell_id:'connection_0',
   command:process.platform==='win32'
    ?"Write-Output 'RUN_ONCE'; Start-Sleep -Seconds 3; Write-Output 'STILL_ALIVE'"
    :"printf RUN_ONCE; sleep 3; printf STILL_ALIVE",
   timeout:15000});
  const id=started.job_id;
  await until(async()=>{
   const s=await tool(env.port,'get_background_command_code',{shell_id:'connection_0',job_id:id});
   return s.output_tail.includes('RUN_ONCE');
  });
  await env.hub.stop();
  // The second coordinator is a fresh router, not just a restarted HTTP listener.
  const router=new env.WindowRouter(env.secret);
  const worker=env.workers[0];
  router.register({window_id:worker.id,workspace:worker.workspace,worker_port:worker.port});
  await router.reconcile(worker.id);
  newHub=new env.MCPServer(env.port,'127.0.0.1',router,
   {file:false,edit:false,shell:true},router);
  await newHub.start();
  const status=await until(async()=>{
   try{
    const s=await tool(env.port,'get_background_command_code',{
     shell_id:'connection_0',job_id:id},{headers:{connection:'close'}});
    return s.status==='completed'?s:undefined;
   }catch(e){if(e.cause?.code==='ECONNRESET')return undefined;throw e;}
  });
  assert.equal(status.exit_code,0);
  assert.match(status.output_tail,/STILL_ALIVE/);
  assert.equal(env.issued.length,0,'No integrated-terminal replay after a new coordinator is elected');
  console.log('PASS a fresh hub router can recover one running worker-owned job without replay');
 }finally{await newHub?.stop();await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
