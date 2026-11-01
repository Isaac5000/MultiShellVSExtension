'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeManager{
  constructor(ids,root){this.ids=ids;this.root=root;}
  list(){return this.ids.map(id=>({
    shell_id:id,initial_cwd:this.root,origin:'mcp',busy:false,queued:0
  }));}
}
const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeManager}});
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-reconcile-'));
  const a=path.join(dir,'a'),b=path.join(dir,'b');
  fs.mkdirSync(a);fs.mkdirSync(b);
  const token='9'.repeat(64);
  const managerA=new FakeManager(['alpha'],a);
  const managerB=new FakeManager(['beta','alpha'],b);
  const wa=new mw.WindowWorker(managerA,token,a);
  const wb=new mw.WindowWorker(managerB,token,b);
  await Promise.all([wa.start(),wb.start()]);
  const router=new mw.WindowRouter(token);
  try{
    for(const w of [wa,wb]){
      router.register({window_id:w.id,workspace:w.workspace,worker_port:w.port});
    }
    await router.reconcile(wa.id);
    await assert.rejects(router.reconcile(wb.id),/Conflicting shell ID/);
    assert.throws(()=>router.resolve('beta'),/Unknown shell_id/,
      'A bad late entry must not install any earlier shell from the rejected snapshot');
    assert.equal(router.resolve('alpha'),'alpha');
    managerB.ids=['beta','beta'];
    await assert.rejects(router.reconcile(wb.id),/duplicate shell ID/i);
    assert.throws(()=>router.resolve('beta'),/Unknown shell_id/);
    managerB.ids=['beta'];
    await router.reconcile(wb.id);
    assert.equal(router.resolve('beta'),'beta');
    assert.equal(router.windows().length,2);
    console.log('PASS: conflicting/duplicate worker snapshots do not partially mutate hub routing; valid recovery still works');
  }finally{
    await Promise.all([wa.stop(),wb.stop()]);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
