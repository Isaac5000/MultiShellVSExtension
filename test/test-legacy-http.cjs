'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeManager {
 constructor(){this.items=new Map();}
 create(id,cwd){if(this.items.has(id))throw Error('duplicate');this.items.set(id,cwd);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};}
 list(){return [...this.items].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
 close(id){this.items.delete(id);}
 async execute(id,command){if(!this.items.has(id))throw Error('Unknown '+id);return {shell_id:id,command,output:id+':'+command,exit_code:0,truncated:false};}
 dispose(){this.items.clear();}
}
const multi=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
const file=proxyquire('../out/tools/scoped-file-tools.js',{vscode:{}});
const {MCPServer}=proxyquire('../out/server.js',{
 './multi-window':multi,'./tools/scoped-file-tools':file,
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error(e);}}}
});
function parse(text){const row=text.split('\n').find(x=>x.startsWith('data:'));return JSON.parse(row?row.slice(5):text);}
async function main(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-http-'));
 const dirA=path.join(home,'a'),dirB=path.join(home,'b');
 fs.mkdirSync(dirA);fs.mkdirSync(dirB);
 fs.writeFileSync(path.join(dirA,'marker.txt'),'only-a');
 fs.writeFileSync(path.join(dirB,'marker.txt'),'only-b');
 const token='f'.repeat(64),router=new multi.WindowRouter(token);
 const workerA=new multi.WindowWorker(new FakeManager(),token,dirA);
 const workerB=new multi.WindowWorker(new FakeManager(),token,dirB);
 await Promise.all([workerA.start(),workerB.start()]);
 const server=new MCPServer(0,'127.0.0.1',router,{file:true,edit:true,shell:true},router);
 await server.start();
 const endpoint='http://127.0.0.1:'+server.httpServer.address().port;
 async function rpc(method,params){
  const response=await fetch(endpoint+'/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:10,method,params})});
  const result=parse(await response.text());
  assert.equal(response.status,200);
  return result;
 }
 async function call(name,args){
  const r=await rpc('tools/call',{name,arguments:args});
  assert.ok(r.result,JSON.stringify(r));
  const txt=r.result.content[0].text;
  try{return JSON.parse(txt);}catch{return txt;}
 }
 async function register(w){
  const response=await fetch(endpoint+multi.REGISTER_PATH,{method:'POST',
   headers:{'content-type':'application/json','x-multishell-token':token},
   body:JSON.stringify({window_id:w.id,workspace:w.workspace,worker_port:w.port})});
  assert.equal(response.status,200);
 }
 try{
  await register(workerA);await register(workerB);
  await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'legacy-test',version:'1.0'}});
  const a=await router.create('legacy_a',dirA,false,workerA.id);
  const b=await router.create('legacy_b',dirB,false,workerB.id);
  assert.ok(a.shell_id==='legacy_a'&&b.shell_id==='legacy_b');
  const windows=await call('execute_shell_command_code',{command:'windows',cwd:'@mcp'});
  assert.equal(windows.length,2);
  const shells=await call('execute_shell_command_code',{command:'shells',cwd:'@mcp'});
  assert.equal(shells.length,2);
  const result=await call('execute_shell_command_code',{command:'echo routing',cwd:'@shell:legacy_b',timeout:5000});
  assert.equal(result.output,'legacy_b:echo routing');
  const set=await router.setAlias('legacy_b','2');
  assert.equal(set.alias,'2');
  const usingAlias=await call('execute_shell_command_code',{command:'echo alias',cwd:'@shell:2'});
  assert.equal(usingAlias.shell_id,'legacy_b');
  const without=await call('execute_shell_command_code',{command:'echo dangerous'});
  assert.match(without.error,/No shell selected/);
  const fileA=await call('read_file_code',{path:'@shell:legacy_a/marker.txt'});
  const fileB=await call('read_file_code',{path:'@shell:legacy_b/marker.txt'});
  assert.equal(fileA,'only-a');assert.equal(fileB,'only-b');
  assert.equal(await call('read_file_code',{path:'@shell:2/marker.txt'}),'only-b');
  const cross=await call('copy_file_code',{sourcePath:'@shell:legacy_a/marker.txt',targetPath:'@shell:legacy_b/copied.txt'});
  assert.match(cross.error,/same shell/);
  assert.equal(fs.existsSync(path.join(dirB,'copied.txt')),false);
  const escaped=await call('read_file_code',{path:'@shell:legacy_a/../b/marker.txt'});
  assert.match(escaped.error,/escapes|relative paths|allowed/i);
  console.log('PASS: real MCP HTTP legacy shell routing; 2 windows; file isolation; missing-ID and cross-shell paths rejected');
 } finally{
  await server.stop();
  await Promise.all([workerA.stop(),workerB.stop()]);
  fs.rmSync(home,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});