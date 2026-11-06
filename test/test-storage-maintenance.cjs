'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {pruneLegacyBackups}=require('../scripts/storage-maintenance.cjs');
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ms-legacy-clean-'));
const root=path.join(parent,'v0.0.19');
fs.mkdirSync(root);
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const make=(name,extras=[])=>{
 const dir=path.join(root,name);fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'tunnel-client.exe'),'test-tunnel');
 fs.writeFileSync(path.join(dir,'cloudflared.exe'),'test-cloud');
 fs.writeFileSync(path.join(dir,'verified.json'),JSON.stringify({
  release:'0.0.19',archiveSha256:'f'.repeat(64),
  executableSha256:sha('test-tunnel'),companionSha256:sha('test-cloud')
 }));
 for(const [file,data] of extras){fs.writeFileSync(path.join(dir,file),data);}
 fs.utimesSync(dir,new Date(Date.now()-3600000),new Date(Date.now()-3600000));
 return dir;
};
try{
 const obsolete=make('windows-amd64.legacy-backup-20260101-010101');
 const active=make('windows-amd64.legacy-backup-20260102-010101');
 const custom=make('windows-amd64.legacy-backup-20260103-010101',[['credentials.txt','SHOULD_REMAIN']]);
 const now=Date.now();
 const inspect=p=>p===active;
 const dry=pruneLegacyBackups(root,{now,isInUse:inspect,dryRun:true});
 assert.equal(dry.removed,0);
 assert.equal(dry.eligible,1);
 assert.equal(fs.existsSync(obsolete),true);
 const performed=pruneLegacyBackups(root,{now,isInUse:inspect});
 assert.equal(performed.removed,1);
 assert.equal(fs.existsSync(obsolete),false);
 assert.equal(fs.existsSync(active),true);
 assert.equal(fs.existsSync(custom),true);
 assert.equal(performed.skippedUnsafe,1);
 assert.equal(pruneLegacyBackups(root,{now,isInUse:()=>{throw Error('unknown')}}).removed,0);
 assert.ok(fs.existsSync(active));
 console.log('PASS: safe known-backup-only cleanup, manifest/hash verification, no active binaries, protected unknown files, dry-run and fail-closed process inspection');
}finally{fs.rmSync(parent,{recursive:true,force:true});}
