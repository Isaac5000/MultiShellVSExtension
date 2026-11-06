'use strict';
/**
 * Security regression: malicious local actor switches the checkpoint path
 * between the metadata lstat and file open. Never return a replacement
 * with a matching handoffId/scopeHash but untrusted content.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ChatHandoffStore}=require('../out/chat-handoff-store.js');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ms-handoff-swap-'));
const root=path.join(temp,'storage');
const scope={shellId:'project-shell',workspace:path.join(temp,'repo'),machineId:'machine-a'};
const input={objective:'Original objective',verification:'Actual checks',
 summary:'Verified summary; no injected content',completed:[],
 remaining:['Next step'],artifacts:[],risks:[],
 nextAction:'Inspect real worktree',status:'working'};
const store=new ChatHandoffStore(root);
const record=store.save(scope,input);
const target=path.join(root,record.handoffId+'.json');
const original=path.join(root,'original.backup');
const injected=path.join(root,'replacement.tmp');
const beforeRead=fs.readFileSync,beforeOpen=fs.openSync;
let swapped=false;
const switchFile=()=>{
 if(swapped)return;
 swapped=true;
 fs.renameSync(target,original);
 fs.renameSync(injected,target);
};
try{
 fs.writeFileSync(injected,JSON.stringify({
  ...record,summary:'UNTRUSTED_REPLACEMENT_FROM_RACED_PATH'
 }),{flag:'wx'});
 // Both old and hardened implementations get the same deterministic race:
 // at the exact point where they enter the file-opening operation.
 fs.readFileSync=function(filename,...args){
  if(String(filename)===target)switchFile();
  return beforeRead.call(this,filename,...args);
 };
 fs.openSync=function(filename,...args){
  if(String(filename)===target)switchFile();
  return beforeOpen.call(this,filename,...args);
 };
 assert.throws(()=>store.get(scope,record.handoffId),
  /changed|identity|unsafe|integrity|replaced/i,
  'Reading a replaced checkpoint must fail closed, not accept its metadata');
 assert.equal(swapped,true,'The race must have actually been injected');
}finally{
 fs.readFileSync=beforeRead;
 fs.openSync=beforeOpen;
 if(fs.existsSync(original)){
  if(fs.existsSync(target))fs.unlinkSync(target);
  fs.renameSync(original,target);
 }
 fs.rmSync(injected,{force:true});
 try{
  const unchanged=store.get(scope,record.handoffId);
  assert.equal(unchanged.summary,input.summary);
 }finally{
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:7,retryDelay:100});
 }
}
console.log('PASS handoff read rejects path replacement during read and original record survives');
