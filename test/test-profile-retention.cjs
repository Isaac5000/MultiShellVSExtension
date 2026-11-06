'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pruneConnectionProfiles,safeRemoveTestProfile}=require('../scripts/test-profile-retention.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-retention-'));
const marker=(folder,text)=>{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'marker.txt'),text)};
const base=path.join(root,'connection-windows');
const old=path.join(base,'profiles-20261001000000000');
const active=path.join(base,'profiles-20261002000000000');
const young=path.join(base,'profiles-20261003000000000');
const failedOld=path.join(base,'profiles-20261004000000000');
const failedNew=path.join(base,'profiles-20261005000000000');
const outsider=path.join(root,'outside');
const oldInstaller=path.join(base,'installer-profile');
const oldFixedA=path.join(base,'profile-A');
const now=Date.now();
try{
 [old,active,young,failedOld,failedNew,oldInstaller,oldFixedA].forEach(p=>marker(p,'fixture'));
 marker(outsider,'do not touch');
 fs.writeFileSync(path.join(failedOld,'.test-failed'),'failed');
 fs.writeFileSync(path.join(failedNew,'.test-failed'),'failed');
 for(const p of [old,active,failedOld,failedNew,oldInstaller,oldFixedA]){
  fs.utimesSync(p,new Date(now-3600000),new Date(now-3600000));
 }
 fs.utimesSync(young,new Date(now),new Date(now));
 assert.equal(safeRemoveTestProfile(base,outsider,()=>false),false,'Outside root refused');
 assert.equal(safeRemoveTestProfile(base,old,()=>true),false,'Active profile refused');
 assert.equal(fs.existsSync(old),true);
 const dry=pruneConnectionProfiles(base,{now,isActive:p=>p===active,dryRun:true});
 assert.ok(dry.eligible>=2);
 assert.ok(dry.removed===0);
 assert.ok(fs.existsSync(old),'Dry run changed disk!');
 const result=pruneConnectionProfiles(base,{now,isActive:p=>p===active});
 assert.equal(result.errors.length,0);
 assert.equal(fs.existsSync(old),false,'Old clean profile must be removed');
 assert.equal(fs.existsSync(oldInstaller),false,'Obsolete installer profile must be removed');
 assert.equal(fs.existsSync(oldFixedA),false,'Obsolete fixed-window profile must be removed');
 assert.equal(fs.existsSync(active),true,'Active profile must survive');
 assert.equal(fs.existsSync(young),true,'Recently created profile must survive');
 assert.equal(fs.existsSync(failedOld),false,'Older failed profile must be pruned');
 assert.equal(fs.existsSync(failedNew),true,'Latest failed diagnostic survives');
 assert.equal(fs.existsSync(outsider),true,'Unrelated folder untouched');
 assert.equal(safeRemoveTestProfile(base,active,()=>false),true);
 assert.equal(fs.existsSync(active),false);
 let link;
 try{link=path.join(base,'profiles-20260101000000000');fs.symlinkSync(outsider,link,'junction');}
 catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;}
 if(link&&fs.existsSync(link)){
  assert.equal(safeRemoveTestProfile(base,link,()=>false),false,'Symlink not followed');
  assert.ok(fs.existsSync(outsider));
 }
 const guarded=pruneConnectionProfiles(base,{now,isActive:()=>{throw Error('process scan failed')}});
 assert.equal(guarded.removed,0,'Failed process discovery must fail closed');
 assert.ok(guarded.errors.length>=1);
 console.log('PASS: bounded historical profile retention, failed-run diagnostics, live process guard, fail-closed errors, dry-run and outside/symlink containment');
}finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:75});}
