'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const hooks={closed:new Set(),integration:new Set(),ended:new Set()};
const subscribe=k=>fn=>{hooks[k].add(fn);return{dispose(){hooks[k].delete(fn);}}};
const emit=(k,v)=>{for(const cb of [...hooks[k]])cb(v);};
let disposed=0,commands=0;
const terminals=[];
const vscode={workspace:{workspaceFolders:[]},window:{
 onDidCloseTerminal:subscribe('closed'),
 onDidChangeTerminalShellIntegration:subscribe('integration'),
 onDidEndTerminalShellExecution:subscribe('ended'),
 createTerminal(opts){
  const terminal={name:opts.name,creationOptions:opts,
    dispose(){disposed++;emit('closed',terminal);}
  };
  terminals.push(terminal);
  return terminal;
 }
}};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-no-integration-'));
 const manager=new ShellManager();
 try{
  const id='main-integration-12345678';
  manager.create(id,dir,true,'automatic');
  await assert.rejects(manager.execute(id,'not_executed',1000),/Shell integration unavailable.*Command was not started/i);
  const state=manager.list().find(s=>s.shell_id===id);
  assert.equal(state.busy,false);
  assert.equal(state.timed_out_running,false);
  assert.equal(state.queued,0);
  assert.equal(disposed,0,'Main terminal must not be closed when shell integration is missing');
  assert.equal(commands,0);

  const terminal=terminals[0];
  terminal.shellIntegration={executeCommand(command){
    commands++;
    const execution={async *read(){
      emit('ended',{terminal,execution,exitCode:0});
      yield 'DONE:'+command;
    }};
    return execution;
  }};
  emit('integration',{terminal});
  const resumed=await manager.execute(id,'integration_ready',1000);
  assert.equal(resumed.exit_code,0);
  assert.match(resumed.output,/DONE:integration_ready/);
  assert.equal(commands,1);
  assert.equal(disposed,0);
  console.log('PASS: missing VSCode shell integration times out without starting, killing or locking the main terminal; retry succeeds after integration');
 }finally{
  manager.dispose(true);
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
