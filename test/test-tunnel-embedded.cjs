'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const proxyquire=require('proxyquire').noCallThru();
const tunnel=require('../out/tunnel-release.js');
assert.equal(typeof tunnel.installOfficialTunnel,'undefined',
 'Runtime tunnel downloader must not be bundled into native-only builds');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-platform-tunnel-'));
 const embedded=path.join(root,'extension');
 const shared=path.join(root,'global');
 fs.mkdirSync(embedded);fs.mkdirSync(shared);
 const asset=tunnel.tunnelAsset();
 const expectedRoot=path.join(embedded,'tunnel-client',
  'v'+tunnel.TUNNEL_VERSION,asset.platformTag);
 const filename=asset.binary;
 const cloud=process.platform==='win32'?'cloudflared.exe':'cloudflared';
 const data=Buffer.from('verified-official-tunnel-fixture');
 const companion=Buffer.from('verified-cloudflared-fixture');
 const digest=data=>createHash('sha256').update(data).digest('hex');
 const manifest={release:tunnel.TUNNEL_VERSION,
  filename:asset.filename,archiveSha256:asset.sha256,
  executableSha256:digest(data),companionSha256:digest(companion)};
 fs.mkdirSync(expectedRoot,{recursive:true});
 fs.writeFileSync(path.join(expectedRoot,filename),data);
 fs.writeFileSync(path.join(expectedRoot,cloud),companion);
 fs.writeFileSync(path.join(expectedRoot,'verified.json'),JSON.stringify(manifest));
 let downloads=0;
 const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
  vscode:{},
  './tunnel-release':{
   ...tunnel,
   installOfficialTunnel:async()=>{downloads++;return 'downloaded-tunnel';}
  }
 });
 const notifications=[];
 const context={extensionUri:{fsPath:embedded},globalStorageUri:{fsPath:shared},
  globalState:{get:(_key,value)=>value,async update(){}},
  secrets:{async get(){return undefined;},async store(){}}
 };
 const manager=new TunnelManager(context,()=>3000,async()=>false,
  message=>notifications.push(message));
 try{
  const found=await manager.install();
  assert.equal(found,path.join(expectedRoot,filename));
  assert.equal(downloads,0,'Embedded tunnel should not download or duplicate binaries');
  assert.equal(await tunnel.verifiedExecutable(shared,asset),undefined,
   'Embedded tunnel must not create a second global storage installation');
  fs.writeFileSync(path.join(expectedRoot,cloud),'TAMPERED');
  await assert.rejects(manager.install(),/integrated|bundled|VSIX/i,
   'A tampered integrated binary must fail closed, never download or start legacy files');
  assert.equal(downloads,0,'Never download a runtime tunnel after VSIX integrity failure');
  // A leftover globalStorage copy must never override a verified embedded
  // binary for a fresh start. The separate autostart selection test verifies
  // the narrowly scoped exception for an attested, still-running old child.
  const oldRoot=path.join(shared,'tunnel-client','v'+tunnel.TUNNEL_VERSION,
   asset.platformTag);
  fs.mkdirSync(oldRoot,{recursive:true});
  fs.writeFileSync(path.join(oldRoot,filename),data);
  fs.writeFileSync(path.join(oldRoot,cloud),companion);
  fs.writeFileSync(path.join(oldRoot,'verified.json'),JSON.stringify(manifest));
  await assert.rejects(manager.install(),/integrated|bundled|VSIX/i,
   'A verified idle globalStorage copy must not rescue a broken bundled binary');
  assert.equal(downloads,0);
  fs.writeFileSync(path.join(expectedRoot,cloud),companion);
  assert.equal(await manager.install(),path.join(expectedRoot,filename),
   'Restoring verified integrated binaries must restore normal operation');
  assert.equal(downloads,0);
  assert.ok(notifications.some(msg=>msg.includes('verified')));
  console.log('PASS embedded tunnel: no runtime download; fail closed on tamper and legacy; safe repair');
 }finally{
  manager.dispose();
  fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});