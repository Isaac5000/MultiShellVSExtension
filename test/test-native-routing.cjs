'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeShellManager {
 constructor(){this.items=new Map();}
 create(id,cwd){this.items.set(id,cwd);return{shell_id:id,initial_cwd:cwd,busy:false,queued:0};}
 list(){return [...this.items].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
 root(id){if(!this.items.has(id))throw Error('Unknown shell');return this.items.get(id);}
 close(id){this.items.delete(id);}
 dispose(){this.items.clear();}
}
const invoked=[];
const vscodeMock={};
const nativeMock={runNative:async(vscode,root,kind,args)=>{
 assert.equal(vscode,vscodeMock);invoked.push({root,kind,args});return {root,kind};
}};
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeShellManager},
 'vscode':vscodeMock,'./tools/native-window-tools':nativeMock});
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'native-route-'));
 const token='b'.repeat(64);
 const dirs=['first','second'].map(n=>{const p=path.join(tmp,n);fs.mkdirSync(p);return p;});
 const workers=dirs.map(d=>new mw.WindowWorker(new FakeShellManager(),token,d));
 const router=new mw.WindowRouter(token);
 try {
  await Promise.all(workers.map(w=>w.start()));
  for(let i=0;i<2;i++){
   router.register({window_id:workers[i].id,workspace:dirs[i],worker_port:workers[i].port});
   await router.reconcile(workers[i].id);
  }
  await router.create('alpha',dirs[0],false,workers[0].id);
  await router.create('beta',dirs[1],false,workers[1].id);
  await router.setAlias('beta','minecraft');
  const results=await Promise.all([router.native('alpha','diagnostics',{}),
                                  router.native('minecraft','symbols',{query:'thing'})]);
  assert.equal(results[0].root,dirs[0]);
  assert.equal(results[1].root,dirs[1]);
  assert.deepEqual(invoked.map(x=>x.kind),['diagnostics','symbols']);
  await assert.rejects(router.native('unknown','diagnostics',{}),/Unknown/);
  console.log('PASS: VSCode-native requests routed to owning window, aliases isolated');
 }finally{
  await Promise.all(workers.map(w=>w.stop()));
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
