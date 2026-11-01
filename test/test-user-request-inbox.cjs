'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class FakeShellManager{
  constructor(){this.items=new Map();}
  create(id,cwd,_,origin){
    if(this.items.has(id))throw Error('duplicate ID');
    const x={shell_id:id,initial_cwd:cwd,origin,busy:false,queued:0};
    this.items.set(id,x);return x;
  }
  list(){return [...this.items.values()];}
  close(id){this.items.delete(id);}
  dispose(){}
}
const multi=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager:FakeShellManager}
});
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':multi,
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function unpack(raw){
  const data=raw.split(/\r?\n/).find(x=>x.startsWith('data:'));
  return JSON.parse(data?data.slice(5):raw);
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-inbox-'));
 const paths=['denied','approved','cancelled','forged'].map(x=>path.join(dir,x));
 paths.forEach(p=>fs.mkdirSync(p));
 const token='f'.repeat(64),shells=new FakeShellManager(),stored=[];
 const worker=new multi.WindowWorker(shells,token,dir,undefined,async shell=>stored.push(shell),true);
 await worker.start();
 const router=new multi.WindowRouter(token);
 router.register({window_id:worker.id,workspace:dir,worker_port:worker.port});
 await router.reconcile(worker.id);
 const server=new MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:true},router);
 await server.start();
 try{
   const port=server.httpServer.address().port;
   function request(id,cwd,signal){
     return fetch('http://127.0.0.1:'+port+'/mcp',{
       method:'POST',signal,headers:{
         'content-type':'application/json','accept':'application/json,text/event-stream'},
       body:JSON.stringify({jsonrpc:'2.0',id:314,method:'tools/call',
         params:{name:'create_user_shell_code',arguments:{shell_id:id,cwd}}})
     }).then(async r=>{assert.equal(r.status,200);return unpack(await r.text()).result;});
   }
   async function pending(id){
     for(let i=0;i<40;i++){
       const entry=worker.listPendingUserRequests().find(x=>x.shell_id===id);
       if(entry)return entry;
       await wait(25);
     }
     throw Error('No queued request for '+id);
   }
   const denied=request('denied',paths[0]);
   const item=await pending('denied');
   assert.equal(item.cwd,paths[0]);assert.equal(item.share,false);
   assert.ok(item.expires_at>item.created_at);
   assert.equal(shells.items.size,0,'Requests must never create terminals before approval');
   const forged=await fetch('http://127.0.0.1:'+port+multi.CONTROL_PATH,{
     method:'POST',headers:{'x-multishell-token':token,'content-type':'application/json'},
     body:JSON.stringify({op:'approve_user',request_id:item.request_id})
   });
   assert.equal(forged.status,400,'Internal network API cannot approve requests');
   assert.equal(worker.listPendingUserRequests().length,1);
   assert.equal(worker.decideUserRequest('wrong-id',true),false);
   assert.equal(worker.decideUserRequest(item.request_id,false),true);
   const rejected=await denied;
   assert.equal(rejected.isError,true);
   assert.match(rejected.content[0].text,/not approved/i);
   assert.equal(shells.items.size,0);
   assert.equal(worker.listPendingUserRequests().length,0);

   const allowed=request('approved',paths[1]);
   const accepted=await pending('approved');
   assert.equal(worker.decideUserRequest(accepted.request_id,true),true);
   const created=await allowed;
   assert.equal(created.isError,false);
   assert.equal(shells.items.get('approved').origin,'user');
   assert.deepEqual(stored.map(x=>x.shell_id),['approved']);
   assert.equal(worker.listPendingUserRequests().length,0);

   const ac=new AbortController();
   const cancelling=request('cancelled',paths[2],ac.signal).catch(()=>undefined);
   await pending('cancelled');
   ac.abort();
   await cancelling;
   for(let i=0;i<30&&worker.listPendingUserRequests().length;i++){await wait(20);}
   assert.equal(worker.listPendingUserRequests().length,0);
   assert.equal(shells.items.has('cancelled'),false);

   const queued=request('forged',paths[3]);
   const pendingBeforeStop=await pending('forged');
   assert.ok(pendingBeforeStop.request_id);
   await worker.stop();
   const onStop=await queued;
   assert.equal(onStop.isError,true);
   assert.equal(shells.items.has('forged'),false);
   assert.equal(worker.listPendingUserRequests().length,0);
   console.log('PASS: local approval inbox, approve/deny/cancel, no remote approval, and shutdown clears pending requests');
 }finally{
   await server.stop();await worker.stop();
   fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
