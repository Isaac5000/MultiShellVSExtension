'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();
const events=[];
const listeners={closed:new Set(),opened:new Set()};
const subscribe=k=>fn=>{listeners[k].add(fn);return{dispose(){listeners[k].delete(fn);}};};
const vscode={
 workspace:{workspaceFolders:[]},
 window:{
  terminals:[],
  onDidCloseTerminal:subscribe('closed'),
  onDidOpenTerminal:subscribe('opened'),
  createTerminal(options){
   events.push('create:'+options.name);
   const t={name:options.name,show(){},dispose(){
    events.push('dispose:'+options.name);
    vscode.window.terminals=vscode.window.terminals.filter(x=>x!==t);
    for(const f of listeners.closed)f(t);
   }};
   vscode.window.terminals.push(t);
   return t;
  }
 }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const {MultiWindowController}=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager}});
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-owner-'));
const slug=path.basename(cwd).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const original='main-'+slug+'-638b8ab0';
const newer='main-'+slug+'-3e727b22';
const tOld={creationOptions:{cwd},name:'MCP ['+original+']',disposed:false,show(){},dispose(){this.disposed=true;}};
const tNew={creationOptions:{cwd},name:'MCP ['+newer+']',disposed:false,show(){},dispose(){this.disposed=true;}};
async function main(){
 const token='5'.repeat(64);
 const createHub=async()=>({stop:async()=>{}});
 let win;
 try{
  vscode.workspace.workspaceFolders=[{uri:{fsPath:cwd}}];
  vscode.window.terminals=[tOld,tNew];
  win=new MultiWindowController(0,token,cwd,createHub,()=>{},'lastAlias',undefined);
  await win.start();
  let snapshot=await win.panelState();
  assert.equal(snapshot.primary,original);
  assert.deepEqual(snapshot.shells.map(s=>s.shell_id),[original], 'Only one primary may be registered');
  assert.equal(snapshot.shells.find(x=>x.shell_id===original).alias,'lastalias');
  assert.equal(events.length,0);
  assert.notEqual(snapshot.windowId,original.slice(5),'Worker may have a new ID while primary stays stable');
  assert.equal(win.router.resolve('lastalias'),original);
  await win.stop(true);
  assert.equal(tOld.disposed,false);
  assert.equal(tNew.disposed,false);

  const after=new MultiWindowController(0,token,cwd,createHub,()=>{},'lastAlias',original);
  await after.start();
  snapshot=await after.panelState();
  assert.equal(snapshot.primary,original);
  assert.deepEqual(snapshot.shells.map(x=>x.shell_id),[original], 'Reload must not register residual mains');
  assert.equal(events.length,0,'A second extension launch must not create another terminal');
  await after.stop(true);

  const selected=new MultiWindowController(0,token,cwd,createHub,()=>{},'chosen',newer);
  await selected.start();
  assert.equal((await selected.panelState()).primary,newer,'Valid persisted ID takes priority');
  assert.deepEqual((await selected.panelState()).shells.map(x=>x.shell_id),[newer]);
  assert.equal(selected.router.resolve('chosen'),newer);
  assert.equal(events.length,0);
  await selected.stop(true);
  assert.equal(tOld.disposed,false);
  assert.equal(tNew.disposed,false);
  console.log('PASS: one primary per window, stored identity and alias preserved, historical physical mains untouched');
 }finally{
  if(win){await win.stop(true);}
  fs.rmSync(cwd,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});