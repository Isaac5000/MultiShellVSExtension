'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const yazl=require('yazl');
const {extractTunnelZip}=require('../out/tunnel-archive.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-zip-guard-'));
const make=async(entries,name)=>{
 const filename=path.join(root,name);
 await new Promise((resolve,reject)=>{
  const z=new yazl.ZipFile();
  const out=fs.createWriteStream(filename,{flags:'wx'});
  z.outputStream.pipe(out);
  out.once('finish',resolve);out.once('error',reject);z.outputStream.once('error',reject);
  for(const e of entries){z.addBuffer(Buffer.from(e.data),e.name);}
  z.end();
 });
 return filename;
};
(async()=>{
 try{
  const suffix='windows-amd64',exe='tunnel-client.exe',cloud='cloudflared.exe';
  const good=await make([
   {name:exe,data:'valid exe'},
   {name:cloud,data:'valid cloud'},
   {name:'cloudflared-manifest.json',data:'{}'}
  ],'good.zip');
  const target=path.join(root,'good');
  fs.mkdirSync(target);
  await extractTunnelZip(good,target,suffix,exe,cloud);
  assert.equal(fs.readFileSync(path.join(target,exe),'utf8'),'valid exe');
  assert.equal(fs.readFileSync(path.join(target,cloud),'utf8'),'valid cloud');
  const malicious=await make([
   {name:exe,data:'valid exe'},
   {name:cloud,data:'valid cloud'},
   {name:'unexpected-token.txt',data:'secret'}
  ],'bad.zip');
  const other=path.join(root,'bad');fs.mkdirSync(other);
  await assert.rejects(extractTunnelZip(malicious,other,suffix,exe,cloud),/Unsafe or unexpected ZIP/);
  assert.equal(fs.existsSync(path.join(other,'unexpected-token.txt')),false);
  console.log('PASS: streaming ZIP extraction without OS tar/unzip; only allowlisted files extracted, unexpected files denied');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
