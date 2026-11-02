'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const callbacks={started:new Set(),ended:new Set(),closed:new Set()};
const listen=kind=>cb=>{callbacks[kind].add(cb);return {dispose(){callbacks[kind].delete(cb);}};};
const fire=(kind,event)=>{for(const cb of [...callbacks[kind]])cb(event);};
const terminalList=[];
let commandsSent=0;
const mock={
 workspace:{workspaceFolders:[]},
 window:{
  terminals:terminalList,
  onDidStartTerminalShellExecution:listen('started'),
  onDidEndTerminalShellExecution:listen('ended'),
  onDidCloseTerminal:listen('closed'),
  createTerminal(options){
   const terminal={
    name:options.name,creationOptions:options,state:{isInteractedWith:false},
    show(){},dispose(){fire('closed',terminal);}
   };
   terminal.shellIntegration={executeCommand(){
    commandsSent++;
    throw Error('No terminal commands should be sent in recovery tests');
   }};
   terminalList.push(terminal);
   return terminal;
  }
 }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode:mock});
function get(m,id){const result=m.list().find(s=>s.shell_id===id);assert.ok(result);return result;}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-recovery-reason-'));
 let manager=new ShellManager();
 let restored;
 try{
  manager.create('guarded_user',dir,true,'user');
  const terminal=terminalList[0];
  assert.equal(get(manager,'guarded_user').busy,false);
  assert.equal(get(manager,'guarded_user').external_busy,false);
  const external={};
  fire('started',{terminal,execution:external});
  assert.equal(get(manager,'guarded_user').busy,true,'External executions are real activity');
  assert.equal(get(manager,'guarded_user').external_busy,true,'Expose external process distinctly');
  assert.equal(get(manager,'guarded_user').queued,0);
  await assert.rejects(manager.execute('guarded_user','should_not_run',1000),/outside its MCP queue/);
  fire('ended',{terminal,execution:external,exitCode:undefined});
  assert.equal(get(manager,'guarded_user').busy,false);
  assert.equal(get(manager,'guarded_user').recovery_required,true);
  assert.equal(get(manager,'guarded_user').recovery_reason,'ambiguous_completion');
  await assert.rejects(manager.execute('guarded_user','still_forbidden',1000),/requires confirmation/);
  manager.confirmRestoredUserShell('guarded_user');
  assert.equal(get(manager,'guarded_user').recovery_required,false);
  assert.equal(get(manager,'guarded_user').recovery_reason,undefined);

  manager.dispose(true);
  restored=new ShellManager();
  restored.restoreUserTerminals(dir,[{shell_id:'guarded_user',initial_cwd:dir}]);
  assert.equal(get(restored,'guarded_user').recovery_required,true);
  assert.equal(get(restored,'guarded_user').recovery_reason,'restored_unverified');
  const observed={};
  fire('started',{terminal,execution:observed});
  assert.throws(()=>restored.confirmRestoredUserShell('guarded_user'),/observed external command still active/,
    'Manual confirmation must not dismiss a known active external execution');
  fire('ended',{terminal,execution:observed,exitCode:0});
  assert.equal(get(restored,'guarded_user').recovery_required,false,
    'An actual definite end signal can auto-unlock a restored terminal');
  assert.equal(get(restored,'guarded_user').recovery_reason,undefined);
  assert.equal(commandsSent,0,'Diagnostics and reattachment never send terminal commands');
  console.log('PASS: identify externally running commands and ambiguous/restored recovery without interrupting terminals');
 }finally{
  manager.dispose(true);
  restored?.dispose(true);
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});