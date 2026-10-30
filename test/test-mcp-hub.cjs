const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class FakeManager {
  constructor(){this.items=new Map();}
  create(id,cwd){
    if(this.items.has(id))throw new Error('Duplicate id');
    this.items.set(id,cwd);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};
  }
  list(){return [...this.items].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
  close(id){this.items.delete(id);}
  async execute(id,command){if(!this.items.has(id))throw new Error('missing');await wait(80);return {shell_id:id,command,output:id+':'+command,exit_code:0,truncated:false};}
  dispose(){this.items.clear();}
}
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
const file=proxyquire('../out/tools/scoped-file-tools.js',{vscode:{}});
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':mw,'./tools/scoped-file-tools':file,
  './utils/logger':{logger:{info(){},warn(){},error(...args){console.error(...args);}}}
});
function parse(t) {const row=t.split('\n').find(x=>x.startsWith('data:'));return JSON.parse(row?row.slice(5):t);}
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hub-test-'));
 const a=path.join(temp,'A'),b=path.join(temp,'B');fs.mkdirSync(a);fs.mkdirSync(b);
 const token='a'.repeat(64),router=new mw.WindowRouter(token);
 const wa=new mw.WindowWorker(new FakeManager(),token,a),wb=new mw.WindowWorker(new FakeManager(),token,b);
 await Promise.all([wa.start(),wb.start()]);
 const hub=new MCPServer(0,'127.0.0.1',router,{file:true,edit:true,shell:true},router);
 await hub.start();
 const port=hub.httpServer.address().port;
 const endpoint='http://127.0.0.1:'+port;
 async function rpc(method,params={}){
   const r=await fetch(endpoint+'/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
       body:JSON.stringify({jsonrpc:'2.0',id:Math.floor(Math.random()*10000000),method,params})});
   const txt=await r.text();assert.equal(r.status,200,txt);return parse(txt);
 }
 async function call(name,args){
   const data=await rpc('tools/call',{name,arguments:args});
   assert.ok(data.result,data.error&&JSON.stringify(data.error));
   const content=data.result.content[0].text;try{return JSON.parse(content);}catch{return content;}
 }
 async function register(worker,bad=false){
   return fetch(endpoint+mw.REGISTER_PATH,{method:'POST',
     headers:{'content-type':'application/json','x-multishell-token':bad?'wrong':token},
     body:JSON.stringify({window_id:worker.id,workspace:worker.workspace,worker_port:worker.port})});
 }
 try{
   assert.equal((await register(wa,true)).status,403,'unauthorized worker should fail');
   assert.equal((await register(wa)).status,200);
   assert.equal((await register(wb)).status,200);
   await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});
   const windows=await call('list_windows_code',{});
   assert.equal(windows.windows.length,2);
   const bad=await call('create_shell_code',{shell_id:'oops',cwd:a});
   assert.ok(bad.error.includes('Several windows'),'ambiguous window should reject');
   const ca=await call('create_shell_code',{shell_id:'alpha',cwd:a,window_id:wa.id});
   const cb=await call('create_shell_code',{shell_id:'beta',cwd:b,window_id:wb.id});
   assert.equal(ca.created.window_id,wa.id);
   assert.equal(cb.created.window_id,wb.id);
   const changed=await call('set_shell_alias_code',{shell_id:'beta',alias:'minecraft'});
   assert.equal(changed.alias,'minecraft');
   assert.equal((await call('execute_shell_command_code',{shell_id:'minecraft',command:'alias-test'})).shell_id,'beta');
   assert.equal((await call('list_shells_code',{})).shells.find(x=>x.shell_id==='beta').alias,'minecraft');
   const t0=Date.now();
   const [ra,rb]=await Promise.all([
      call('execute_shell_command_code',{shell_id:'alpha',command:'A'}),
      call('execute_shell_command_code',{shell_id:'beta',command:'B'})]);
   assert.match(ra.output,/alpha:A/);assert.match(rb.output,/beta:B/);
   assert.ok(Date.now()-t0<260,'parallel worker calls too slow');
   const noId=await call('execute_shell_command_code',{command:'pwd'});
   assert.match(noId.error,/Missing shell_id|No shell selected/);
   // Several independent shells through the SAME public MCP endpoint.
   const additional=await Promise.all(Array.from({length:8},(_,i)=>call('create_shell_code',{shell_id:'load'+i,cwd:i%2===0?a:b,window_id:i%2===0?wa.id:wb.id,allow_shared_directory:true})));
   assert.equal(additional.length,8);
   const parallelStart=Date.now();
   const results=await Promise.all(Array.from({length:8},(_,i)=>call('execute_shell_command_code',{shell_id:'load'+i,command:'job'+i})));
   assert.equal(results.length,8);
   results.forEach((result,i)=>assert.match(result.output,new RegExp('load'+i+':job'+i)));
   assert.ok(Date.now()-parallelStart<450,'eight independent commands were unexpectedly serialized');
   console.log('PASS: authenticated MCP hub; two window routes; eight simultaneous commands; no command mixing; stale-schema error');
 } finally {
    await hub.stop();await Promise.all([wa.stop(),wb.stop()]);
    fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});