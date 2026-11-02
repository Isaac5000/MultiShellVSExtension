'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listeners={started:new Set(),ended:new Set(),closed:new Set()};
const on=key=>fn=>{listeners[key].add(fn);return{dispose(){listeners[key].delete(fn);}};};
const fire=(key,value)=>{for(const fn of [...listeners[key]])fn(value);};
const executions=new Map();
let keysSent=0;
const issued=[];
const vscode={
 workspace:{workspaceFolders:[]},
 window:{
  onDidCloseTerminal:on('closed'),
  onDidStartTerminalShellExecution:on('started'),
  onDidEndTerminalShellExecution:on('ended'),
  createTerminal(opts){
   const terminal={
    name:opts.name,creationOptions:opts,
    show(){},
    sendText(){keysSent++;},
    dispose(){fire('closed',terminal);}
   };
   terminal.shellIntegration={executeCommand(command){
    issued.push(command);
    if(command==='early_end'){
      const execution={async *read(){yield 'done';}};
      fire('started',{terminal,execution});
      fire('ended',{terminal,execution,exitCode:0});
      return execution;
    }
    if(command==='pager_waiting'){
      let unblock;
      const waiting=new Promise(resolve=>{unblock=resolve;});
      const execution={async *read(){yield 'report\\n(END)';await waiting;}};
      executions.set(command,{terminal,execution,unblock});
      fire('started',{terminal,execution});
      return execution;
    }
    if(command==='stream_done_event_missing'){
      const execution={async *read(){yield 'all output delivered';}};
      executions.set(command,{terminal,execution});
      fire('started',{terminal,execution});
      return execution;
    }
    throw Error('Unexpected command: '+command);
   }};
   return terminal;
  }
 }
};
const {ShellManager,detectInputWaitHint}=proxyquire('../out/shell-manager.js',{vscode});
function status(manager){return manager.list().find(x=>x.shell_id==='managed');}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-pending-commands-'));
 const manager=new ShellManager();
 try{
  assert.equal(detectInputWaitHint('hello world'),undefined);
  assert.equal(detectInputWaitHint('FILE\\n(END)'),'pager');
  assert.equal(detectInputWaitHint('Proceed? [Y/n]'),'confirmation');
  assert.equal(detectInputWaitHint('Password:'),'credentials');
  manager.setWindowInteractiveAutoExit(false);
  manager.create('managed',dir,true,'user');

  // A pager can be waiting for input even when no new output is produced.
  // A timeout on the main/user shell must not send input or kill it.
  const running=manager.execute('managed','pager_waiting',1100);
  await delay(45);
  assert.equal(status(manager).execution_phase,'running');
  assert.equal(status(manager).input_wait_hint,'pager');
  assert.equal(status(manager).busy,true);
  const originalNow=Date.now;
  try {
   const frozen=originalNow();
   Date.now=()=>frozen+25000;
   assert.ok(status(manager).output_silent_seconds>=20);
  } finally {Date.now=originalNow;}
  await assert.rejects(running,/timed out/);
  assert.equal(status(manager).timed_out_running,true);
  assert.equal(status(manager).execution_phase,'timed_out_preserved');
  assert.equal(keysSent,0);
  const pager=executions.get('pager_waiting');
  fire('ended',{terminal:pager.terminal,execution:pager.execution,exitCode:0});
  pager.unblock();
  for(let i=0;i<50&&status(manager).busy;i++)await delay(10);
  assert.equal(status(manager).busy,false);
  assert.equal(status(manager).timed_out_running,false);

  // When read() ends but shell integration never reports the exit, do not
  // assume completion. Keep the FIFO protected until the matching event.
  const missing=manager.execute('managed','stream_done_event_missing',2000);
  await delay(45);
  assert.equal(status(manager).execution_phase,'waiting_for_completion');
  assert.equal(status(manager).busy,true);
  const next=manager.execute('managed','early_end',2000);
  assert.equal(status(manager).queued,1);
  assert.deepEqual(issued,['pager_waiting','stream_done_event_missing']);
  const stillMissing=executions.get('stream_done_event_missing');
  fire('ended',{terminal:stillMissing.terminal,execution:stillMissing.execution,exitCode:0});
  assert.equal((await missing).exit_code,0);
  // The next command sends a synchronous end event before executeCommand
  // returns the execution identity; it must not be lost.
  assert.equal((await next).exit_code,0);
  assert.equal(status(manager).busy,false);
  assert.equal(keysSent,0);
  console.log('PASS: pager/input-wait hint, silence, preserved timeout, missing completion event, FIFO and early completion race');
 }finally{manager.dispose(true);fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
