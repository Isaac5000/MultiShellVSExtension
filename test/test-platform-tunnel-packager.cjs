'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const yazl=require('yazl');
const {createHash}=require('node:crypto');
const {targets,options,sourceAsset,stageOfficialTunnel}=
 require('../scripts/package-platform-tunnel.cjs');
const {TUNNEL_VERSION,verifiedExecutable}=require('../out/tunnel-release.js');
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function makeArchive(root,asset,extra=false){
 const z=new yazl.ZipFile();
 const target=path.join(root,'fixture.zip');
 const stream=fs.createWriteStream(target,{flags:'wx'});
 const exe=asset.binary,cloud=asset.platform==='win32'?'cloudflared.exe':'cloudflared';
 z.addBuffer(Buffer.from('offline tunnel fixture'),exe);
 z.addBuffer(Buffer.from('offline Cloudflare companion'),cloud);
 z.addBuffer(Buffer.from('{}'),'cloudflared-manifest.json');
 if(extra)z.addBuffer(Buffer.from('bad'),'.secrets');
 const done=new Promise((resolve,reject)=>{
  z.outputStream.pipe(stream);
  stream.once('finish',resolve);stream.once('error',reject);
  z.outputStream.once('error',reject);
 });
 z.end();await done;
 return target;
}
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ms-platform-pack-test-'));
 try{
  assert.equal(targets.length,6);
  assert.equal(options(['--target=linux-arm64']).target,'linux-arm64');
  assert.throws(()=>options(['--target=web']),/Unsupported tunnel platform/);
  assert.throws(()=>options(['--target=win32-ia32']),/Unsupported tunnel platform/);
  for(const target of targets){
   const asset=sourceAsset(target);
   assert.equal(asset.sha256.length,64);
  }
  const asset=sourceAsset(process.platform+'-'+process.arch);
  const archive=await makeArchive(temp,asset);
  const fakeAsset={...asset,sha256:sha(fs.readFileSync(archive))};
  const dest=path.join(temp,'extension','tunnel-client','v'+TUNNEL_VERSION,asset.platformTag);
  const marker=await stageOfficialTunnel({
   archive,destination:dest,asset:fakeAsset,checkVersion:false
  });
  assert.equal(marker.archiveSha256,fakeAsset.sha256);
  assert.equal(await verifiedExecutable(path.join(temp,'extension'),fakeAsset),
   path.join(dest,asset.binary));
  fs.writeFileSync(path.join(dest,asset.binary),'tampered');
  assert.equal(await verifiedExecutable(path.join(temp,'extension'),fakeAsset),undefined);
  await assert.rejects(stageOfficialTunnel({
   archive,destination:path.join(temp,'other'),asset,checkVersion:false
  }),/SHA-256 mismatch/,'Must reject a ZIP not matching the pinned release hash');
  // The staging builder must never try to install the wrong platform or
  // execute non-native binaries during packaging.
  assert.equal(sourceAsset('darwin-arm64').platform,'darwin');
  assert.equal(sourceAsset('linux-x64').arch,'x64');
  console.log('PASS portable VSIX packaging: six platform mappings, validated official digest, no fake archive acceptance, embedded lookup');
 }finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
