'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-user-controller-'));
const workspace=path.join(root,'project');fs.mkdirSync(workspace);
const hooks={closed:new Set(),opened:new Set(),ended:new Set(),integration:new Set()};
const sub=key=>fn=>{hooks[key].add(fn);return{dispose(){hooks[key].delete(fn)}}};
const fire=(key,data)=>{for(const f of [...hooks[key]])f(data)};
const vscode={
 workspace:{workspaceFolders:[{uri:{fsPath:workspace}}]},
 window:{
  terminals:[],onDidOpenTerminal:sub('opened'),onDidCloseTerminal:sub('closed'),
  onDidChangeTerminalShellIntegration:sub('integration'),
  onDidEndTerminalShellExecution:sub('ended'),
  createTerminal(options){
   const term=terminal(options.name,options.cwd);
   this.terminals.push(term);fire('opened',term);return term;
  }
 }
};
let created=0;
function terminal(name,cwd){
 created++;
 const t={name,creationOptions:{cwd},disposed:false,show(){},dispose(){
  if(this.disposed)return;this.disposed=true;
  vscode.window.terminals=vscode.window.terminals.filter(x=>x!==t);fire('closed',t);
 }};
 t.shellIntegration={executeCommand(command){
  const execution={async *read(){
   fire('ended',{terminal:t,execution,exitCode:0});
   yield 'RESULT_'+command;
  }};
  return execution;
 }};
 return t;
}
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const {MultiWindowController}=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager}});
const slug=path.basename(workspace).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const primary='main-'+slug+'-aabbccdd';
async function main(){
 const mainTerminal=terminal('MCP ['+primary+']',workspace);
 const oldUser=terminal('MCP [gay]',workspace);
 vscode.window.terminals=[mainTerminal,oldUser];
 const originalCount=created;
 const token='5'.repeat(64),createHub=async()=>({stop:async()=>{}});
 const c=new MultiWindowController(0,token,workspace,createHub,()=>{},'mainalias',primary,[]);
 try{
  await c.start();
  let state=await c.panelState();
  assert.equal(created,originalCount,'startup must not create replacement terminals');
  assert.equal(state.primary,primary);
  assert.equal(state.shells.find(s=>s.shell_id==='gay').recovery_required,true);
  assert.equal(state.shells.find(s=>s.shell_id==='gay').origin,'user');
  assert.equal(c.router.resolve('gay'),'gay','recovered shell must be registered with hub');
  await assert.rejects(c.router.execute('gay','nope',5000),/requires confirmation/);
  const confirmed=await c.panelConfirmRestoredShell('gay');
  assert.equal(confirmed.recovery_required,false);
  const result=await c.router.execute('gay','echo resumed',8000);
  assert.equal(result.exit_code,0);
  assert.match(result.output,/RESULT_echo resumed/);
  await c.stop(true);
  assert.equal(oldUser.disposed,false);
  // VSCode can keep the process but forget creationOptions.cwd after reload.
  oldUser.creationOptions={name:'MCP [gay]'};
  const c2=new MultiWindowController(0,token,workspace,createHub,()=>{},'mainalias',primary,
   [{shell_id:'gay',initial_cwd:workspace,alias:'savedgay'}]);
  try{
   await c2.start();
   state=await c2.panelState();
   assert.equal(state.shells.find(s=>s.shell_id==='gay').alias,'savedgay');
   assert.equal(c2.router.resolve('savedgay'),'gay');
   assert.equal(created,originalCount,'a second startup must reattach, not duplicate');
   assert.equal(state.shells.find(s=>s.shell_id==='gay').recovery_required,true);
  }finally{await c2.stop(true);}
  console.log('PASS: controller registers orphaned user shell, requires idle confirmation, reconnects alias across second reload without creating duplicates');
 }finally{
  await c.stop(true);
  fs.rmSync(root,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});