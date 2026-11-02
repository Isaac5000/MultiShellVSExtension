'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const proxyquire=require('proxyquire').noCallThru();
const servers=[];
class Manager {list(){return[];}dispose(){}}
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:Manager},
 http:{...http,createServer(...args){const server=http.createServer(...args);servers.push(server);return server;}}});
const {MCPServer}=proxyquire('../out/server.js',{'./multi-window':mw,
 './utils/logger':{logger:{info(){},warn(){},error(){}}}});
const token='a'.repeat(64);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(port){const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
 method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream'},
 signal:AbortSignal.timeout(3000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal(response.status,200);await response.text();}
(async()=>{
 assert.equal(mw.authenticated('é'.repeat(64),token),false,'Malformed token must not throw from the HTTP callback');
 assert.equal(mw.authenticated(token,token),true);
 for(const value of [undefined,[],{},'',token+'x','b'.repeat(64)])assert.equal(mw.authenticated(value,token),false);
 const worker=new mw.WindowWorker(new Manager(),token,__dirname);
 try{
  await Promise.all(Array.from({length:12},()=>worker.start()));
  assert.equal(servers.filter(server=>server.listening).length,1,'Concurrent starts must share a single listener');
  const malformed=await new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:worker.port,path:'/_multishell/action',method:'POST',
    headers:{'x-multishell-token':'é'.repeat(64),'content-type':'application/json'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});
   req.on('error',reject);req.end('{"op":"list"}');
  });
  assert.equal(malformed,403);
  const upload=http.request({hostname:'127.0.0.1',port:worker.port,path:'/_multishell/action',method:'POST',
   headers:{'x-multishell-token':token,'content-type':'application/json','content-length':100000}});
  upload.on('error',()=>{});upload.write('{');
  for(let i=0;i<50&&worker.requests.size===0;i++)await wait(5);
  assert.equal(worker.requests.size,1);const workerStop=Date.now();
  await Promise.all(Array.from({length:8},()=>worker.stop()));
  assert.ok(Date.now()-workerStop<1000,'An incomplete upload must not block worker shutdown');upload.destroy();
  assert.equal(servers.filter(server=>server.listening).length,0,'Stop must not leave an orphan listener');
  await Promise.all([worker.start(),worker.stop()]);
  assert.equal(worker.isHealthy(),false,'Stop during startup must wait for and close that startup');
 }finally{await worker.stop();for(const server of servers){server.closeAllConnections?.();if(server.listening)await new Promise(resolve=>server.close(resolve));}}

 const shells={list(){return[];},windows(){return[];}};
 const hub=new MCPServer(0,'127.0.0.1',shells,{file:false,edit:false,shell:false});
 try{
  await Promise.all(Array.from({length:12},()=>hub.start()));
  const old=hub.httpServer;
  await rpc(old.address().port);
  await Promise.all([hub.stop(),hub.stop()]);
  await hub.start();
  old.emit('error',new Error('Late error from the old listener'));
  old.emit('close');
  assert.equal(hub.isHealthy(),true,'An old listener must not invalidate a healthy replacement');
  await rpc(hub.httpServer.address().port);
  const upload=http.request({hostname:'127.0.0.1',port:hub.httpServer.address().port,path:'/mcp',method:'POST',
   headers:{'content-type':'application/json','content-length':100000}});
  upload.on('error',()=>{});upload.write('{');await wait(20);const hubStop=Date.now();
  await Promise.all([hub.stop(),hub.stop()]);
  assert.ok(Date.now()-hubStop<2300,'An incomplete JSON request must not block hub shutdown');upload.destroy();
 }finally{await hub.stop();}

 const router=new mw.WindowRouter(token);
 router.register({window_id:'lifecycle_window',workspace:__dirname,worker_port:49001});
 let deliver;
 router.send=async(_id,action)=>action.op==='list'?new Promise(resolve=>{deliver=resolve;}):{};
 const stale=router.reconcile('lifecycle_window');
 const rejected=assert.rejects(stale,/connection changed|reconnect/i);
 while(!deliver)await wait(1);
 router.register({window_id:'lifecycle_window',workspace:__dirname,worker_port:49002});
 deliver([{shell_id:'stale_shell',initial_cwd:__dirname,origin:'user',busy:false,queued:0}]);
 await rejected;assert.equal(router.assigned.has('stale_shell'),false);
 console.log('PASS: malformed auth, concurrent startup/shutdown, no orphan listeners, stale-listener events and stale reconciliation');
})().catch(error=>{console.error(error);process.exitCode=1;});
