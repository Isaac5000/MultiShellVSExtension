'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const handlers={closed:new Set(),integration:new Set(),ended:new Set()};
const subscribe=type=>fn=>{handlers[type].add(fn);return {dispose:()=>handlers[type].delete(fn)}};
const dispatch=(type,value)=>{for(const fn of handlers[type])fn(value)};
let releaseOutput;
const dispatched=[];
const vscode={workspace:{workspaceFolders:[]},window:{
 onDidCloseTerminal:subscribe('closed'),
 onDidChangeTerminalShellIntegration:subscribe('integration'),
 onDidEndTerminalShellExecution:subscribe('ended'),
 createTerminal(o){
  const terminal={name:o.name,state:{isInteractedWith:false},
   dispose(){dispatch('closed',terminal);},show(){},
   shellIntegration:{executeCommand(command){
    dispatched.push(command);
    const execution={async *read(){
     await new Promise(resolve=>{releaseOutput=resolve});
     dispatch('ended',{terminal,execution,exitCode:0});
     yield 'OK';
    }};
    return execution;
   }}
  };
  return terminal;
 }}
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-queue-limit-'));
 const mgr=new ShellManager();
 try{
  const session=mgr.create('testqueue',root,true,'user');
  const active=mgr.execute(session.shell_id,'active',10000);
  for(let i=0;i<200&&!releaseOutput;i++){await new Promise(r=>setTimeout(r,2));}
  assert.equal(typeof releaseOutput,'function','First command should be executing');
  const aborts=Array.from({length:16},()=>new AbortController());
  const waiting=aborts.map((ctl,i)=>mgr.execute(session.shell_id,'queued-'+i,10000,ctl.signal));
  assert.equal(mgr.list().find(x=>x.shell_id===session.shell_id).queued,16);
  await assert.rejects(mgr.execute(session.shell_id,'overflow',10000),/queue.*limit|too many queued/i);
  assert.equal(dispatched.includes('overflow'),false);
  assert.equal(mgr.list().find(x=>x.shell_id===session.shell_id).queued,16);
  aborts.forEach(ctl=>ctl.abort());
  const completed=await Promise.allSettled(waiting);
  assert.equal(completed.filter(r=>r.status==='rejected').length,16);
  releaseOutput();
  assert.equal((await active).exit_code,0);
  assert.equal(mgr.list().find(x=>x.shell_id===session.shell_id).queued,0);
  assert.deepEqual(dispatched,['active'],'Overflow must not send any terminal input');
  console.log('PASS: per-shell FIFO bounded at 16 waiting requests, rejection without terminal injection, cancellation recovery');
 }finally{mgr.dispose();fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1});
