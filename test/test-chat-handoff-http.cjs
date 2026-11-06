'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
 vscode:{},'./multi-window':{
  REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',
  authenticated:()=>false
 },
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error(e);}}}
});
function parsed(text){
 const event=text.split(/\r?\n/).find(line=>line.startsWith('data:'));
 return JSON.parse(event?event.slice(5).trim():text);
}
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ms-chat-handoff-http-'));
 const oldLocal=process.env.LOCALAPPDATA;
 const project=path.join(temp,'project');
 fs.mkdirSync(project);
 process.env.LOCALAPPDATA=path.join(temp,'user-state');
 const fake={
  list(){return [{shell_id:'exact-shell',initial_cwd:project,machine_id:'machine-a',
   origin:'automatic',busy:false,queued:0,timed_out_running:false,recovery_required:false}];},
  root(shellId){if(shellId!=='exact-shell')throw Error('Unknown shell');return project;}
 };
 let server;
 const connect=async(config)=>{
  server=new MCPServer(0,'127.0.0.1',fake,config);
  await server.start();
  const port=server.httpServer.address().port;
  let serial=0;
  return async(method,params={})=>{
   const res=await fetch('http://127.0.0.1:'+port+'/mcp',{
    method:'POST',headers:{'content-type':'application/json',
     accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:++serial,method,params}),
    signal:AbortSignal.timeout(6000)
   });
   assert.equal(res.status,200,method+': HTTP '+res.status);
   const body=parsed(await res.text());
   assert.equal(body.error,undefined,JSON.stringify(body.error));
   return body.result;
  };
 };
 try{
  let rpc=await connect({file:true,edit:true,shell:false});
  await rpc('initialize',{protocolVersion:'2025-03-26',
   capabilities:{},clientInfo:{name:'handoff-test',version:'1'}});
  const names=(await rpc('tools/list')).tools.map(x=>x.name);
  for(const name of ['chat_handoff_save_code','chat_handoff_load_code',
   'chat_handoff_list_code'])assert.ok(names.includes(name),name);
  assert.ok(!names.includes('chat_handoff_delete_code'));
  const call=async(name,args)=>{
   const response=await rpc('tools/call',{name,arguments:args});
   assert.equal(response.isError,false,JSON.stringify(response));
   return JSON.parse(response.content[0].text);
  };
  const first=await call('chat_handoff_save_code',{
   shell_id:'exact-shell',objective:'Complete chat project',
   verification:'Tests passed, independent evidence',
   summary:'Saved before old conversation ends',completed:['Inspected repo'],
   remaining:['Run final tests'],artifacts:[],risks:['Check dirty files'],
   next_action:'Inspect tests',status:'working'
  });
  assert.equal(first.saved,true);assert.equal(first.revision,1);
  await server.stop();server=undefined;
  rpc=await connect({file:true,edit:false,shell:false});
  await rpc('initialize',{protocolVersion:'2025-03-26',
   capabilities:{},clientInfo:{name:'new-chat-test',version:'1'}});
  const readNames=(await rpc('tools/list')).tools.map(x=>x.name);
  assert.ok(readNames.includes('chat_handoff_load_code'));
  assert.ok(!readNames.includes('chat_handoff_save_code'));
  assert.ok(readNames.includes('chat_handoff_list_code'));
  assert.ok(!readNames.includes('chat_handoff_delete_code'));
  const loaded=await rpc('tools/call',{name:'chat_handoff_load_code',
   arguments:{shell_id:'exact-shell'}});
  assert.equal(loaded.isError,false);
  const recovered=JSON.parse(loaded.content[0].text);
  assert.equal(recovered.found,true);
  assert.equal(recovered.checkpoint.handoffId,first.handoffId);
  assert.equal(recovered.checkpoint.summary,'Saved before old conversation ends');
  assert.match(recovered.warning,/NOT independent proof/i);
  const listed=await rpc('tools/call',{name:'chat_handoff_list_code',
   arguments:{shell_id:'exact-shell'}});
  assert.equal(listed.isError,false);
  assert.equal(JSON.parse(listed.content[0].text).tasks.length,1);
  console.log('PASS handoff over MCP HTTP: saved in first server session, restored in second, read-only gate and exact shell');
 }finally{
  await server?.stop().catch(()=>{});
  if(oldLocal===undefined)delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA=oldLocal;
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});