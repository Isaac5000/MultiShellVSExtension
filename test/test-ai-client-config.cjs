'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {integrationLocation,configureClient,disconnectClient,connectionConfigStatus,
 ownsClientProfile,AI_CLIENT_INSTALLS}=require('../out/ai-client-config.js');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ms-ai-client-config-'));
const home=path.join(tmp,'home'),workspace=path.join(tmp,'workspace');
const copilotHome=path.join(home,'.copilot'),roots={home,copilotHome};
const data=new Map(),store={get:(k,d)=>data.has(k)?data.get(k):d,
 update:async(k,v)=>{data.set(k,v);}};
const profile=provider=>({id:randomUUID(),provider,name:'Test '+provider,createdAt:Date.now()});
(async()=>{
 try{
  fs.mkdirSync(workspace,{recursive:true});
  for(const p of ['vscode','gemini-cli','cursor','claude-code'].map(profile)){
   const loc=integrationLocation(p.provider,3000,workspace,home,copilotHome);
   assert.equal(loc.entry.url||loc.entry.httpUrl,'http://127.0.0.1:3000/mcp');
   assert.equal(loc.server,'multishell');
   fs.mkdirSync(path.dirname(loc.file),{recursive:true});
   const initial='{\n  // retained comment\n  "unrelated": {"flag": true},\n  "mcpServers": {"previous": {"command": "some-tool"}, "multishell": '+JSON.stringify(loc.entry)+'}\n}\n';
   fs.writeFileSync(loc.file,initial);
   const before=await connectionConfigStatus(p,3000,store,workspace,roots);
   assert.equal(before.configured,false,'URL-only legacy entry cannot authenticate');
   assert.equal(before.managed,false);
   await assert.rejects(configureClient(p,3000,store,workspace,roots),/authenticated.*gateway/i);
   assert.equal(fs.readFileSync(loc.file,'utf8'),initial,'Refusal must be nondestructive');
   // Preserve legacy uninstall after the authentication migration.
   data.set(AI_CLIENT_INSTALLS,{
    [p.id]:{provider:p.provider,file:loc.file,url:'http://127.0.0.1:3000/mcp',id:p.id}
   });
   assert.equal(ownsClientProfile(store,p.id),true);
   const owned=await connectionConfigStatus(p,3000,store,workspace,roots);
   assert.equal(owned.configured,false);
   assert.equal(owned.managed,true);
   assert.equal(await disconnectClient(p,3050,store,workspace,roots),true);
   assert.equal(ownsClientProfile(store,p.id),false);
   const result=require('jsonc-parser').parse(fs.readFileSync(loc.file,'utf8'));
   assert.equal(result.mcpServers.multishell,undefined);
   assert.equal(result.mcpServers.previous.command,'some-tool');
   assert.equal(result.unrelated.flag,true);
   assert.ok(fs.readFileSync(loc.file,'utf8').includes('retained comment'));
  }
  const p=profile('cursor'),loc=integrationLocation(p.provider,3000,workspace,home,copilotHome);
  fs.mkdirSync(path.dirname(loc.file),{recursive:true});
  const external='{"mcpServers":{"multishell":{"url":"https://third-party.example/mcp"}}}';
  fs.writeFileSync(loc.file,external);
  await assert.rejects(configureClient(p,3000,store,workspace,roots),/authenticated/);
  assert.equal(fs.readFileSync(loc.file,'utf8'),external);
  await assert.rejects(disconnectClient(p,3000,store,workspace,roots),/not owned/);
  for(const bad of ['{"mcpServers":','{"mcpServers":{}, "mcpServers":{}}']){
   fs.writeFileSync(loc.file,bad);
   await assert.rejects(connectionConfigStatus(p,3000,store,workspace,roots));
   assert.equal(fs.readFileSync(loc.file,'utf8'),bad);
  }
  fs.writeFileSync(loc.file,'{}\n');
  const outside=path.join(tmp,'outside.json');
  fs.writeFileSync(outside,'{}\n');fs.rmSync(loc.file);
  try{
   fs.symlinkSync(outside,loc.file,'file');
   await assert.rejects(connectionConfigStatus(p,3000,store,workspace,roots),/Unsafe/);
   assert.equal(fs.readFileSync(outside,'utf8'),'{}\n');
  }catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
  fs.rmSync(loc.file,{force:true});
  fs.writeFileSync(loc.file,JSON.stringify({mcpServers:{multishell:loc.entry}}));
  data.set(AI_CLIENT_INSTALLS,{
   [p.id]:{provider:p.provider,file:loc.file,url:'http://127.0.0.1:3000/mcp',id:p.id}
  });
  fs.mkdirSync(loc.file+'.multishell.lock');
  await assert.rejects(disconnectClient(p,3000,store,workspace,roots),/in progress/);
  fs.rmdirSync(loc.file+'.multishell.lock');
  assert.equal(await disconnectClient(p,3000,store,workspace,roots),true);
  assert.throws(()=>integrationLocation('claude-code',3000,undefined,home,copilotHome),/workspace/);
  assert.throws(()=>integrationLocation('vscode',3000,workspace,home,'relative'),/absolute/);
  console.log('PASS: legacy URLs flagged unusable; secure refusal; removable managed entries; configs and comments preserved');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
