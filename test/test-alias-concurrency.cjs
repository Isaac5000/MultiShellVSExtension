'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class FakeManager{
  constructor(){this.items=new Map();}
  create(id,cwd){
    const item={shell_id:id,initial_cwd:cwd,origin:'user',busy:false,queued:0};
    this.items.set(id,item);
    return item;
  }
  list(){return [...this.items.values()];}
  dispose(){this.items.clear();}
}
const {WindowWorker,WindowRouter}=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager:FakeManager}
});
async function main(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-alias-race-'));
  const a=path.join(base,'a'),b=path.join(base,'b');
  fs.mkdirSync(a);fs.mkdirSync(b);
  const token='c'.repeat(64);
  const persisted=[];
  function worker(dir,id){
    const shells=new FakeManager();
    shells.create(id,dir);
    const changed=async(shell,alias)=>{
      if(alias==='shared')await wait(70);
      persisted.push({shell,alias});
    };
    return new WindowWorker(shells,token,dir,changed);
  }
  const wa=worker(a,'alpha'),wb=worker(b,'beta');
  await Promise.all([wa.start(),wb.start()]);
  const router=new WindowRouter(token);
  try{
    for(const w of [wa,wb]){
      router.register({window_id:w.id,workspace:w.workspace,worker_port:w.port});
      await router.reconcile(w.id);
    }
    const outcomes=await Promise.allSettled([
      router.setAlias('alpha','shared'),
      router.setAlias('beta','shared')
    ]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
    assert.equal(persisted.filter(x=>x.alias==='shared').length,1,
      'Only the owner of the reserved alias can persist the update');
    assert.ok(['alpha','beta'].includes(router.resolve('shared')));
    console.log('PASS: simultaneous shell aliases remain globally unique and changes reach the persistence callback');
  }finally{
    await Promise.all([wa.stop(),wb.stop()]);
    fs.rmSync(base,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
