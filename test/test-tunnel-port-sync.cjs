'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspectExistingProfile,syncManagedProfilePort}=require('../out/tunnel-profile.js');
const yaml=require('yaml');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ms-port-sync-'));
 const profile=path.join(dir,'vscode-local.yaml');
 const content=['control_plane:','  base_url: "https://api.openai.com"',
   '  tunnel_id: "tunnel_0123456789abcdef0123456789abcdef"',
   '  api_key: "env:CONTROL_PLANE_API_KEY"','health:',
   '  listen_addr: "127.0.0.1:8080"','mcp:',
   '  server_urls:','    - channel: main',
   '      url: "http://127.0.0.1:3000/mcp"','# keep me'].join('\n')+'\n';
 try{
   fs.writeFileSync(profile,content,{mode:0o600});
   assert.equal(await syncManagedProfilePort(profile,3000,3000),false);
   assert.equal(fs.readFileSync(profile,'utf8'),content);
   assert.equal(await syncManagedProfilePort(profile,3000,4201),true);
   await inspectExistingProfile(profile,4201);
   const parsed=yaml.parse(fs.readFileSync(profile,'utf8'));
   assert.equal(parsed.mcp.server_urls[0].channel,'main');
   assert.equal(parsed.control_plane.tunnel_id,'tunnel_0123456789abcdef0123456789abcdef');
   assert.ok(fs.readFileSync(profile,'utf8').includes('# keep me'));
   await assert.rejects(syncManagedProfilePort(profile,3000,4202),
     /does not exclusively target/);
   await inspectExistingProfile(profile,4201);
   assert.equal(fs.readdirSync(dir).length,1,'Temporary files must be removed');
   const outside=path.join(dir,'outside.yaml');
   fs.writeFileSync(outside,content);
   const link=path.join(dir,'linked.yaml');
   try{
     fs.symlinkSync(outside,link);
     await assert.rejects(syncManagedProfilePort(link,3000,4201),/regular YAML/);
   }catch(error){if(error.code!=='EPERM'&&error.code!=='EACCES')throw error;}
   console.log('PASS: managed profile updates port atomically, preserves other YAML fields and comments, rejects stale targets and symlinks');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
