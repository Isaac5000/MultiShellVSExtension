'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-user-restore-'));
const workspace=path.join(temp,'project'),nested=path.join(workspace,'src'),foreign=path.join(temp,'foreign');
const external=path.join(temp,'user-outside');
for(const d of [workspace,nested,foreign,external])fs.mkdirSync(d,{recursive:true});
const listeners={opened:new Set(),closed:new Set(),ended:new Set(),integration:new Set()};
const observe=k=>fn=>{listeners[k].add(fn);return{dispose(){listeners[k].delete(fn);}}};
const fire=(k,obj)=>{for(const fn of [...listeners[k]])fn(obj)};
const events=[];
const vscode={
 workspace:{workspaceFolders:[{uri:{fsPath:workspace}}]},
 window:{
  terminals:[],
  onDidOpenTerminal:observe('opened'),
  onDidCloseTerminal:observe('closed'),
  onDidEndTerminalShellExecution:observe('ended'),
  onDidChangeTerminalShellIntegration:observe('integration'),
  createTerminal(options){
   const t=terminal(options.name,options.cwd);
   this.terminals.push(t);
   events.push('created:'+t.name);
   fire('opened',t);
   return t;
  }
 }
};
function terminal(name,cwd){
 const t={
  name,creationOptions:{cwd},disposed:false,shown:0,show(){this.shown++},
  dispose(){
   if(this.disposed)return;
   this.disposed=true;events.push('disposed:'+this.name);
   vscode.window.terminals=vscode.window.terminals.filter(x=>x!==this);
   fire('closed',this);
  }
 };
 t.shellIntegration={executeCommand(command){
   const execution={async *read(){
    await new Promise(r=>setTimeout(r,20));
    fire('ended',{terminal:t,execution,exitCode:0});
    yield 'existing:'+command;
   }};
   return execution;
 }};
 return t;
}
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const slug=path.basename(workspace).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const mainId='main-'+slug+'-aaaa1111';
const original=terminal('MCP ['+mainId+']',workspace);
const gay=terminal('MCP [gay]',nested);
const externalUser=terminal('MCP [outside_user]',external);
const ignored=terminal('MCP [other_mcp]',foreign);
const ordinary=terminal('PowerShell',nested);
async function main(){
 try {
  vscode.window.terminals=[ordinary,original,gay,externalUser,ignored];
  const first=new ShellManager();
  assert.equal(first.restoreMainTerminals(workspace,mainId),mainId);
  const recovered=first.restoreUserTerminals(workspace,[{shell_id:'outside_user',initial_cwd:external,alias:'externalalias'}]);
  assert.deepEqual(recovered.map(s=>s.shell_id),['gay','outside_user']);
  const gayDescription=first.list().find(s=>s.shell_id==='gay');
  assert.equal(gayDescription.origin,'user');
  assert.equal(gayDescription.recovery_required,true);
  assert.equal(gayDescription.initial_cwd,fs.realpathSync(nested));
  assert.equal(first.list().some(s=>s.shell_id==='other_mcp'),false,'foreign workspace must not be adopted');
  assert.equal(events.length,0,'no replacement terminals may be created');
  await assert.rejects(first.execute('gay','must not run before confirmation'),/requires confirmation/);
  assert.equal(first.root('gay'),fs.realpathSync(nested),'file tools remain scoped to original cwd');
  first.show('gay');assert.equal(gay.shown,1);
  first.confirmRestoredUserShell('gay');
  const exec=await first.execute('gay','echo after confirmation',6000);
  assert.equal(exec.exit_code,0);
  assert.match(exec.output,/existing:echo after confirmation/);
  first.dispose(true);
  assert.equal(gay.disposed,false,'unload must preserve physical user terminal');

  // VSCode restored the physical terminal but omitted creationOptions.cwd.
  // Persisted workspace metadata must be sufficient to reattach safely.
  gay.creationOptions={name:'MCP [gay]'};
  const unknownWithoutCwd=terminal('MCP [untracked]',nested);
  unknownWithoutCwd.creationOptions={name:'MCP [untracked]'};
  vscode.window.terminals.push(unknownWithoutCwd);
  const duplicateA=terminal('MCP [dupe]',nested),duplicateB=terminal('MCP [dupe]',nested);
  vscode.window.terminals.push(duplicateA,duplicateB);
  const second=new ShellManager();
  assert.equal(second.restoreMainTerminals(workspace,mainId),mainId);
  const saved=[{shell_id:'gay',initial_cwd:nested,alias:'gaysaved'}];
  assert.deepEqual(second.restoreUserTerminals(workspace,saved).map(s=>s.shell_id),['gay']);
  assert.equal(second.restoreUserTerminals(workspace,saved).length,0,'repeated scans must not duplicate');
  assert.equal(second.list().find(s=>s.shell_id==='gay').recovery_required,true);
  assert.equal(second.root('gay'),fs.realpathSync(nested),'saved cwd survives missing creationOptions.cwd');
  assert.equal(second.list().some(s=>s.shell_id==='untracked'),false,'no unsaved terminal can be recovered without cwd');
  assert.equal(second.restoreUserTerminals(workspace,[{shell_id:'dupe',initial_cwd:nested}]).length,0,'ambiguous physical terminal ID must be rejected');
  assert.equal(events.length,0,'restoring must not create physical terminal');
  // Reject stale saved ownership pointing at another physical cwd.
  const wrongSaved=[{shell_id:'outside_user',initial_cwd:workspace}];
  assert.equal(second.restoreUserTerminals(workspace,wrongSaved).some(s=>s.shell_id==='outside_user'),false);
  second.close('gay');
  assert.equal(gay.disposed,true,'manual close must remain final');
  assert.equal(second.restoreUserTerminals(workspace,saved).length,0,'closed terminal must not be recreated');
  second.dispose(true);

  console.log('PASS: existing user terminals restored by exact name and cwd; preserved across reload; old untracked shell recovered only in same workspace; explicit idle confirmation; never adopt foreign project or reopen closed shell');
 }finally{
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});