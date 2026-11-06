'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const proxyquire=require('proxyquire').noCallThru();
const {sameTunnelProcess}=require('../out/tunnel-process.js');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-integrated-autostart-'));
const shared=path.join(root,'global'),embedded=path.join(root,'extension');
fs.mkdirSync(shared);fs.mkdirSync(embedded);
const legacyExe=path.join(shared,'tunnel-client','v0.0.19','windows-amd64','tunnel-client.exe');
const embeddedExe=path.join(embedded,'tunnel-client','v0.0.19','windows-amd64','tunnel-client.exe');
let embeddedValid=true,legacyValid=true;
let doctorExe,spawnExe;
const launched=[];
const identity=(pid,exe)=>({pid,started:'fixture-'+pid,executable:exe,commandHash:'command-'+pid});
const net={
 connect(){
  const socket=new EventEmitter();
  socket.setTimeout=()=>{};socket.destroy=()=>{};
  process.nextTick(()=>socket.emit('error',new Error('ECONNREFUSED')));
  return socket;
 }
};
const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
 vscode:{},net,
 './tunnel-release':{
  tunnelAsset:()=>({platformTag:'windows-amd64'}),
  TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://example.invalid',
  verifiedExecutable:async(folder)=>{
   if(folder===embedded){return embeddedValid?embeddedExe:undefined;}
   if(folder===shared){return legacyValid?legacyExe:undefined;}
   return undefined;
  },
  installOfficialTunnel:async()=>{throw Error('Should not download when a verified native executable exists');},
  validateProfileName:name=>name,validateTunnelId:id=>id,
  execChecked:async(exe,args)=>{
   if(args[0]==='doctor'){doctorExe=exe;return '';}
   throw Error('Unexpected CLI invocation '+args[0]);
  }
 },
 './tunnel-process':{
  readTunnelProcessIdentity:async(pid,exe)=>
   pid===process.pid?identity(pid,exe):undefined,
  sameTunnelProcess
 },
 './tunnel-profile':{
  inspectExistingProfile:async()=>({}),discoverExistingProfiles:async()=>[],
  syncManagedProfilePort:async()=>{}
 },
 child_process:{
  spawn:(exe)=>{
   spawnExe=exe;launched.push(exe);
   const child=new EventEmitter();
   child.pid=process.pid;
   child.exitCode=null;child.signalCode=null;
   child.killed=false;child.unref=()=>{};
   child.kill=()=>{child.killed=true;child.exitCode=0;child.emit('exit',0,null);};
   process.nextTick(()=>child.emit('spawn'));
   return child;
  }
 }
});
const states=new Map([['multiShellMcpTunnelAutoStart',true]]);
const context={
 extensionUri:{fsPath:embedded},globalStorageUri:{fsPath:shared},
 globalState:{get:(k,defaultValue)=>states.has(k)?states.get(k):defaultValue,
  update:async(k,v)=>states.set(k,v)},
 secrets:{get:async()=> 'synthetic-key',store:async()=>{}}
};
fs.mkdirSync(path.join(shared,'tunnel-profiles'));
fs.writeFileSync(path.join(shared,'tunnel-profiles','vscode-local.yaml'),'synthetic-fixture');
const lockFile=path.join(shared,'tunnel-instance.lock');
const oldFetch=global.fetch;
global.fetch=async()=>new Response('{}',{status:200});

(async()=>{
 const active=[];
 try{
  // Case 1: Both copies exist, no live legacy process. Auto-start MUST choose
  // the integrated binary; the abandoned globalStorage copy is not preferred.
  const manager=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  active.push(manager);
  assert.equal(await manager.install(),embeddedExe,
   'An idle globalStorage copy must not override the integrated binary');
  await manager.startIfEnabled();
  assert.deepEqual(launched,[embeddedExe],
   'Automatic startup must launch the verified integrated tunnel');
  assert.equal(doctorExe,embeddedExe,
   'Automatic startup must verify the same integrated executable it spawns');
  manager.dispose();
  fs.rmSync(lockFile,{force:true});

  // Case 2: A verified running legacy tunnel from an earlier host is
  // fingerprinted in the ownership lock. Keep its executable identity so the
  // new host can safely adopt it rather than launch a duplicate.
  const validRecord={token:'fixture-lock',ownerPid:process.pid,
   createdAt:Date.now(),profile:'vscode-local',endpointPort:3000,
   childPid:process.pid,childIdentity:identity(process.pid,legacyExe)};
  fs.writeFileSync(lockFile,JSON.stringify(validRecord));
  const adoption=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  active.push(adoption);
  assert.equal(await adoption.install(),legacyExe,
   'Preserve verified running legacy child identity during reload');

  // Case 3: Merely having a lock file is insufficient for legacy selection.
  fs.writeFileSync(lockFile,JSON.stringify({...validRecord,childIdentity:{
   ...validRecord.childIdentity,started:'recycled-pid'}}));
  assert.equal(await adoption.install(),embeddedExe,
   'Forged/stale legacy identity must not affect new starts');

  // Case 4: A process that no longer exists must not keep the legacy path.
  fs.writeFileSync(lockFile,JSON.stringify({...validRecord,
   childPid:2147483646,childIdentity:identity(2147483646,legacyExe)}));
  assert.equal(await adoption.install(),embeddedExe,
   'Dead legacy process must not keep selection locked to old binaries');

  // Case 5: The current VSIX requires its bundled binary. No new
  // process may start from a leftover globalStorage copy if it is missing.
  embeddedValid=false;
  fs.rmSync(lockFile,{force:true});
  await assert.rejects(adoption.install(),/integrated|bundled|VSIX/i,
   'Missing native VSIX tunnel must never use legacy files for a new start');
  embeddedValid=true;

  // Case 6: Old executable becomes unusable, but embedded remains verified.
  legacyValid=false;
  assert.equal(await adoption.install(),embeddedExe,
   'A verified embedded copy must not depend on an invalid old copy');
  console.log('PASS integrated autostart: embedded-first; verified live legacy adoption; stale lock rejection; no idle fallback');
 }finally{
  for(const manager of active){manager.dispose();}
  global.fetch=oldFetch;
  fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
