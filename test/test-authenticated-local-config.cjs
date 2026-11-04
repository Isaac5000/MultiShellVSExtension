'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {configureClient,connectionConfigStatus}=require('../out/ai-client-config.js');
const {localConnectionInstructions}=require('../out/ai-connections.js');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-auth-local-'));
 const home=path.join(tmp,'home'), workspace=path.join(tmp,'work');
 const config=path.join(home,'.gemini','settings.json');
 const profile={id:randomUUID(),provider:'gemini-cli',name:'Gemini',createdAt:Date.now()};
 const data=new Map(),store={
  get:(key,fallback)=>data.has(key)?data.get(key):fallback,
  update:async(key,value)=>{data.set(key,value);}
 };
 try{
  fs.mkdirSync(path.dirname(config),{recursive:true});
  fs.mkdirSync(workspace);
  const legacy='{ "mcpServers": { "multishell": { "httpUrl": "http://127.0.0.1:3000/mcp", "trust": false } } }';
  fs.writeFileSync(config,legacy);
  const state=await connectionConfigStatus(profile,3000,store,workspace,{home});
  assert.equal(state.configured,false,'URL-only MCP config cannot authenticate after security upgrade');
  await assert.rejects(
   configureClient(profile,3000,store,workspace,{home}),
   /authenticated|gateway|credential/i,
   'Automatic setup must not write URL-only unauthenticated MCP configs');
  assert.equal(fs.readFileSync(config,'utf8'),legacy,'Refusal must not alter existing config');
  const newProfile={...profile,id:randomUUID(),provider:'cursor'};
  await assert.rejects(configureClient(newProfile,3000,store,workspace,{home}),/authenticated|gateway|credential/i);
  assert.equal(fs.existsSync(path.join(home,'.cursor','mcp.json')),false,'No unusable config created');
  assert.throws(()=>localConnectionInstructions('gemini-cli',3000),/gateway|authenticated/i);
  const endpoint='http://127.0.0.1:38100/mcp';
  for(const provider of ['gemini-cli','cursor','vscode','claude-code']){
   const snippet=localConnectionInstructions(provider,3000,endpoint);
   assert.ok(snippet.includes(endpoint),'snippet must point at scoped gateway');
   assert.ok(snippet.includes('Authorization'),'snippet must require bearer auth');
   assert.ok(snippet.includes('YOUR_PER_CLIENT_GATEWAY_KEY'),'no real credential in copied text');
   assert.ok(!snippet.includes(':3000/mcp'),'unprotected coordinator URL cannot leak into snippet');
  }
  assert.throws(()=>localConnectionInstructions('cursor',3000,'http://127.0.0.1:3000/mcp'),/gateway|port/i);
  assert.throws(()=>localConnectionInstructions('cursor',3000,'https://evil.example/mcp'),/gateway|endpoint/i);
  console.log('PASS: legacy URL-only config is not reported usable, safe automatic setup refusal, authenticated gateway snippets without credentials');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
