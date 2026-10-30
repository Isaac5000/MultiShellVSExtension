'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();
const callbacks={opened:new Set(),closed:new Set(),ended:new Set()};
const subscribe=(kind)=>callback=>{
 callbacks[kind].add(callback);
 return{dispose(){callbacks[kind].delete(callback);}};
};
const events=[];
const vscode={
 workspace:{workspaceFolders:[]},
 window:{
  terminals:[],
  onDidOpenTerminal:subscribe('opened'),
  onDidCloseTerminal:subscribe('closed'),
  onDidEndTerminalShellExecution:subscribe('ended'),
  createTerminal:options=>{
   const terminal={name:options.name,disposed:false,show(){},dispose(){
    this.disposed=true;events.push('disposed:'+this.name);
    vscode.window.terminals=vscode.window.terminals.filter(t=>t!==terminal);
    for(const cb of callbacks.closed)cb(terminal);
   }};
   vscode.window.terminals.push(terminal);
   events.push('created:'+terminal.name);
   for(const cb of callbacks.opened)cb(terminal);
   return terminal;
  }
 }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const project=fs.mkdtempSync(path.join(os.tmpdir(),'restored-main-'));
const workspaceSlug=(path.basename(project)||'window').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const a='main-'+workspaceSlug+'-638b8ab0';
const b='main-'+workspaceSlug+'-525df2e3';
const c='main-'+workspaceSlug+'-3e727b22';
const make=id=>({name:'MCP ['+id+']',disposed:false,dispose(){this.disposed=true;events.push('disposed:'+this.name);},show(){}});
const first=make(a),second=make(b),third=make(c),ordinary=make('powershell');
first.shellIntegration={executeCommand(command){
 const execution={async *read(){
   yield 'restored:'+command;
   for(const listener of callbacks.ended)listener({terminal:first,execution,exitCode:0});
 }};
 return execution;
}};
const wrong=make('main-unrelated-project-12121212');
async function main(){
 try{
  vscode.workspace.workspaceFolders=[{uri:{fsPath:project}}];
  vscode.window.terminals=[ordinary,first,wrong,second,third];
  const manager=new ShellManager();
  assert.equal(manager.restoreMainTerminals(project),a,'Original terminal should be preferred when no ID persisted');
  assert.deepEqual(manager.list().map(x=>x.shell_id),[a,b,c]);
  assert.equal(events.length,0,'No duplicate terminal should be created during recovery');
  assert.equal(manager.root(b),fs.realpathSync(project));
  const restoredResult=await manager.execute(a,'echo recovered');
  assert.equal(restoredResult.exit_code,0);
  assert.equal(restoredResult.output,'restored:echo recovered');
  assert.equal(manager.restoreMainTerminals(project,c),c,'Saved primary ID should be reused');
  manager.show(a);
  manager.close(b);
  assert.equal(second.disposed,true);
  assert.equal(first.disposed,false);
  manager.dispose(true);
  assert.equal(first.disposed,false,'Unload must not kill the restored original');
  assert.equal(third.disposed,false);

  vscode.window.terminals=[ordinary,first,third];
  const manager2=new ShellManager();
  assert.equal(await manager2.awaitRestoredMainTerminals(project,a),a);
  assert.deepEqual(manager2.list().map(s=>s.shell_id),[a,c]);
  manager2.dispose(true);

  vscode.window.terminals=[ordinary];
  const manager3=new ShellManager();
  const wait=manager3.awaitRestoredMainTerminals(project);
  setTimeout(()=>{
   vscode.window.terminals.push(first);
   for(const callback of callbacks.opened)callback(first);
  },30);
  assert.equal(await wait,a,'A late VSCode terminal restore should be recovered');
  assert.equal(events.filter(x=>x.startsWith('created:')).length,0);
  manager3.dispose(true);
  assert.equal(callbacks.opened.size,0,'Terminal restore event listener must be released');
  assert.equal(ordinary.disposed,false,'Unrelated PowerShell must remain untouched');
  assert.equal(wrong.disposed,false,'Another project must remain untouched');
  console.log('PASS: restored original shell, old main shells, persisted identity, late restore, safe detach and unrelated terminal isolation');
 }finally{
  fs.rmSync(project,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});