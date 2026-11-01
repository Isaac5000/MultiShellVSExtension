'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const logs=[];
const logger={info(){},warn(message){logs.push(String(message));},error(message){logs.push(String(message));}};
class FakeManager{
  constructor(){this.items=[];}
  restoreUserTerminals(){return [];}
  list(){return this.items;}
  create(id,cwd){
    const item={shell_id:id,initial_cwd:cwd,origin:'automatic',
      recovery_required:false,timed_out_running:false,busy:false,queued:0};
    this.items.push(item);
    return item;
  }
  dispose(){this.items=[];}
}
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
const {MCPServer}=proxyquire('../out/server.js',{
  './utils/logger':{logger},'./multi-window':mw
});
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-server-health-'));
  const secret='e'.repeat(64);
  const listeners=[];
  const createHub=async router=>{
    const server=new MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:false},router);
    await server.start();
    listeners.push(server);
    return server;
  };
  const controller=new mw.MultiWindowController(0,secret,dir,createHub);
  try{
    await controller.start();
    const originalWorker=controller.worker.server;
    const primaryId=controller.primaryShellId;
    const priorWorkerPort=controller.worker.port;
    await new Promise(resolve=>originalWorker.close(resolve));
    assert.equal(controller.worker.isHealthy(),false);
    await controller.heartbeat();
    assert.equal(controller.worker.isHealthy(),true,
      'Window worker HTTP port must be rebound after an unexpected close');
    assert.notEqual(controller.worker.server,originalWorker);
    assert.ok(controller.worker.port>0);
    assert.equal(controller.primaryShellId,primaryId,
      'Worker recovery must not create or rename a second main terminal');
    assert.equal(controller.localShells.list().filter(s=>s.shell_id===primaryId).length,1);
    assert.ok(controller.router.windows().some(w=>w.window_id===controller.worker.id && w.online));
    assert.equal(priorWorkerPort>0,true);
    const original=listeners[0];
    assert.equal(original.isHealthy(),true);
    const http=original.httpServer;
    assert.ok(http.listenerCount('error')>=1,
      'The listener must keep a permanent error handler after startup');
    assert.doesNotThrow(()=>http.emit('error',new Error('Injected socket failure')));
    assert.equal(original.isHealthy(),false);
    assert.ok(logs.some(x=>x.includes('Injected socket failure')),
      'Socket errors must be observable without killing the process');

    await controller.heartbeat();
    assert.equal(listeners.length,2,'Unhealthy hub must be restarted on heartbeat');
    assert.equal(listeners[1].isHealthy(),true);
    assert.equal(original.isHealthy(),false);

    // Unexpected listener shutdown, without the normal MCPServer.stop() path.
    const active=listeners[1];
    await new Promise(resolve=>active.httpServer.close(resolve));
    assert.equal(active.isHealthy(),false,'Unexpected close must be detected');
    await controller.heartbeat();
    assert.equal(listeners.length,3);
    assert.equal(listeners[2].isHealthy(),true);
    assert.equal(controller.role,'hub');

    // Verify that a healthy hub can serve the same no-auth local MCP endpoint.
    const port=listeners[2].httpServer.address().port;
    const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json,text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:20,method:'tools/list',params:{}})
    });
    assert.equal(response.status,200,'Local tunnel-compatible endpoint must remain usable');
    await response.text();
    console.log('PASS: permanent HTTP error handling, worker port rebind and hub recovery after socket failure or shutdown');
  }finally{
    await controller.stop(true);
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});