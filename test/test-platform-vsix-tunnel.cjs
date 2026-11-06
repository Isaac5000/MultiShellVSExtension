'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const yauzl=require('yauzl');
const root=path.resolve(__dirname,'..');
const {tunnelAsset,TUNNEL_VERSION}=require('../out/tunnel-release.js');
const target=process.platform+'-'+process.arch;
(async()=>{
 let asset;
 try{asset=tunnelAsset();}catch{
  console.log('SKIP platform tunnel package for unsupported OS');return;
 }
 const artifact=path.join(root,'multi-shell-mcp-server-'+
  require('../package.json').version+'-'+target+'.vsix');
 if(!fs.existsSync(artifact)){
  console.log('SKIP no '+target+' platform-specific VSIX built');return;
 }
 const prefix='extension/tunnel-client/v'+TUNNEL_VERSION+'/'+asset.platformTag+'/';
 const required=[
  prefix+asset.binary,
  prefix+(asset.platform==='win32'?'cloudflared.exe':'cloudflared'),
  prefix+'verified.json',
  prefix+'LICENSE',
  prefix+'NOTICE',
  prefix+'tunnel-client-v'+TUNNEL_VERSION+'-'+asset.platformTag+'-licenses.txt',
  prefix+'tunnel-client-v'+TUNNEL_VERSION+'-'+asset.platformTag+'.spdx.json',
  'extension/dist/extension.js',
  'extension/media/panel.js','extension/media/panel.css',
  'extension/docs/es/uso.md','extension/docs/en/usage.md',
  'extension/docs/es/instalacion.md','extension/docs/en/installation.md',
  'extension/docs/es/skills.md','extension/docs/en/skills.md',
  'extension/readme.md','extension/changelog.md'
 ];
 const seen=new Map();
 await new Promise((resolve,reject)=>{
  yauzl.open(artifact,{lazyEntries:true,autoClose:true},(error,zip)=>{
   if(error||!zip){reject(error||Error('Invalid VSIX'));return;}
   let stopped=false;
   const fail=e=>{if(stopped)return;stopped=true;zip.close();reject(e);};
   zip.on('error',fail);
   zip.on('entry',entry=>{
    if(stopped)return;
    const name=entry.fileName;
    if(!required.includes(name)){seen.set(name,'present');zip.readEntry();return;}
    zip.openReadStream(entry,(err,stream)=>{
     if(err||!stream){fail(err||Error('Missing zip stream'));return;}
     const chunks=[],digest=createHash('sha256');
     stream.on('error',fail);
     stream.on('data',chunk=>{
      digest.update(chunk);
      if(name.endsWith('/verified.json'))chunks.push(chunk);
     });
     stream.on('end',()=>{
      if(stopped)return;
      seen.set(name,name.endsWith('/verified.json')?
       Buffer.concat(chunks).toString('utf8'):digest.digest('hex'));
      zip.readEntry();
     });
    });
   });
   zip.on('end',()=>{stopped=true;resolve();});
   zip.readEntry();
  });
 });
 for(const name of required){
  assert.ok(seen.has(name),'Missing embedded file: '+name);
 }
 const meta=JSON.parse(seen.get(prefix+'verified.json'));
 const cloud=prefix+(asset.platform==='win32'?'cloudflared.exe':'cloudflared');
 assert.equal(meta.release,TUNNEL_VERSION);
 assert.equal(meta.archiveSha256,asset.sha256);
 assert.equal(meta.executableSha256,seen.get(prefix+asset.binary));
 assert.equal(meta.companionSha256,seen.get(cloud));
 assert.ok(!seen.has('extension/skills-lock.json'));
 assert.ok(![...seen.keys()].some(k=>k.startsWith('extension/.agents/')));
 const wrongArch=asset.platformTag.replace(/(?:amd64|arm64)$/,
  asset.arch==='x64'?'arm64':'amd64');
 assert.ok(![...seen.keys()].some(k=>k.includes('/'+wrongArch+'/')),
  'Platform-specific VSIX must not ship other architectures');
 console.log('PASS platform VSIX contains verified original native tunnel, Cloudflare companion, license evidence and one OS target; no private files');
})().catch(e=>{console.error(e);process.exitCode=1;});
