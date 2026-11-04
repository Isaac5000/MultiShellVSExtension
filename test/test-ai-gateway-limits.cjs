'use strict';
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {classes,wait}=require('./connection-fixture.cjs');
const until=async(check,ms=10000)=>{
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){if(check())return;await wait(10);}
 throw Error('AI gateway concurrency test deadline');
};
(async()=>{
 const {MCPServer}=classes();
 const token=randomBytes(32).toString('base64url');
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const shell={
   list:()=>[{shell_id:'scope',initial_cwd:process.cwd()}],
   create:()=>{throw Error('Not authorized');},
   close:()=>{throw Error('Not authorized');},
   root:()=>process.cwd(),
   execute:async()=>{await gate;return{output:'done',exit_code:0};},
   windows:()=>[]
 };
 const server=new MCPServer(0,'127.0.0.1',shell,
   {file:false,edit:false,shell:true},undefined,{bearerToken:token});
 const requests=[],controllers=[];
 try{
  await server.start();
  const endpoint='http://127.0.0.1:'+server.listeningPort+'/mcp';
  const post=(id,signal)=>fetch(endpoint,{
    method:'POST',signal,
    headers:{'content-type':'application/json',
      accept:'application/json,text/event-stream',authorization:'Bearer '+token},
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{
      name:'execute_shell_command_code',
      arguments:{shell_id:'scope',command:'hold',timeout:20000}
    }})
  });
  for(let id=0;id<32;id++){
    const abort=new AbortController();controllers.push(abort);
    requests.push(post(id,abort.signal).catch(()=>undefined));
  }
  await until(()=>server.sessions.size===32);
  const excess=await post(33,AbortSignal.timeout(3000));
  assert.equal(excess.status,429,'The 33rd simultaneous request should be throttled');
  assert.equal(excess.headers.get('retry-after'),'1');
  const invalid=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+'X'.repeat(43)},
    body:'{}'});
  assert.equal(invalid.status,401,'Invalid credentials must be rejected before throttling');
  console.log('PASS: independent AI MCP endpoint limits in-flight requests to 32 and checks authentication before throttling');
 }finally{
  release();
  controllers.forEach(x=>x.abort());
  await Promise.allSettled(requests);
  await server.stop();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
