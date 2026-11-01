'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

class FakeShellManager {
 constructor(){this.items=new Map();}
 create(id,cwd){this.items.set(id,cwd);return {shell_id:id,initial_cwd:cwd,origin:'mcp',busy:true,queued:0};}
 list(){return [...this.items].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,origin:'mcp',busy:true,queued:0}));}
 root(id){if(!this.items.has(id))throw Error('Unknown shell');return this.items.get(id);}
 execute(){throw Error('Isolated commands must not use the integrated terminal');}
 close(id){this.items.delete(id);}
 dispose(){this.items.clear();}
}
const calls=[];
const isolatedMock={runIsolatedCommand:async(id,cwd,command,timeout,signal)=>{
 calls.push({id,cwd,command,timeout,signal});
 return {shell_id:id,command,output:'isolated:'+path.basename(cwd),exit_code:0,truncated:false};
}};
const mw=proxyquire('../out/multi-window.js',{
 './shell-manager':{ShellManager:FakeShellManager},
 './tools/isolated-command':isolatedMock,
 'vscode':{}
});
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'isolated-route-'));
 const token='c'.repeat(64);
 const dirs=['first','second'].map(name=>{const dir=path.join(tmp,name);fs.mkdirSync(dir);return dir;});
 const workers=dirs.map(dir=>new mw.WindowWorker(new FakeShellManager(),token,dir));
 const router=new mw.WindowRouter(token);
 try{
  await Promise.all(workers.map(worker=>worker.start()));
  for(let i=0;i<workers.length;i++){
   router.register({window_id:workers[i].id,workspace:dirs[i],worker_port:workers[i].port});
   await router.reconcile(workers[i].id);
  }
  await router.create('first_shell',dirs[0],false,workers[0].id);
  await router.create('second_shell',dirs[1],false,workers[1].id);
  await router.setAlias('second_shell','isolated');
  const results=await Promise.all([
   router.executeIsolated('first_shell','git diff --check',9000),
   router.executeIsolated('isolated','npm run build',8500)
  ]);
  assert.deepEqual(calls.map(x=>[x.id,x.cwd,x.command,x.timeout]),[
   ['first_shell',dirs[0],'git diff --check',9000],
   ['second_shell',dirs[1],'npm run build',8500]
  ]);
  assert.equal(results[0].output,'isolated:first');
  assert.equal(results[1].output,'isolated:second');
  await assert.rejects(router.executeIsolated('nonexistent','git status',5000),/Unknown/);
  console.log('PASS: isolated commands route to owning window and cwd, resolve aliases and never use busy integrated shells');
 }finally{await Promise.all(workers.map(worker=>worker.stop()));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
