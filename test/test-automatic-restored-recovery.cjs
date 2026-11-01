'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-auto-recovery-'));
const userDir=path.join(root,'work');
fs.mkdirSync(userDir);
const slug=path.basename(root).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const mainId='main-'+slug+'-1234abcd';
const listeners={started:new Set(),ended:new Set(),closed:new Set()};
const on=kind=>callback=>{
  listeners[kind].add(callback);
  return {dispose(){listeners[kind].delete(callback);}};
};
function fire(kind,event){for(const callback of [...listeners[kind]])callback(event);}
const issued=[];
function terminal(id,cwd){
  const t={
    name:'MCP ['+id+']',
    creationOptions:{cwd},
    disposed:false,
    show(){},
    dispose(){this.disposed=true;fire('closed',t);}
  };
  t.shellIntegration={executeCommand(command){
    issued.push({id,command});
    const exec={
      async *read(){
        await new Promise(resolve=>setTimeout(resolve,25));
        fire('ended',{terminal:t,execution:exec,exitCode:0});
        yield 'ok:'+command;
      }
    };
    return exec;
  }};
  return t;
}
const main=terminal(mainId,root);
const user=terminal('restored_user',userDir);
const foreign=terminal('foreign',root);
foreign.name='PowerShell'; // Real terminals outside MultiShell must not be adopted.
const vscode={
  workspace:{workspaceFolders:[{uri:{fsPath:root}}]},
  window:{
    terminals:[main,user,foreign],
    onDidCloseTerminal:on('closed'),
    onDidStartTerminalShellExecution:on('started'),
    onDidEndTerminalShellExecution:on('ended')
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
async function run(){
  const manager=new ShellManager();
  try{
    assert.equal(manager.restoreMainTerminals(root,mainId),mainId);
    assert.equal(manager.restoreUserTerminals(root,[{
      shell_id:'restored_user',initial_cwd:userDir
    }]).length,1);
    const state=id=>manager.list().find(x=>x.shell_id===id);
    assert.equal(state(mainId).recovery_required,true);
    assert.equal(state('restored_user').recovery_required,true);
    assert.equal(issued.length,0,
      'Restoration must never inject test commands into a potentially busy terminal');

    await assert.rejects(manager.execute('restored_user','must_not_start',1000),
      /requires confirmation/);
    assert.equal(issued.length,0);

    // An unrelated shell event must not release any protected terminal.
    fire('ended',{terminal:foreign,execution:{},exitCode:0});
    assert.equal(state('restored_user').recovery_required,true);
    assert.equal(state(mainId).recovery_required,true);

    // An unpaired event with no exit code is insufficient recovery proof.
    const ambiguous={};
    fire('ended',{terminal:user,execution:ambiguous,exitCode:undefined});
    assert.equal(state('restored_user').recovery_required,true);

    // Two executions observed on the same terminal: both must finish.
    const first={},second={};
    fire('started',{terminal:user,execution:first});
    fire('started',{terminal:user,execution:second});
    fire('ended',{terminal:user,execution:first,exitCode:0});
    assert.equal(state('restored_user').recovery_required,true,
      'Completion of one observed execution must not unlock an active second');
    fire('ended',{terminal:user,execution:second,exitCode:0});
    assert.equal(state('restored_user').recovery_required,false,
      'A definite, final completion event should restore MCP automatically');
    assert.equal(issued.length,0,'Safe recovery must not send probe commands');
    const output=await manager.execute('restored_user','after_recovery',1000);
    assert.equal(output.exit_code,0);
    assert.match(output.output,/ok:after_recovery/);
    assert.deepEqual(issued.map(x=>x.command),['after_recovery']);

    // A command may start before the extension reloads; its end notification
    // alone can be observed by the new extension host.
    fire('ended',{terminal:main,execution:{},exitCode:0});
    assert.equal(state(mainId).recovery_required,false);
    const mainResult=await manager.execute(mainId,'main_after_restore',1000);
    assert.equal(mainResult.exit_code,0);
    assert.deepEqual(issued.map(x=>x.command),
      ['after_recovery','main_after_restore']);

    // A completion can be observed before VS Code finishes reattaching
    // the terminal. Save that evidence without executing any probe.
    const early=terminal('early_user',userDir);
    vscode.window.terminals.push(early);
    fire('ended',{terminal:early,execution:{},exitCode:0});
    const earlyRestored=manager.restoreUserTerminals(root,[{
      shell_id:'early_user',initial_cwd:userDir
    }]);
    assert.equal(earlyRestored.length,1);
    assert.equal(earlyRestored[0].recovery_required,false,
      'A definite completion during restoration should avoid the manual prompt');
    assert.equal(issued.length,2);
    await manager.execute('early_user','after_early_completion',1000);
    assert.equal(issued.length,3);

    // Even a matching end without exit code can represent a subshell opening.
    const nonNumeric=terminal('undefined_exit',userDir);
    vscode.window.terminals.push(nonNumeric);
    manager.restoreUserTerminals(root,[{
      shell_id:'undefined_exit',initial_cwd:userDir
    }]);
    assert.equal(state('undefined_exit').recovery_required,true);
    const observed={};
    fire('started',{terminal:nonNumeric,execution:observed});
    fire('ended',{terminal:nonNumeric,execution:observed,exitCode:undefined});
    assert.equal(state('undefined_exit').recovery_required,true,
      'Undefined exit codes must preserve the recovery guard');

    // A newer start invalidates any previous idle evidence.
    const busy=terminal('early_busy',userDir);
    vscode.window.terminals.push(busy);
    fire('ended',{terminal:busy,execution:{},exitCode:0});
    const running={};
    fire('started',{terminal:busy,execution:running});
    const busyRestored=manager.restoreUserTerminals(root,[{
      shell_id:'early_busy',initial_cwd:userDir
    }]);
    assert.equal(busyRestored.length,1);
    assert.equal(busyRestored[0].recovery_required,true);
    await assert.rejects(manager.execute('early_busy','not_while_running',1000),
      /requires confirmation/);
    fire('ended',{terminal:busy,execution:running,exitCode:0});
    assert.equal(manager.list().find(x=>x.shell_id==='early_busy').recovery_required,false);
  }finally{
    manager.dispose(true);
    assert.equal(user.disposed,false,'Recovery never closes a user terminal');
    assert.equal(main.disposed,false,'Recovery never closes the primary terminal');
    for(const subscriptions of Object.values(listeners)){
      assert.equal(subscriptions.size,0,'Event subscriptions must be disposed');
    }
    fs.rmSync(root,{recursive:true,force:true});
  }
  console.log('PASS: restored user and primary terminals automatically recover on definite shell completion; uncertain/foreign/active executions stay guarded');
}
run().catch(error=>{console.error(error);process.exitCode=1;});