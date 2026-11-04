'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
 './multi-window':{
  REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',
  authenticated:(given,expected)=>typeof given==='string'&&given===expected
 },
 './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
(async()=>{
 const token='a'.repeat(64);
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const calls=[];
 const shells={list:async()=>[{shell_id:'probe',initial_cwd:process.cwd()}],
  windows:()=>[],root:()=>process.cwd(),
  execute:async(_id,command)=>{calls.push(command);if(command==='hold')await gate;return{output:'safe',exit_code:0};}};
 const server=new MCPServer(0,'127.0.0.1',shells,{file:false,edit:false,shell:true},
  undefined,{localToken:token});
 const body=id=>JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{
  name:'execute_shell_command_code',arguments:{shell_id:'probe',command:'hold',timeout:20000}}});
 const fetchCall=(id,headers={},signal)=>fetch('http://127.0.0.1:'+server.listeningPort+'/mcp',{
  method:'POST',signal,headers:{'content-type':'application/json',
   accept:'application/json,text/event-stream',...headers},body:body(id)
 });
 let pending=[];
 try{
  await server.start();
  const missing=await fetchCall(0);
  assert.equal(missing.status,401,'main listener must deny missing credential');
  const malformed=await fetch('http://127.0.0.1:'+server.listeningPort+'/mcp',{
   method:'POST',headers:{'content-type':'application/json'},body:'{not-json'});
  assert.equal(malformed.status,401,'reject auth BEFORE parsing malformed request bodies');
  assert.equal(calls.length,0,'unauthenticated request must not execute commands');
  const invalid=await fetchCall(0,{'x-multishell-local-auth':'b'.repeat(64)});
  assert.equal(invalid.status,401);
  const authorized={'x-multishell-local-auth':token};
  const start=Date.now();
  for(let i=1;i<=32;i++)pending.push(fetchCall(i,authorized));
  while(server.sessions.size<32 && Date.now()-start<9000){
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(server.sessions.size,32,'all 32 legitimate requests must arrive');
  const excess=await fetchCall(34,authorized);
  assert.equal(excess.status,429,'main /mcp must enforce concurrency ceiling');
  assert.equal(excess.headers.get('retry-after'),'1');
  const stillDenied=await fetchCall(35);
  assert.equal(stillDenied.status,401,'auth denial precedes overload');
  console.log('PASS production main auth and limit contract, no unauth shell execution');
 }finally{
  release();
  await Promise.allSettled(pending.map(async p=>(await p).body?.cancel()));
  await server.stop();
 }
 const extension=fs.readFileSync(path.join(__dirname,'..','src','extension.ts'),'utf8');
 assert.match(extension,/new MCPServer\([^\n]*router,tools,router,\s*\{localToken:token\}\)/,
   'extension must pass hub token to main MCP server');
 console.log('PASS extension wires local auth into main listener');
})().catch(e=>{console.error(e);process.exitCode=1;});