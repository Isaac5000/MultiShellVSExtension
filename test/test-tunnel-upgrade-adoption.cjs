'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {sameTunnelProcess}=require('../out/tunnel-process.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-upgrade-adopt-'));
const extensions=path.join(root,'extensions'),shared=path.join(root,'storage');
const oldRoot=path.join(extensions,'local-multishell.multi-shell-mcp-server-0.10.66');
const newRoot=path.join(extensions,'local-multishell.multi-shell-mcp-server-0.10.67');
const bogusRoot=path.join(extensions,'unrelated-extension-0.10.66');
const suffix=['tunnel-client','v0.0.19','windows-amd64','tunnel-client.exe'];
const previousExe=path.join(oldRoot,...suffix),currentExe=path.join(newRoot,...suffix);
const bogusExe=path.join(bogusRoot,...suffix);
for(const d of [oldRoot,newRoot,bogusRoot,shared])fs.mkdirSync(d,{recursive:true});
let allowOld=true,verifiedOldCalls=0;
const verification=async dir=>{
 if(dir===newRoot)return currentExe;
 if(dir===oldRoot){verifiedOldCalls++;return allowOld?previousExe:undefined;}
 if(dir===bogusRoot)return bogusExe;
 return undefined;
};
const identity=(pid,exe)=>({pid,started:'fixed-'+pid,executable:exe,commandHash:'same-profile-run'});
const release={TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://example.invalid',
 tunnelAsset:()=>({platformTag:'windows-amd64',binary:'tunnel-client.exe'}),
 verifiedExecutable:verification,installOfficialTunnel:async()=>{throw Error('unexpected download');},
 validateProfileName:x=>x,validateTunnelId:x=>x,execChecked:async()=>{}};
const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
 vscode:{},'./tunnel-release':release,
 './tunnel-process':{
  readTunnelProcessIdentity:async(pid,expectedExe)=>pid===process.pid?
   identity(pid,expectedExe):undefined,
  sameTunnelProcess
 }
});
const context={extensionUri:{fsPath:newRoot},globalStorageUri:{fsPath:shared},
 globalState:{get:(_k,def)=>def,update:async()=>{}},
 secrets:{get:async()=>undefined,store:async()=>{}}
};
const lock=path.join(shared,'tunnel-instance.lock');
const record={
 token:'legacy-test-owned',ownerPid:process.pid,childPid:process.pid,
 createdAt:Date.now(),profile:'vscode-local',endpointPort:3000,
 childIdentity:identity(process.pid,previousExe)
};
(async()=>{
 let manager;
 try{
  manager=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  fs.writeFileSync(lock,JSON.stringify(record));
  assert.equal(await manager.install(),previousExe,
   'A verified live child in the prior VSIX directory must retain its executable identity');
  assert.ok(verifiedOldCalls>0,'The prior VSIX native binary must be verified');
  assert.equal(await manager.adoptDetached(),true,
   'Upgrade must reattach a verified previous-version process without creating a new process');
  assert.equal((await manager.status()).owner,'adopted');
  manager.dispose(); manager=undefined;
  fs.writeFileSync(lock,JSON.stringify(record));

  manager=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  fs.writeFileSync(lock,JSON.stringify({...record,childIdentity:{...record.childIdentity,started:'stale'}}));
  assert.equal(await manager.install(),currentExe,
   'Never adopt a previous executable with an altered kernel start identity');

  fs.writeFileSync(lock,JSON.stringify({...record,
   childIdentity:identity(process.pid,bogusExe)}));
  assert.equal(await manager.install(),currentExe,
   'Never adopt a process from an unrelated extension directory');

  fs.writeFileSync(lock,JSON.stringify(record));
  allowOld=false;
  assert.equal(await manager.install(),currentExe,
   'Never adopt a previous-version binary that fails hash verification');

  allowOld=true;fs.rmSync(lock,{force:true});
  assert.equal(await manager.install(),currentExe,
   'Without an active owned child, prefer the current bundled executable');
  console.log('PASS upgrade adoption: prior-version verified VSIX child, safe identity recovery, hostile/stale rejection, fresh-launch precedence');
 }finally{
  manager?.dispose();
  fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
