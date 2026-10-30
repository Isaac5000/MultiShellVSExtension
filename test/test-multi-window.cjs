const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const proxyquire = require('proxyquire').noCallThru();

const delay = ms => new Promise(r=>setTimeout(r,ms));
class FakeShellManager {
  constructor(){this.shells=new Map();this.running=0;this.peak=0;}
  create(id,cwd,allow=false){
    if(this.shells.has(id))throw new Error('duplicate');
    this.shells.set(id,{id,cwd});
    return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};
  }
  list(){return [...this.shells.values()].map(s=>({shell_id:s.id,initial_cwd:s.cwd,busy:false,queued:0}));}
  close(id){if(!this.shells.delete(id))throw new Error('unknown');}
  async execute(id,command) {
    if(!this.shells.has(id))throw new Error('unknown id');
    this.running++;this.peak=Math.max(this.peak,this.running);
    await delay(175);
    this.running--;
    return {shell_id:id,command,output:'('+id+') '+command,exit_code:0,truncated:false};
  }
  dispose(){this.shells.clear();}
}
const multi=proxyquire('../out/multi-window.js', {'./shell-manager':{ShellManager: FakeShellManager}});
const test=async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'multi-window-test-'));
 const token='e'.repeat(64);
 const rootA=path.join(base,'A'),rootB=path.join(base,'B');fs.mkdirSync(rootA);fs.mkdirSync(rootB);
 const a=new multi.WindowWorker(new FakeShellManager(),token,rootA);
 const b=new multi.WindowWorker(new FakeShellManager(),token,rootB);
 await Promise.all([a.start(),b.start()]);
 const router=new multi.WindowRouter(token);
 try {
   assert.notEqual(a.port,b.port);
   router.register({window_id:a.id,workspace:rootA,worker_port:a.port});
   router.register({window_id:b.id,workspace:rootB,worker_port:b.port});
   assert.equal(router.windows().length,2);
   await assert.rejects(router.create('onlyone'),/Several windows/);
   const shellA=await router.create('alpha',rootA,false,a.id);
   const shellB=await router.create('beta',rootB,false,b.id);
   assert.equal(shellA.window_id,a.id);
   assert.equal(shellB.window_id,b.id);
   await assert.rejects(router.create('alpha',rootB,false,b.id),/already exists/);
   const started=Date.now();
   const [ra,rb]=await Promise.all([router.execute('alpha','echo A'),router.execute('beta','echo B')]);
   assert.match(ra.output,/alpha.*echo A/);
   assert.match(rb.output,/beta.*echo B/);
   assert.ok(Date.now()-started<340,'parallel routed commands should overlap');
   assert.deepEqual((await router.list()).map(x=>x.shell_id).sort(),['alpha','beta']);
   const relative=await router.create('relative','nested',false,a.id);
   assert.equal(relative.initial_cwd,path.resolve(rootA,'nested'),'relative directory must be based on owner workspace');
   await router.close('relative');
   a.shells.close('alpha'); // Simulates manually closing a VSCode terminal.
   await router.close('alpha');
   assert.throws(()=>router.resolve('alpha'),/Unknown/);
   assert.equal(a.aliases.has('alpha'),false,'manual-close alias must be removed');
   await router.close('beta');
   await assert.rejects(router.execute('beta','echo C'),/Unknown shell_id/);
   console.log('PASS: two worker ports; window routing; unique shell IDs; parallel commands; no cross-window command mixing');
 }finally {
   await Promise.all([a.stop(),b.stop()]);
   fs.rmSync(base,{recursive:true,force:true});
 }
};
test().catch(e=>{console.error(e);process.exitCode=1;});
