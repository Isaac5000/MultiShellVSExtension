'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

const closed=new Set();
const vscode={
  workspace:{workspaceFolders:[]},
  window:{
    onDidCloseTerminal(fn){
      closed.add(fn);
      return {dispose(){closed.delete(fn);}};
    },
    createTerminal(opts){
      const terminal={
        name:opts.name,
        creationOptions:opts,
        dispose(){
          for(const callback of [...closed])callback(terminal);
        }
      };
      return terminal;
    }
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const value=(manager,id)=>{
  const shell=manager.list().find(x=>x.shell_id===id);
  assert.ok(shell,'Shell must exist: '+id);
  return shell;
};
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-policy-inherit-'));
  const windowA=new ShellManager();
  const windowB=new ShellManager();
  const unconfigured=new ShellManager();
  try{
    // Global default is ON unless the owning window has overridden it.
    assert.equal(unconfigured.windowAutoExit,true);
    assert.equal(unconfigured.create('default_temp',root,true,'mcp').auto_exit_interactive,true);

    windowA.setInteractivePolicy(true);
    windowA.create('creator',root,true,'user');
    windowA.setShellInteractiveAutoExit('creator',false);
    assert.equal(value(windowA,'creator').auto_exit_interactive,false);

    // The temporary shell does not inherit the creator's exception.
    const temp=windowA.create('temporary',root,true,'mcp');
    assert.equal(temp.origin,'mcp');
    assert.equal(temp.auto_exit_interactive,true);
    assert.equal(temp.auto_exit_override,undefined);

    // Subsequent window changes apply to an existing, unmodified temporary.
    windowA.setWindowInteractiveAutoExit(false);
    assert.equal(value(windowA,'temporary').auto_exit_interactive,false);
    assert.equal(value(windowA,'creator').auto_exit_interactive,false);

    // A newly created temp follows the current window value, not the user shell.
    windowA.setShellInteractiveAutoExit('creator',true);
    assert.equal(value(windowA,'creator').auto_exit_interactive,true);
    const second=windowA.create('second_temp',root,true,'mcp');
    assert.equal(second.auto_exit_interactive,false);
    assert.equal(second.auto_exit_override,undefined);

    // Explicit per-temporary-terminal exceptions win over the window.
    windowA.setShellInteractiveAutoExit('temporary',true);
    assert.equal(value(windowA,'temporary').auto_exit_interactive,true);
    windowA.setWindowInteractiveAutoExit(true);
    windowA.setWindowInteractiveAutoExit(false);
    assert.equal(value(windowA,'temporary').auto_exit_interactive,true);
    assert.equal(value(windowA,'second_temp').auto_exit_interactive,false);

    windowA.setShellInteractiveAutoExit('temporary',undefined);
    assert.equal(value(windowA,'temporary').auto_exit_override,undefined);
    assert.equal(value(windowA,'temporary').auto_exit_interactive,false);

    // A reused temporary ID never receives an old persisted exception.
    windowA.close('temporary');
    windowA.setInteractivePolicy(false,{temporary:true,creator:true});
    const reused=windowA.create('temporary',root,true,'mcp');
    assert.equal(reused.auto_exit_interactive,false);
    assert.equal(reused.auto_exit_override,undefined);
    assert.equal(value(windowA,'creator').auto_exit_interactive,true);

    // Every VS Code window has an independent effective policy.
    windowB.setInteractivePolicy(true);
    windowB.create('other_creator',root,true,'user');
    windowB.setShellInteractiveAutoExit('other_creator',false);
    assert.equal(windowB.create('other_temp',root,true,'mcp').auto_exit_interactive,true);
    windowB.setWindowInteractiveAutoExit(false);
    assert.equal(value(windowB,'other_temp').auto_exit_interactive,false);
    assert.equal(value(windowA,'second_temp').auto_exit_interactive,false);
    windowA.setWindowInteractiveAutoExit(true);
    assert.equal(value(windowA,'second_temp').auto_exit_interactive,true);
    assert.equal(value(windowB,'other_temp').auto_exit_interactive,false);

    // An override is removed when its temporary terminal is closed.
    windowB.setShellInteractiveAutoExit('other_temp',true);
    assert.deepEqual(windowB.getInteractiveOverrides(),{other_creator:false,other_temp:true});
    windowB.close('other_temp');
    assert.deepEqual(windowB.getInteractiveOverrides(),{other_creator:false});
    assert.equal(windowB.create('other_temp',root,true,'mcp').auto_exit_interactive,false);

    console.log('PASS: temporary MCP terminals inherit own window, not creator; live window changes, explicit exceptions, ID reuse and window isolation');
  }finally{
    windowA.dispose(true);
    windowB.dispose(true);
    unconfigured.dispose(true);
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
