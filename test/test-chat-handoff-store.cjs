'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ChatHandoffStore,defaultHandoffRoot}=require('../out/chat-handoff-store.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-chat-handoff-test-'));
const one={shellId:'main-project-a',workspace:path.resolve(root,'project-a'),
 machineId:'machine-a'};
const reload={...one,shellId:'restarted-window-new-shell'};
const otherMachine={...one,machineId:'machine-b'};
const otherProject={...one,workspace:path.resolve(root,'project-b')};
const checkpoint={objective:'Audit translation project',
 verification:'Unit tests and no wrong game strings',
 summary:'Inspected original files and gathered evidence',
 completed:['Ran targeted test suite', 'Verified localization constraints'],
 remaining:['Validate installer', 'Review output'],
 artifacts:['docs/report.md'],risks:['Audio requires manual review'],
 nextAction:'Read current changes, then run the verified tests',status:'working'};
try{
 const store=new ChatHandoffStore(path.join(root,'handoffs'));
 assert.equal(store.list(one).length,0);
 const first=store.save(one,checkpoint);
 assert.match(first.handoffId,/^[a-f0-9-]{36}$/);
 assert.equal(first.revision,1);
 assert.equal(store.get(reload,first.handoffId).objective,checkpoint.objective);
 assert.equal(store.get(otherProject),undefined);
 assert.equal(store.get(otherMachine),undefined);
 assert.throws(()=>store.get(otherMachine,first.handoffId),/another machine|workspace/i);
 assert.deepEqual(store.list(one).map(x=>x.handoffId),[first.handoffId]);
 assert.throws(()=>store.save(one,{...checkpoint,summary:'stale'},
  first.handoffId,0),/Stale/);
 const edited=store.save(reload,{...checkpoint,summary:'Added release notes'},
  first.handoffId,first.revision);
 assert.equal(edited.revision,2);
 assert.equal(store.get(one).summary,'Added release notes');
 assert.throws(()=>store.remove(one,first.handoffId,1),/Stale/);
 assert.throws(()=>store.save(otherMachine,checkpoint,first.handoffId,2),
  /scoped/);
 assert.throws(()=>store.save(one,{...checkpoint,summary:'Bearer abcdefghijklmno123'},
  first.handoffId,2),/credential/);
 assert.throws(()=>store.save(one,{...checkpoint,summary:'sk-1234567890ABCDEFghijklmnop'},
  first.handoffId,2),/credential/);
 assert.throws(()=>store.save(one,{...checkpoint,status:'claimed_complete'},
  first.handoffId,2),/evidence/);
 assert.throws(()=>store.save(one,{...checkpoint,summary:'x'.repeat(15000)},
  first.handoffId,2),/Invalid|oversized/);
 const lock=path.join(root,'handoffs',first.handoffId+'.json.lock');
 fs.writeFileSync(lock,'present');
 assert.throws(()=>store.save(one,checkpoint,first.handoffId,2),
  /write already in progress/);
 fs.unlinkSync(lock);
 const capacityLock=path.join(root,'handoffs','.capacity.lock');
 fs.writeFileSync(capacityLock,'simulated competing process');
 assert.throws(()=>store.save(one,checkpoint),/write already in progress/);
 fs.unlinkSync(capacityLock);
 assert.equal(store.get(one,first.handoffId).revision,2);
 const verified=store.save(one,{...checkpoint,status:'claimed_complete',
  verificationEvidence:'Synthetic check completed with exit code 0'},
  first.handoffId,2);
 assert.equal(verified.revision,3);
 assert.equal(verified.verificationEvidence,
  'Synthetic check completed with exit code 0');
 assert.throws(()=>store.save(one,checkpoint,'../../bad',1),/Invalid handoff/);
 store.remove(one,first.handoffId,verified.revision);
 assert.equal(store.get(one),undefined);
 assert.ok(defaultHandoffRoot().includes('chat-handoffs'));
 assert.equal(fs.readdirSync(path.join(root,'handoffs')).length,0);
 console.log('PASS chat handoff store: atomic revision, no secrets, project scoping, simulated reload, lock, explicit deletion');
}finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}