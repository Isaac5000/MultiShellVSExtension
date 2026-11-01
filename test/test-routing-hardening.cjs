'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class FakeManager {
  constructor(ids,root){this.ids=ids;this.cwd=root;}
  list(){return this.ids.map(shell_id=>({shell_id,initial_cwd:this.cwd,busy:false,queued:0,origin:'user'}));}
  create(id,cwd){this.ids.push(id);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0,origin:'user'};}
  close(id){this.ids=this.ids.filter(x=>x!==id);}
  dispose(){}
}
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-audit-routing-'));
(async()=>{
 const token='e'.repeat(64);
 const nested=path.join(tmp,'nested');fs.mkdirSync(nested);
 const m=new FakeManager(['alpha'],tmp);
 let release,entered;
 const gate=new Promise(r=>release=r);
 const waiting=new Promise(r=>entered=r);
 const worker=new mw.WindowWorker(m,token,tmp,async(id,alias)=>{
   if(id==='alpha'&&alias==='reserved_id'){entered();await gate;}
 });
 await worker.start();
 const router=new mw.WindowRouter(token);
 try{
   router.register({window_id:worker.id,workspace:tmp,worker_port:worker.port,aliases:Object.fromEntries(worker.aliases)});
   await router.reconcile(worker.id);
   const renaming=router.setAlias('alpha','reserved_id');
   await waiting;
   await assert.rejects(router.create('reserved_id',nested,false,worker.id),/already exists|conflicts with an alias/i,
      'Pending alias must reserve its name against new shell IDs');
   release();
   await renaming;
   assert.equal(router.resolve('reserved_id'),'alpha');
   assert.equal(m.ids.length,1);

   assert.equal(router.windows()[0].online,true);
   await worker.stop();
   assert.deepEqual(await router.list(),[]);
   assert.equal(router.windows()[0].online,false,'Unresponsive worker must not be reported online');
   assert.throws(()=>router.root('alpha'),/offline/i,
     'Disconnected workers must not expose their workspace to file operations');
   await worker.start();
   router.register({window_id:worker.id,workspace:tmp,worker_port:worker.port,aliases:Object.fromEntries(worker.aliases)});
   await router.reconcile(worker.id);
   assert.equal(router.windows()[0].online,true);
   assert.equal(router.root('alpha'),tmp,'Recovered worker must restore file access');
   assert.equal(router.resolve('reserved_id'),'alpha');
 }finally{release?.();await worker.stop();}

 // Heartbeat timeout must not resurrect a stopped controller.
 const c=new mw.MultiWindowController(0,token,tmp,async()=>({stop:async()=>{}}));
 c.ensurePrimary=()=>{};
 let registered,elected=0,continueRegistration;
 const began=new Promise(r=>registered=r);
 const registrationGate=new Promise(r=>continueRegistration=r);
 c.register=async()=>{registered();await registrationGate;throw Error('hub disconnected')};
 c.elect=async()=>{elected++};
 const heartbeat=c.heartbeat();
 c.heartbeatWork=heartbeat;
 await began;
 const stopping=c.stop(true);
 continueRegistration();
 await Promise.all([heartbeat,stopping]);
 assert.equal(elected,0,'Controller must never elect after stop begins');
 assert.equal(c.stopped,true);
 console.log('PASS: alias reservation blocks conflicting IDs; worker connectivity recovers; shutdown cannot trigger a late election');
})().catch(e=>{console.error(e);process.exitCode=1;})
.finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));