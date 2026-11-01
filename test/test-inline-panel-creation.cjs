'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-inline-panel-'));
const child={leader:path.join(root,'leader'),worker:path.join(root,'worker'),
 outsider:path.join(root,'outsider'),mismatch:path.join(root,'mismatch'),
 forged:path.join(root,'forged')};
for(const p of Object.values(child))fs.mkdirSync(p);
const listeners={closed:new Set()};
const on=fn=>{listeners.closed.add(fn);return{dispose(){listeners.closed.delete(fn);}}};
const terminals=[];
let modalCalls=0;
const vscode={
  env:{language:'es'},
  workspace:{workspaceFolders:[{uri:{fsPath:root}}]},
  window:{
    terminals,
    onDidCloseTerminal:on,
    showWarningMessage:async()=>{modalCalls++;return undefined;},
    createTerminal({name,cwd}){
      const terminal={
        name,creationOptions:{cwd},state:{isInteractedWith:false},show(){},
        dispose(){
          for(const f of [...listeners.closed])f(this);
          const n=terminals.indexOf(this);
          if(n>=0)terminals.splice(n,1);
        }
      };
      terminals.push(terminal);
      return terminal;
    }
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager},vscode});
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':mw,
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const secret='a'.repeat(64);
async function check(){
  let leader,follower,hub;
  try{
    const saved=[];
    const created=async shell=>saved.push(shell.shell_id);
    leader=new mw.MultiWindowController(0,secret,root,async()=>({stop:async()=>{}}),
      ()=>{},undefined,undefined,[],undefined,created);
    await leader.start();
    const first=await leader.panelCreateShell('local_panel',child.leader,false);
    assert.equal(first.origin,'user');
    assert.equal(modalCalls,0,'Native sidebar submission must not raise an external confirmation dialog');
    assert.deepEqual(saved,['local_panel']);
    assert.equal(leader.router.resolve('local_panel'),'local_panel');

    await assert.rejects(leader.router.createPanelUser('unauthorized',child.outsider,false,leader.worker.id),
      /not approved/);
    assert.equal(modalCalls,1,'Internal authenticated HTTP alone must still require user approval');
    assert.equal(leader.localShells.list().some(x=>x.shell_id==='unauthorized'),false);

    const mismatched=leader.worker.authorizePanelCreation('wrong_id',child.mismatch,false);
    await assert.rejects(
      leader.router.createPanelUser('mismatch',child.mismatch,false,leader.worker.id,mismatched),
      /Invalid or expired local panel authorization/);
    leader.worker.revokePanelCreation(mismatched);
    assert.equal(modalCalls,1,'Invalid one-time token cannot fall back to silent creation');
    assert.equal(leader.localShells.list().some(x=>x.shell_id==='mismatch'),false);

    await leader.stop(false);
    leader=undefined;
    const router=new mw.WindowRouter(secret);
    hub=new MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:true},router);
    await hub.start();
    const port=hub.httpServer.address().port;
    const savedWorker=[];
    const unavailable=()=>Object.assign(new Error('Port in use'),{code:'EADDRINUSE'});
    follower=new mw.MultiWindowController(port,secret,root,
      async()=>{throw unavailable();},()=>{},undefined,undefined,[],
      undefined,async shell=>savedWorker.push(shell.shell_id));
    await follower.start();
    const local=await follower.panelCreateShell('worker_panel',child.worker,false);
    assert.equal(local.origin,'user');
    assert.equal(modalCalls,1,'Worker sidebar creation must also avoid a separate OS modal');
    assert.deepEqual(savedWorker,['worker_panel']);
    const active=await router.list();
    assert.equal(active.filter(x=>x.shell_id==='worker_panel').length,1);
    assert.equal(router.resolve('worker_panel'),'worker_panel');

    const outsider=await fetch('http://127.0.0.1:'+port+mw.CONTROL_PATH,{
      method:'POST',headers:{
        'content-type':'application/json','x-multishell-token':secret
      },
      body:JSON.stringify({op:'create',id:'forged_panel',cwd:child.forged,
        share:false,origin:'user',window_id:follower.worker.id})
    });
    assert.equal(outsider.status,400);
    assert.match((await outsider.json()).error,/not approved/);
    assert.equal(modalCalls,2,'Forgeries still require explicit user approval');
    assert.equal(follower.localShells.list().some(x=>x.shell_id==='forged_panel'),false);
    console.log('PASS: sidebar creates USER terminals in hub and worker windows without OS modal; forged/mismatched/reused panel authorization never silently bypasses permission');
  }finally{
    await follower?.stop(false);
    await leader?.stop(false);
    await hub?.stop();
    fs.rmSync(root,{recursive:true,force:true});
  }
}
check().catch(error=>{console.error(error);process.exitCode=1;});