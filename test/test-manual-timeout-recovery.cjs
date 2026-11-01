'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hooks={closed:new Set(),integration:new Set(),ended:new Set()};
const subscribe=k=>fn=>{hooks[k].add(fn);return{dispose(){hooks[k].delete(fn);}};};
const emit=(k,v)=>{for(const cb of [...hooks[k]])cb(v);};
let disposed=false;
const commands=[];
const vscode={workspace:{workspaceFolders:[]},window:{
  onDidCloseTerminal:subscribe('closed'),
  onDidChangeTerminalShellIntegration:subscribe('integration'),
  onDidEndTerminalShellExecution:subscribe('ended'),
  createTerminal(){
    const terminal={dispose(){disposed=true;emit('closed',terminal);},shellIntegration:{
      executeCommand(command){
        commands.push(command);
        const execution={async *read(){
          await wait(command==='lost_completion'?1250:30);
          if(command!=='lost_completion')emit('ended',{terminal,execution,exitCode:0});
          yield command;
        }};
        return execution;
      }
    }};
    return terminal;
  }
}};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-manual-restore-'));
  const m=new ShellManager();
  try{
    m.create('manual_shell',dir,false,'user');
    assert.throws(()=>m.confirmRestoredUserShell('manual_shell'),/No restored or timed-out terminal/);
    await assert.rejects(m.execute('manual_shell','lost_completion',1000),/timed out.*preserved/i);
    const timedOut=m.list().find(s=>s.shell_id==='manual_shell');
    assert.equal(timedOut.timed_out_running,true);
    assert.equal(timedOut.busy,true);
    assert.equal(disposed,false,'Manual terminal must remain physically open');
    await wait(360);
    assert.equal(m.list()[0].busy,true,'Missing end event must remain guarded');
    await assert.rejects(m.execute('manual_shell','cannot_overlap',1000),/still running after its timeout/i);
    const restored=m.confirmRestoredUserShell('manual_shell');
    assert.equal(restored.busy,false);
    assert.equal(restored.timed_out_running,false);
    assert.equal(disposed,false);
    const resumed=await m.execute('manual_shell','after_user_confirmation',1000);
    assert.equal(resumed.exit_code,0);
    assert.deepEqual(commands,['lost_completion','after_user_confirmation']);
    console.log('PASS: explicit idle acknowledgement unblocks timed-out user shell after missing VSCode completion event without disposing terminal');
  }finally{m.dispose(true);fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});