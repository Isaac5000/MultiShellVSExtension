'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {
 TUNNEL_VERSION,TUNNEL_RELEASE_URL,OFFICIAL_SHA256,tunnelAsset,
 validateTunnelId,validateProfileName,verifiedExecutable,sha256
}=require('../out/tunnel-release.js');

assert.equal(TUNNEL_VERSION,'0.0.19');
assert.equal(TUNNEL_RELEASE_URL,'https://github.com/openai/tunnel-client/releases/tag/v0.0.19');
assert.equal(Object.keys(OFFICIAL_SHA256).length,6);
for(const platform of ['win32','linux','darwin']){
 for(const arch of ['x64','arm64']){
  const asset=tunnelAsset(platform,arch);
  assert.equal(asset.platform,platform);
  assert.equal(asset.sha256.length,64);
  assert.ok(asset.filename.endsWith((arch==='x64'?'amd64':'arm64')+'.zip'));
  assert.ok(asset.url.startsWith('https://github.com/openai/tunnel-client/releases/download/v0.0.19/'));
 }
}
assert.throws(()=>tunnelAsset('freebsd','x64'),/does not support/);
assert.equal(validateTunnelId(' tunnel_0123456789abcdef0123456789abcdef '),'tunnel_0123456789abcdef0123456789abcdef');
assert.equal(validateTunnelId('tunnel_abcd_0123456789abcdef0123456789abcdef'),'tunnel_abcd_0123456789abcdef0123456789abcdef');
for(const id of ['', 'X', 'tunnel_bad space', '--danger', 'tunnel_a;rm', 'tunnel_abc', 'tunnel_0123456789abcdef', 'tunnel_abcd_0123456789abcdef', 'tunnel_ABCD_0123456789abcdef0123456789abcdef']){
 assert.throws(()=>validateTunnelId(id),/Tunnel ID/);
}
assert.equal(validateProfileName('vscode-local'),'vscode-local');
for(const profile of ['../path',' spaced ','x/y','', 'a'.repeat(41)]){
 assert.throws(()=>validateProfileName(profile),/Profile/);
}
assert.equal(sha256(Buffer.from('abc')),
 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-verified-tunnel-'));
 const asset=tunnelAsset(process.platform,process.arch);
 const where=path.join(root,'tunnel-client','v0.0.19',asset.platformTag);
 const binary=path.join(where,asset.binary);
 const cloud=path.join(where,asset.platform==='win32'?'cloudflared.exe':'cloudflared');
 try{
  await fs.promises.mkdir(where,{recursive:true});
  await fs.promises.writeFile(binary,'fake executable bytes');
  await fs.promises.writeFile(cloud,'fake companion bytes');
  const hash=contents=>createHash('sha256').update(contents).digest('hex');
  const manifest={release:'0.0.19',filename:asset.filename,
   archiveSha256:asset.sha256,
   executableSha256:hash('fake executable bytes'),
   companionSha256:hash('fake companion bytes')};
  await fs.promises.writeFile(path.join(where,'verified.json'),JSON.stringify(manifest));
  assert.equal(await verifiedExecutable(root,asset),binary);
  await fs.promises.writeFile(cloud,'tampered');
  assert.equal(await verifiedExecutable(root,asset),undefined,
   'Tampered installed binaries must never be launched');
  await fs.promises.writeFile(cloud,'fake companion bytes');
  manifest.archiveSha256='0'.repeat(64);
  await fs.promises.writeFile(path.join(where,'verified.json'),JSON.stringify(manifest));
  assert.equal(await verifiedExecutable(root,asset),undefined);
  console.log('PASS: pinned official Tunnel Client v0.0.19 for six OS/arch combinations; URL/ID validation, SHA-256 integrity and tamper refusal');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});