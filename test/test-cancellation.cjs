'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hooks={closed:new Set(),ended:new Set()};
const on=key=>fn=>{hooks[key].add(fn);return{dispose(){hooks[key].delete(fn);}};};
const emit=(key,data)=>{for(const callback of [...hooks[key]])callback(data);};
const issued=[];
const vscode={
  workspace:{workspaceFolders:[]},
  window:{
    onDidCloseTerminal:on('closed'),
    onDidEndTerminalShellExecution:on('ended'),
    onDidChangeTerminalShellIntegration:()=>({dispose(){}}),
    createTerminal(options){
      const terminal={
        name:options.name,
        dispose(){emit('closed',terminal);},
        shellIntegration:{
          executeCommand(command){
            issued.push(command);
            const execution={
              async *read(){
                await wait(command==='slow'?500:20);
                emit('ended',{terminal,execution,exitCode:0});
                yield command;
              }
            };
            return execution;
          }
        }
      };
      return terminal;
    }
  }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager}});
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':mw,
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-cancel-'));
  const manager=new ShellManager();
  const token='f'.repeat(64);
  const worker=new mw.WindowWorker(manager,token,dir);
  manager.create('queued_shell',dir,true,'user');
  await worker.start();
  const router=new mw.WindowRouter(token);
  const hub=new MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:true},router);
  await hub.start();
  try{
    router.register({window_id:worker.id,workspace:dir,worker_port:worker.port});
    await router.reconcile(worker.id);
    const endpoint='http://127.0.0.1:'+hub.httpServer.address().port+'/mcp';
    const rpc=(command,signal)=>fetch(endpoint,{
      method:'POST',signal,
      headers:{'content-type':'application/json','accept':'application/json,text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:Math.floor(Math.random()*1e6),
        method:'tools/call',params:{name:'execute_shell_command_code',
          arguments:{shell_id:'queued_shell',command,timeout:2000}}})
    });
    const first=rpc('slow');
    await wait(60);
    const abort=new AbortController();
    const second=rpc('must_not_run',abort.signal).catch(()=>undefined);
    for(let i=0;i<20&&!manager.list().find(x=>x.shell_id==='queued_shell')?.queued;i++)await wait(15);
    assert.equal(manager.list().find(x=>x.shell_id==='queued_shell')?.queued,1,
      'Second request should reach the per-shell queue');
    abort.abort();
    await second;
    const firstResult=await first;
    assert.equal(firstResult.status,200);
    await firstResult.text();
    await wait(100);
    assert.deepEqual(issued,['slow'],'Aborted queued MCP request must not execute later');
    assert.equal(manager.list().find(x=>x.shell_id==='queued_shell')?.queued,0);
    console.log('PASS: disconnected tunnel-style HTTP tool request cancels a queued shell command, while running user command completes');
  }finally{
    await hub.stop();
    await worker.stop();
    manager.dispose();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
