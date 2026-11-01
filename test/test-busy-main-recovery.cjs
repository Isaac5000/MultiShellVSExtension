'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-busy-main-'));
const slug=path.basename(cwd).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const persisted='main-'+slug+'-deadbeef';
const observed=[];
const terminalArray=[];
const vscode={
  workspace:{workspaceFolders:[{uri:{fsPath:cwd}}]},
  env:{language:'en'},
  window:{
    terminals:terminalArray,
    onDidCloseTerminal(fn){
      observed.push(fn);
      return{dispose(){observed.splice(observed.indexOf(fn),1);}};
    },
    createTerminal({name,cwd:original}){
      const shell={
        name,creationOptions:{cwd:original},state:{isInteractedWith:false},disposed:false,show(){},
        dispose(){
          this.disposed=true;
          const i=terminalArray.indexOf(this);
          if(i>=0)terminalArray.splice(i,1);
          for(const callback of [...observed])callback(this);
        }
      };
      terminalArray.push(shell);
      return shell;
    }
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const {MultiWindowController}=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager},vscode
});
async function main(){
  let ctl;
  try{
    ctl=new MultiWindowController(0,'a'.repeat(64),cwd,
      async()=>({stop:async()=>{}}),()=>{},'project',persisted);
    await ctl.start();
    const fallback=ctl.primaryShellId;
    assert.notEqual(fallback,persisted);
    // Simulate MCP having already used the fallback: closing it would risk
    // losing a user's command, so late restoration must not replace it.
    const current=ctl.localShells.shells.get(fallback);
    assert.ok(current);
    current.commandInvoked=true;
    assert.equal(ctl.localShells.canRetireUnusedFallbackMain(fallback),false,
      'A fallback used by MCP cannot be retired');
    // Even without MCP activity, manual user interaction must guard the
    // terminal against disposal when the old primary reappears.
    current.commandInvoked=false;
    current.terminal.state.isInteractedWith=true;
    assert.equal(ctl.localShells.canRetireUnusedFallbackMain(fallback),false,
      'An interacted-with fallback cannot be retired automatically');
    current.commandInvoked=true;
    const original={
      name:'MCP ['+persisted+']',
      creationOptions:{cwd},disposed:false,show(){},
      dispose(){this.disposed=true;}
    };
    terminalArray.push(original);
    await ctl.heartbeat();
    const snapshot=await ctl.panelState();
    assert.equal(snapshot.primary,fallback);
    assert.deepEqual(snapshot.shells.map(x=>x.shell_id),[fallback],
      'A late original must never appear as a second main when fallback is in use');
    assert.equal(original.disposed,false,
      'Cannot delete a process from an earlier VS Code session');
    assert.equal(current.terminal.disposed,false,
      'A fallback that has executed commands must not be destroyed');
    assert.equal(terminalArray.length,2,
      'Physical old terminals are left untouched until there is proof they are safe to close');
    console.log('PASS: active fallback is preserved and late original cannot duplicate the managed main');
  }finally{
    await ctl?.stop(true);
    fs.rmSync(cwd,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});