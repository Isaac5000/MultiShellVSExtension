'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-user-multitask-'));
const cwdA=path.join(root,'task-a'),cwdB=path.join(root,'task-b');
fs.mkdirSync(cwdA);fs.mkdirSync(cwdB);
const hooks={closed:new Set(),ended:new Set(),integration:new Set()};
const subscribe=k=>fn=>{hooks[k].add(fn);return{dispose(){hooks[k].delete(fn);}}};
const emit=(k,v)=>{for(const fn of [...hooks[k]])fn(v);};
const runningByShell=new Map(),maxPerShell=new Map(),started=[],finished=[];
let parallel=0,peak=0;
const physical=[];
const vscode={
  env:{language:'en'},
  workspace:{workspaceFolders:[{uri:{fsPath:root}}]},
  window:{
    terminals:physical,
    onDidCloseTerminal:subscribe('closed'),
    onDidEndTerminalShellExecution:subscribe('ended'),
    onDidChangeTerminalShellIntegration:subscribe('integration'),
    showWarningMessage:async(_message,settings,accept)=>{
      assert.equal(settings.modal,true);
      return accept;
    },
    createTerminal(options){
      const t={name:options.name,creationOptions:options,disposed:false,show(){},
        dispose(){
          this.disposed=true;
          const idx=physical.indexOf(t);
          if(idx>=0)physical.splice(idx,1);
          emit('closed',t);
        }
      };
      t.shellIntegration={executeCommand(command){
        const execution={async *read(){
          const id=t.name;
          const now=(runningByShell.get(id)||0)+1;
          runningByShell.set(id,now);
          maxPerShell.set(id,Math.max(maxPerShell.get(id)||0,now));
          parallel++;peak=Math.max(peak,parallel);
          started.push([id,command]);
          await sleep(command.startsWith('long')?145:60);
          parallel--;runningByShell.set(id,now-1);
          finished.push([id,command]);
          emit('ended',{terminal:t,execution,exitCode:0});
          yield 'OUTPUT_'+command;
        }};
        return execution;
      }};
      physical.push(t);
      return t;
    }
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const multi=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager},
  vscode
});
(async()=>{
 let manager=new ShellManager();
 const saved=[];
 const worker=new multi.WindowWorker(manager,'a'.repeat(64),root,undefined,async shell=>{
   saved.push({shell_id:shell.shell_id,initial_cwd:shell.initial_cwd,alias:shell.alias});
 });
 await worker.start();
 const router=new multi.WindowRouter('a'.repeat(64));
 try{
   router.register({window_id:worker.id,workspace:root,worker_port:worker.port});
   await router.reconcile(worker.id);
   const a=await router.createUserWithApproval('work_a',cwdA,false,worker.id);
   const b=await router.createUserWithApproval('work_b',cwdB,false,worker.id);
   assert.equal(a.origin,'user');assert.equal(b.origin,'user');
   assert.equal(physical.length,2);
   assert.deepEqual(saved.map(x=>x.shell_id),['work_a','work_b']);

   const pair=await Promise.all([
     router.execute('work_a','long_a',1500),
     router.execute('work_b','long_b',1500)
   ]);
   assert.equal(peak,2,'Different user terminals must execute concurrently');
   assert.ok(pair.every(x=>x.exit_code===0));
   assert.ok(pair.every(x=>x.output.includes('OUTPUT_')));

   const orderBefore=started.length;
   const same=await Promise.all([
     router.execute('work_a','long_first',1600),
     router.execute('work_a','short_second',1600)
   ]);
   assert.equal(same[0].exit_code,0);assert.equal(same[1].exit_code,0);
   assert.equal(maxPerShell.get('MCP [work_a]'),1,'Same-shell commands must not overlap');
   assert.deepEqual(started.slice(orderBefore).map(x=>x[1]),['long_first','short_second']);
   assert.deepEqual(finished.slice(orderBefore).map(x=>x[1]),['long_first','short_second']);

   // Test physical VSCode terminal persistence across extension reactivation.
   await worker.stop();
   manager.dispose(true);
   assert.equal(physical.length,2,'Physical user terminals remain after extension unload');
   manager=new ShellManager();
   const restored=manager.restoreUserTerminals(root,saved);
   assert.deepEqual(restored.map(x=>x.shell_id).sort(),['work_a','work_b']);
   assert.ok(restored.every(x=>x.origin==='user'&&x.recovery_required));
   assert.equal(physical.length,2,'Restoring user shells must never create duplicate terminals');
   await assert.rejects(manager.execute('work_a','unsafe_overlap',1000),/requires confirmation/);
   manager.confirmRestoredUserShell('work_a');
   const recovered=await manager.execute('work_a','after_reconnect',1500);
   assert.equal(recovered.exit_code,0);
   assert.equal(physical.length,2);
   console.log('PASS: two user shells execute in parallel; one-shell FIFO; persisted identities reconnect without duplicates and require idle confirmation');
 }finally{
   await worker.stop();manager.dispose(true);
   fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
