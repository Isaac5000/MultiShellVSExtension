'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-late-main-'));
const slug=path.basename(dir).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const persisted='main-'+slug+'-3a4b5c6d';
const listeners={opened:new Set(),closed:new Set()};
const on=kind=>fn=>{listeners[kind].add(fn);return{dispose(){listeners[kind].delete(fn);}}};
const fire=(kind,object)=>{for(const fn of [...listeners[kind]])fn(object);};
let processId=31000;
const terminals=[];
const vscode={env:{language:'en'},workspace:{workspaceFolders:[{uri:{fsPath:dir}}]},
 window:{
  terminals,
  onDidCloseTerminal:on('closed'),onDidOpenTerminal:on('opened'),
  createTerminal({name,cwd}){
   const terminal={
    name,creationOptions:{cwd},processId:Promise.resolve(processId++),state:{isInteractedWith:false},
    disposed:false,show(){},
    dispose(){
     if(this.disposed)return;
     this.disposed=true;
     const i=terminals.indexOf(this);
     if(i>=0)terminals.splice(i,1);
     fire('closed',this);
    }
   };
   terminals.push(terminal);
   fire('opened',terminal);
   return terminal;
  }
 }};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const {MultiWindowController}=proxyquire('../out/multi-window.js',{
 './shell-manager':{ShellManager},vscode
});
async function main(){
 let ctl;
 const persistedIds=[];
 try{
  ctl=new MultiWindowController(0,'e'.repeat(64),dir,
    async()=>({stop:async()=>{}}),()=>{},'my-project',persisted,[],
    undefined,undefined,true,{}, {},async id=>persistedIds.push(id));
  await ctl.start();
  const fallback=ctl.primaryShellId;
  assert.notEqual(fallback,persisted);
  assert.equal((await ctl.panelState()).shells.length,1);
  assert.equal(terminals.length,1);
  const replacement={
    name:'MCP ['+persisted+']',creationOptions:{cwd:dir},
    processId:Promise.resolve(55533),disposed:false,show(){},
    dispose(){this.disposed=true;fire('closed',this);}
  };
  // Simulate a physical terminal that VS Code restores only after the
  // extension has already created a fresh fallback main.
  terminals.push(replacement);
  fire('opened',replacement);
  await ctl.heartbeat();
  const snapshot=await ctl.panelState();
  assert.equal(snapshot.primary,persisted,'Late original should become primary');
  assert.equal(snapshot.shells.length,1,'No extra main must remain in MCP');
  assert.equal(snapshot.shells[0].shell_id,persisted);
  assert.deepEqual(persistedIds,[persisted],'New primary ID must be saved for next reload');
  assert.equal(terminals.length,1,'Unused fallback physical terminal must be retired');
  assert.equal(terminals[0],replacement,'Original physical terminal must survive');
  assert.equal(replacement.disposed,false);
  assert.equal(ctl.router.resolve('my-project'),persisted);
  await ctl.heartbeat();
  assert.equal((await ctl.panelState()).shells.length,1,'Repeated heartbeat must not recreate a fallback');
  console.log('PASS: late VS Code restoration promotes persisted main, retires unused fallback, updates router and stored ID, without duplicates');
 }finally{
  if(ctl){await ctl.stop(true);}
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});