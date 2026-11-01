'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class FakeManager{
  constructor(id,root){this.id=id;this.root=root;}
  list(){return [{shell_id:this.id,initial_cwd:this.root,busy:false,queued:0}];}
}
const {WindowWorker,WindowRouter}=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager:FakeManager}
});
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-alias-rollback-'));
  const token='a'.repeat(64);
  const writes=[];
  const worker=new WindowWorker(new FakeManager('alpha',root),token,root,async(id,alias)=>{
    if(alias==='badalias')throw new Error('Storage unavailable');
    if(alias==='slowalias')await wait(120);
    writes.push(alias);
  });
  await worker.start();
  const router=new WindowRouter(token);
  try{
    router.register({window_id:worker.id,workspace:worker.workspace,worker_port:worker.port});
    await router.reconcile(worker.id);
    const initial=router.resolve('alpha');
    assert.equal(initial,'alpha');
    const oldWorker=worker.aliases.get('alpha');
    await assert.rejects(router.setAlias('alpha','badalias'),/Storage unavailable/);
    assert.equal(router.resolve('alpha'),'alpha','Router should retain prior alias');
    assert.equal(worker.aliases.get('alpha'),oldWorker,'Worker must not publish an unsaved alias');
    assert.throws(()=>router.resolve('badalias'),/Unknown/);

    const first=router.setAlias('alpha','slowalias');
    await wait(20);
    await assert.rejects(router.setAlias('alpha','racingalias'),/already in progress/);
    assert.equal((await first).alias,'slowalias');
    assert.equal(router.resolve('slowalias'),'alpha');
    assert.equal(worker.aliases.get('alpha'),'slowalias');
    assert.equal(writes.includes('racingalias'),false);
    assert.equal((await router.setAlias('alpha','finalalias')).alias,'finalalias',
      'Shell must be released after a successful rename');
    assert.equal(router.resolve('finalalias'),'alpha');
    console.log('PASS: failed persistence rolls back alias and concurrent renames of one shell cannot overtake each other');
  }finally{
    await worker.stop();
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
