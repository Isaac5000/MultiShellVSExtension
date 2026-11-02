'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {environment,tool}=require('./connection-fixture.cjs');
(async()=>{
 const env=await environment(2);
 const blackhole=http.createServer(()=>{});await new Promise(resolve=>blackhole.listen(0,'127.0.0.1',resolve));
 try{
  env.router.register({window_id:env.workers[0].id,workspace:env.workers[0].workspace,worker_port:blackhole.address().port});
  const begin=Date.now();let timer;
  const list=await Promise.race([env.router.list(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Discovery blocked by one unresponsive worker')),3000);})]).finally(()=>clearTimeout(timer));
  assert.ok(Date.now()-begin<2900);assert.equal(list.length,1);
  assert.equal(env.router.windows().find(w=>w.window_id===env.workers[0].id).online,false);
  const result=await tool(env.port,'execute_shell_command_code',{shell_id:'connection_1',command:'unaffected_window',timeout:2000});assert.equal(result.exit_code,0);
  await env.register(0);assert.equal((await env.router.list()).length,2);
  console.log('PASS: unresponsive worker cannot stall global discovery; healthy windows remain usable and the failed worker reconnects');
 }finally{blackhole.closeAllConnections();await new Promise(resolve=>blackhole.close(resolve));await env.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
