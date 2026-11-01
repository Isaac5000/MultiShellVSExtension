'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hooks={closed:new Set(),started:new Set(),ended:new Set()};
const on=key=>fn=>{hooks[key].add(fn);return{dispose(){hooks[key].delete(fn);}};};
const emit=(key,data)=>{for(const fn of [...hooks[key]])fn(data);};
const running=new Map();
const issued=[];
const terminals=[];
const vscode={
 workspace:{workspaceFolders:[]},
 window:{
  terminals,
  onDidCloseTerminal:on('closed'),
  onDidStartTerminalShellExecution:on('started'),
  onDidEndTerminalShellExecution:on('ended'),
  createTerminal(options){
   const terminal={
    name:options.name,creationOptions:{cwd:options.cwd},
    disposed:false,show(){},state:{isInteractedWith:false},
    dispose(){
      if(this.disposed)return;
      this.disposed=true;
      for(const f of [...hooks.closed])f(this);
    },
    shellIntegration:{executeCommand(command){
      if(terminal.disposed)throw Error('disposed');
      issued.push({terminal,command});
      let resolveRead;
      const readReady=new Promise(resolve=>{resolveRead=resolve;});
      const execution={
        async *read(){
          if(command==='stream_fails')throw new Error('stream failed');
          await readReady;
          yield 'OUTPUT_'+command;
        }
      };
      running.set(command,{terminal,execution,resolveRead});
      emit('started',{terminal,execution});
      return execution;
    }}
   };
   terminals.push(terminal);
   return terminal;
  }
 }
};
const finish=(command,exitCode=0)=>{
 const r=running.get(command);
 assert.ok(r,'Command must have begun: '+command);
 emit('ended',{terminal:r.terminal,execution:r.execution,exitCode});
 r.resolveRead();
 running.delete(command);
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
async function issuedCommand(command,timeout=800){
 for(let i=0;i<70;i++){
   if(issued.some(x=>x.command===command))return;
   await wait(5);
 }
 throw Error('Expected command was not issued: '+command);
}
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-execution-races-'));
 let manager;
 try{
   manager=new ShellManager();
   manager.create('protected_user',root,true,'user');
   const user=terminals.find(x=>x.name==='MCP [protected_user]');
   const external={};
   emit('started',{terminal:user,execution:external});
   await assert.rejects(manager.execute('protected_user','must_not_interrupt',1000),
     /running a command outside its MCP queue/);
   assert.equal(issued.length,0,'MCP must not send Ctrl+C to a manual process');
   emit('ended',{terminal:user,execution:external,exitCode:0});
   const recovered=manager.execute('protected_user','after_manual',1000);
   await issuedCommand('after_manual');
   finish('after_manual');
   assert.equal((await recovered).exit_code,0);

   // Cancellation of a queued request must not allow later commands past the
   // earlier still-active command (the regression in 0.10.21).
   const first=manager.execute('protected_user','slow_first',2000);
   await issuedCommand('slow_first');
   const abort=new AbortController();
   const cancelled=manager.execute('protected_user','cancelled_second',2000,abort.signal);
   const third=manager.execute('protected_user','third',2000);
   abort.abort();
   await assert.rejects(cancelled,/cancelled|still running/i);
   await wait(40);
   assert.equal(issued.some(x=>x.command==='third'),false,
     'Cancellation must not release an earlier active command');
   finish('slow_first');
   assert.equal((await first).exit_code,0);
   await issuedCommand('third');
   finish('third');
   assert.equal((await third).exit_code,0);
   assert.equal(issued.some(x=>x.command==='cancelled_second'),false);

   // A manual command may start just as the previous MCP command completes,
   // before a queued MCP request resumes on the microtask queue.
   const beforeManual=manager.execute('protected_user','before_manual_race',2000);
   await issuedCommand('before_manual_race');
   const waiting=manager.execute('protected_user','must_not_run_while_manual',2000);
   finish('before_manual_race');
   const manualRace={};
   emit('started',{terminal:user,execution:manualRace});
   assert.equal((await beforeManual).exit_code,0);
   await assert.rejects(waiting,/running a command outside its MCP queue/);
   assert.equal(issued.some(x=>x.command==='must_not_run_while_manual'),false);
   emit('ended',{terminal:user,execution:manualRace,exitCode:0});

   // A stream rejection cannot release the active shell until the matching
   // VS Code command-completion event arrives.
   const broken=manager.execute('protected_user','stream_fails',2000);
   await issuedCommand('stream_fails');
   const later=manager.execute('protected_user','after_stream_failure',2000);
   await wait(40);
   assert.equal(issued.some(x=>x.command==='after_stream_failure'),false);
   assert.equal(manager.list().find(x=>x.shell_id==='protected_user').busy,true);
   finish('stream_fails');
   await assert.rejects(broken,/stream failed/);
   await issuedCommand('after_stream_failure');
   finish('after_stream_failure');
   assert.equal((await later).exit_code,0);

   // Ambiguous shell events must leave recovery guarded rather than trusting
   // an undefined exit status as definite completion.
   emit('started',{terminal:user,execution:external});
   emit('ended',{terminal:user,execution:external,exitCode:undefined});
   await assert.rejects(manager.execute('protected_user','ambiguous',1000),
     /ambiguous execution state/);
   assert.equal(manager.list().find(x=>x.shell_id==='protected_user').recovery_required,true);
   manager.confirmRestoredUserShell('protected_user');
   const final=manager.execute('protected_user','verified_idle',1000);
   await issuedCommand('verified_idle');
   finish('verified_idle');
   assert.equal((await final).exit_code,0);
   assert.equal(issued.filter(x=>x.command==='must_not_interrupt'||x.command==='ambiguous').length,0);

   console.log('PASS: manual command isolation; cancelled FIFO predecessor cannot overtake; output stream failure cannot unlock running command; ambiguous events guard execution');
 }finally{
   manager?.dispose(true);
   fs.rmSync(root,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});