'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {existingProfileDirectories,inspectExistingProfile,discoverExistingProfiles}
 =require('../out/tunnel-profile.js');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-tunnel-profiles-'));
 const appdata=path.join(root,'AppData','Roaming');
 const xdg=path.join(root,'.config-custom');
 try{
  const windows=existingProfileDirectories('win32',{APPDATA:appdata},root);
  assert.ok(windows.includes(path.join(appdata,'tunnel-client')));
  const linux=existingProfileDirectories('linux',{XDG_CONFIG_HOME:xdg},root);
  assert.ok(linux.includes(path.join(xdg,'tunnel-client')));
  const mac=existingProfileDirectories('darwin',{},root);
  assert.ok(mac.includes(path.join(root,'Library','Application Support','tunnel-client')));
  for(const dir of [path.join(appdata,'tunnel-client'),path.join(xdg,'tunnel-client')]){
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(dir,'vscode-local.yaml'),[
    'control_plane:','  base_url: "https://api.openai.com"','  tunnel_id: "tunnel_0123456789abcdef0123456789abcdef"',
    '  api_key: "env:CONTROL_PLANE_API_KEY"',
    'health:', '  listen_addr: "127.0.0.1:8080"',
    'mcp:','  server_urls:', '    - channel: main',
    '      url: "http://127.0.0.1:3000/mcp"'
   ].join('\n'));
   fs.writeFileSync(path.join(dir,'wrong-port.yaml'),
    'mcp:\n  server_urls:\n    - url: "http://127.0.0.1:4000/mcp"');
  }
  const found=await discoverExistingProfiles(3000,'win32',{APPDATA:appdata},root);
  assert.equal(found.length,1);
  assert.equal(found[0].name,'vscode-local');
  const same=await inspectExistingProfile(found[0].file,3000);
  assert.equal(same.file,found[0].file);
  await assert.rejects(inspectExistingProfile(
   path.join(appdata,'tunnel-client','wrong-port.yaml'),3000),/does not exclusively target/);
  const linuxFound=await discoverExistingProfiles(3000,'linux',{XDG_CONFIG_HOME:xdg},root);
  assert.equal(linuxFound.length,1);
  assert.ok(linuxFound[0].file.startsWith(xdg));
  // No arbitrary scripts or malicious URL targets.
  fs.writeFileSync(path.join(appdata,'tunnel-client','remote.yaml'),
   'mcp:\n  server_urls:\n    - url: "https://attacker.example/mcp"');
  fs.writeFileSync(path.join(appdata,'tunnel-client','bad.yaml'),
   'mcp:\n  server_urls:\n    - url: "http://127.0.0.1:3000/mcp#other"');
  assert.equal((await discoverExistingProfiles(3000,'win32',{APPDATA:appdata},root)).length,1);
  // An existing profile with an unexpected secret reference, health
  // listener, or additional remote MCP target must not be adopted.
  const profile=path.join(appdata,'tunnel-client','vscode-local.yaml');
  const safe=fs.readFileSync(profile,'utf8');
  for(const change of [
   x=>x.replace('env:CONTROL_PLANE_API_KEY','file:/untrusted/secret'),
   x=>x.replace('https://api.openai.com','https://untrusted.example'),
   x=>x.replace('127.0.0.1:8080','127.0.0.1:9090'),
   x=>x+'\\n    - url: "http://127.0.0.1:4000/mcp"'
  ]){
   fs.writeFileSync(profile,change(safe));
   assert.equal((await discoverExistingProfiles(3000,'win32',{APPDATA:appdata},root)).length,0);
  }
  fs.writeFileSync(profile,safe);
  console.log('PASS: Windows APPDATA, Linux XDG, macOS Application Support; safe read-only profile discovery and local endpoint validation');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});