'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeManager {
  constructor(){this.items=new Map();}
  create(id,cwd){if(this.items.has(id))throw Error('duplicate');this.items.set(id,cwd);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};}
  list(){return [...this.items].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
  close(id){if(!this.items.delete(id))throw Error('unknown');}
  async execute(id,command){if(!this.items.has(id))throw Error('unknown shell');return {shell_id:id,command,output:id+':'+command,exit_code:0,truncated:false};}
  dispose(){this.items.clear();}
}
const multi=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
const bridge=require('../out/legacy-bridge.js');
function request(name,args){return {jsonrpc:'2.0',id:9,method:'tools/call',params:{name,arguments:args}};}
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alias-integration-'));
 const folders=['1','1']; // duplicate project names must NOT share alias
 const dirs=folders.map((name,index)=>{const base=path.join(temp,index===0?'a':'b',name);fs.mkdirSync(base,{recursive:true});return base;});
 const token='d'.repeat(64),router=new multi.WindowRouter(token);
 const workers=dirs.map(dir=>new multi.WindowWorker(new FakeManager(),token,dir));
 for(const w of workers){
   const mainId='main-'+w.id;
   w.shells?.create?.(mainId,w.workspace); // private TS property still exists at runtime
   w.aliases.set(mainId,multi.suggestAlias(w.workspace));
 }
 try {
   await Promise.all(workers.map(w=>w.start()));
   for(const w of workers){
     router.register({window_id:w.id,workspace:w.workspace,worker_port:w.port,aliases:Object.fromEntries(w.aliases)});
     await router.reconcile(w.id);
   }
   const list=await router.list();
   assert.equal(list.length,2);
   assert.deepEqual(new Set(list.map(x=>x.alias)),new Set(['1','1-2']));
   assert.equal((await router.execute('1','one')).shell_id,'main-'+workers[0].id);
   assert.equal((await router.execute('1-2','two')).shell_id,'main-'+workers[1].id);
   assert.equal(router.root('1'),dirs[0]);
   assert.equal(router.root('1-2'),dirs[1]);
   const renamed=await router.setAlias('1','Minecraft');
   assert.equal(renamed.alias,'minecraft');
   assert.equal(router.resolve('MINECRAFT'),'main-'+workers[0].id);
   assert.throws(()=>router.resolve('1'),/Unknown/);
   await assert.rejects(router.setAlias('minecraft','1-2'),/already in use/);
   assert.equal((await router.execute('minecraft','works')).shell_id,'main-'+workers[0].id);
   assert.equal((await router.execute('1-2','still separate')).shell_id,'main-'+workers[1].id);
   await assert.rejects(router.create('minecraft',dirs[0],true,workers[0].id),/conflicts with an alias/);
   for(const alias of ['1','minecraft']){
     const b=bridge.adaptLegacyToolCall(request('execute_shell_command_code',{command:'pwd',cwd:'@shell:'+alias}));
     assert.equal(b.kind,'rewrite');assert.equal(b.request.params.arguments.shell_id,alias);
   }
   assert.equal(bridge.adaptLegacyToolCall(request('read_file_code',{path:'@shell:1/src/main.ts'})).kind,'rewrite');
   assert.equal(bridge.adaptLegacyToolCall(request('execute_shell_command_code',{command:'pwd'})).kind,'error');
   // When a coordinator disappears, the live workers re-register their chosen aliases.
   const replacement=new multi.WindowRouter(token);
   for(const w of workers){
     replacement.register({window_id:w.id,workspace:w.workspace,worker_port:w.port,aliases:Object.fromEntries(w.aliases)});
     await replacement.reconcile(w.id);
   }
   assert.equal(replacement.resolve('minecraft'),'main-'+workers[0].id);
   assert.equal(replacement.resolve('1-2'),'main-'+workers[1].id);
   await assert.rejects(replacement.close('minecraft'),/main shell cannot be closed/i);
   assert.equal(replacement.resolve('minecraft'),'main-'+workers[0].id);
   console.log('PASS: numeric aliases, unique collisions, custom names, legacy selectors, failover and close cleanup');
 }finally{
   await Promise.all(workers.map(w=>w.stop()));
   fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});