'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class Manager{
  constructor(root){this.root=root;}
  list(){return ['alpha','beta'].map(shell_id=>({shell_id,initial_cwd:this.root,origin:'user',busy:false,queued:0}));}
}
const {WindowWorker,WindowRouter}=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:Manager}});
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-reconcile-rollback-'));
  const secret='b'.repeat(64);
  const changes=[];
  let failBeta=true;
  const manager=new Manager(root);
  const worker=new WindowWorker(manager,secret,root,async(id,alias)=>{
    if(failBeta && id==='beta')throw new Error('Simulated second alias persistence failure');
    changes.push([id,alias]);
  });
  worker.aliases.set('alpha','alpha');
  worker.aliases.set('beta','beta');
  await worker.start();
  const router=new WindowRouter(secret);
  try{
    router.register({window_id:worker.id,workspace:root,worker_port:worker.port});
    await assert.rejects(router.reconcile(worker.id),/second alias persistence failure/);
    assert.deepEqual([...router.assigned.keys()],[],
      'A failed later alias must not publish the earlier shell assignment');
    assert.deepEqual([...router.aliases.keys()],[],
      'A failed reconcile must not publish any partial alias');
    assert.equal(worker.aliases.get('alpha'),'alpha',
      'The first successful worker alias update must be rolled back');
    assert.deepEqual(changes,[['alpha','alpha'],['alpha','alpha']]);
    failBeta=false;
    await router.reconcile(worker.id);
    assert.equal(router.resolve('alpha'),'alpha');
    assert.equal(router.resolve('beta'),'beta');
    assert.equal(router.assigned.size,2);
    console.log('PASS: failed second alias leaves no partial router assignments, restores prior worker alias and permits clean retry');
  }finally{
    await worker.stop();
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
