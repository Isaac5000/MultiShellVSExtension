'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class FakeManager{
  constructor(){this.items=new Map();}
  create(id,cwd,_allow,origin){
    if(this.items.has(id))throw new Error('Duplicate shell');
    const shell={shell_id:id,initial_cwd:cwd,origin,busy:false,queued:0};
    this.items.set(id,shell);return shell;
  }
  list(){return [...this.items.values()];}
  close(id){this.items.delete(id);}
  dispose(){}
}
let decision=false;
let delayed,dialogOpened;
let persistenceWait,persistenceEntered;
const prompts=[];
const vscode={
  env:{language:'en'},
  window:{showWarningMessage:async(message,options,accept)=>{
    prompts.push({message,options,accept});
    if(delayed){dialogOpened?.();return await delayed;}
    return decision?accept:undefined;
  }}
};
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager},vscode});
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':mw,
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function decode(raw){
  const line=raw.split('\n').find(s=>s.startsWith('data:'));
  return JSON.parse(line?line.slice(5):raw);
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-approval-test-'));
 const dirs=['temp','denied','approved','panel','aborted','forged','storage','forged_panel','cancel_during_save'].map(x=>path.join(dir,x));
 dirs.forEach(p=>fs.mkdirSync(p));
 const manager=new FakeManager(),saved=[];
 const token='e'.repeat(64);
 const worker=new mw.WindowWorker(manager,token,dir,undefined,async shell=>{
   if(shell.shell_id==='storage_failed')throw new Error('Simulated user session persistence failure');
   if(shell.shell_id==='cancel_during_save'){
     persistenceEntered?.();
     await persistenceWait;
   }
   saved.push(shell);
 });
 const router=new mw.WindowRouter(token);
 await worker.start();
 router.register({window_id:worker.id,workspace:dir,worker_port:worker.port});
 await router.reconcile(worker.id);
 const server=new MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:true},router);
 await server.start();
 try{
   const port=server.httpServer.address().port;
   async function rpc(method,params={},signal){
     const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
       method:'POST',signal,
       headers:{'content-type':'application/json','accept':'application/json,text/event-stream'},
       body:JSON.stringify({jsonrpc:'2.0',id:33,method,params})
     });
     assert.equal(response.status,200);
     return decode(await response.text());
   }
   const list=await rpc('tools/list');
   const tools=list.result.tools.map(x=>x.name);
   assert.ok(tools.includes('create_shell_code'));
   assert.ok(tools.includes('create_user_shell_code'));
   const call=(name,args,signal)=>rpc('tools/call',{name,arguments:args},signal);

   const temp=await call('create_shell_code',{shell_id:'temporary',cwd:dirs[0]});
   assert.equal(temp.result.isError,false);
   assert.equal(manager.items.get('temporary').origin,'mcp');
   assert.equal(prompts.length,0,'Ordinary MCP creation never grants user ownership');

   // Unknown fields must not escalate create_shell_code into a user terminal.
   await call('create_shell_code',{shell_id:'forged',cwd:dirs[5],origin:'user',persistent:true});
   assert.equal(manager.items.get('forged').origin,'mcp');
   assert.equal(prompts.length,0);
   await assert.rejects(router.create('bypass',dirs[1],false,worker.id,'user'),/explicit VSCode approval/);

   const denied=await call('create_user_shell_code',{shell_id:'denied',cwd:dirs[1]});
   assert.equal(denied.result.isError,true);
   assert.match(denied.result.content[0].text,/not approved/);
   assert.equal(manager.items.has('denied'),false);
   assert.equal(saved.length,0);
   assert.equal(prompts.length,1);
   assert.equal(prompts[0].options.modal,true);
   assert.match(prompts[0].message,/ID: denied/);
   assert.match(prompts[0].message,/denied/);

   decision=true;
   const approved=await call('create_user_shell_code',{shell_id:'approved',cwd:dirs[2]});
   assert.equal(approved.result.isError,false);
   assert.equal(manager.items.get('approved').origin,'user');
   assert.deepEqual(saved.map(s=>s.shell_id),['approved'],
     'AI-created persistent terminal must be recorded even with no panel open');
   assert.equal(prompts.length,2);
   assert.match(prompts[1].message,/ID: approved/);
   assert.match(prompts[1].message,/Share directory: No/);
   assert.equal(router.resolve('approved'),'approved');
   const duplicate=await call('create_user_shell_code',{shell_id:'approved',cwd:dirs[2]});
   assert.equal(duplicate.result.isError,true);
   assert.equal(prompts.length,2,'Duplicate requests should fail without prompting');

   const failedPersistence=await call('create_user_shell_code',{shell_id:'storage_failed',cwd:dirs[6]});
   assert.equal(failedPersistence.result.isError,true);
   assert.match(failedPersistence.result.content[0].text,/persistence failure/);
   assert.equal(manager.items.has('storage_failed'),false,
     'A user shell that cannot be persisted must not remain as an untracked terminal');
   assert.equal(saved.length,1);

   // Even possession of the internal MultiShell control token cannot silently
   // create a user-owned shell. The owning worker still requires an actual modal.
   decision=false;
   const forgedPanel=await fetch('http://127.0.0.1:'+port+mw.CONTROL_PATH,{
     method:'POST',
     headers:{'content-type':'application/json','x-multishell-token':token},
     body:JSON.stringify({op:'create',id:'forged_panel',cwd:dirs[7],
       share:false,origin:'user',window_id:worker.id})
   });
   assert.equal(forgedPanel.status,400);
   assert.match((await forgedPanel.json()).error,/not approved/);
   assert.equal(manager.items.has('forged_panel'),false);
   assert.equal(prompts.length,4);
   decision=true;

   const panel=await router.createPanelUser('from_panel',dirs[3],false,worker.id);
   assert.equal(panel.origin,'user');
   assert.equal(prompts.length,5,'Panel user creation must also require a local modal');
   assert.deepEqual(saved.map(s=>s.shell_id),['approved','from_panel']);

   // MCP clients cannot close a persistent user shell without the owning user's consent.
   decision=false;
   const deniedClose=await call('close_shell_code',{shell_id:'approved'});
   assert.equal(deniedClose.result.isError,true);
   assert.equal(manager.items.has('approved'),true,'Denied close must not interrupt the user terminal');
   assert.equal(prompts.length,6);
   decision=true;
   const confirmedClose=await call('close_shell_code',{shell_id:'approved'});
   assert.equal(confirmedClose.result.isError,false);
   assert.equal(manager.items.has('approved'),false);
   assert.equal(prompts.length,7);
   // The worker enforces the modal even if an internal client claims panel origin.
   await router.close('from_panel',true);
   assert.equal(manager.items.has('from_panel'),false);
   assert.equal(prompts.length,8);

   // Cancel a remote request while the local approval prompt is still open.
   let resolveDialog,opened;
   const openedPromise=new Promise(r=>opened=r);
   delayed=new Promise(r=>{resolveDialog=r;});
   dialogOpened=opened;
   const abort=new AbortController();
   const pending=call('create_user_shell_code',{shell_id:'aborted',cwd:dirs[4]},abort.signal).catch(()=>undefined);
   await openedPromise;
   await sleep(30);
   abort.abort();
   await pending;
   await sleep(80);
   resolveDialog('Create user terminal');
   await sleep(150);
   assert.equal(manager.items.has('aborted'),false,
     'Approval of an already cancelled MCP request must not create a terminal');
   assert.equal(saved.length,2);

   // Creation was authorized and the worker opened the shell, but the client
   // disconnected while the session-persistence callback was still pending.
   // The worker must dispose the unacknowledged physical terminal.
   delayed=undefined;dialogOpened=undefined;
   let releasePersist,startedPersist;
   persistenceWait=new Promise(resolve=>{releasePersist=resolve;});
   const enteredPersist=new Promise(resolve=>{startedPersist=resolve;});
   persistenceEntered=startedPersist;
   const acSave=new AbortController();
   const interrupted=call('create_user_shell_code',
     {shell_id:'cancel_during_save',cwd:dirs[8]},acSave.signal).catch(()=>undefined);
   await enteredPersist;
   assert.equal(manager.items.has('cancel_during_save'),true);
   acSave.abort();
   await interrupted;
   await sleep(60);
   releasePersist();
   await sleep(150);
   assert.equal(manager.items.has('cancel_during_save'),false,
     'A disconnected client must not leave an unacknowledged USER terminal running');

   console.log('PASS: user creation requires approval; cancellation during prompt or persistence rolls back the shell; temporary creation cannot escalate');
 }finally{
   await server.stop();await worker.stop();
   fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});