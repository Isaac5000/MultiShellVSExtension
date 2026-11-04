'use strict';
const assert=require('node:assert/strict');
const {AI_CLIENT_CATALOG,getAiClientCapability,isRemoteProvider,REMOTE_PROVIDERS,
 clientCapabilitiesForUi}=require('../out/ai-provider-catalog.js');
const {listLocalConnections,addLocalConnection,localConnectionInstructions}=
 require('../out/ai-connections.js');
(async()=>{
 assert.equal(new Set(AI_CLIENT_CATALOG.map(x=>x.id)).size,AI_CLIENT_CATALOG.length);
 for(const entry of AI_CLIENT_CATALOG){
  assert.ok(entry.name&&entry.setupEs&&entry.setupEn&&entry.cautionEs&&entry.cautionEn);
  assert.equal(getAiClientCapability(entry.id).id,entry.id);
  if(entry.mode==='remote'){
   assert.equal(entry.transport,'remote-https');
   assert.equal(entry.automatic,false);
   assert.ok(entry.setupUrl.startsWith('https://'));
   assert.equal(isRemoteProvider(entry.id),true);
   assert.throws(()=>localConnectionInstructions(entry.id,3000),/authenticated HTTPS gateway/);
  }else if(entry.mode==='local'){
   assert.equal(entry.automatic,false,'Local clients require explicit authenticated gateway setup');
   assert.throws(()=>localConnectionInstructions(entry.id,3000),/authenticated per-AI gateway/);
   assert.ok(localConnectionInstructions(entry.id,3000,'http://127.0.0.1:38100/mcp').includes('Authorization'));
  }
 }
 assert.deepEqual(new Set(REMOTE_PROVIDERS),new Set(AI_CLIENT_CATALOG.filter(x=>x.mode==='remote').map(x=>x.id)));
 const copied=clientCapabilitiesForUi();
 copied[0].name='tampered';
 assert.notEqual(getAiClientCapability(copied[0].id).name,'tampered');
 assert.equal(getAiClientCapability('https://evil.example'),undefined);
 assert.equal(isRemoteProvider('custom'),false);
 const state=new Map();
 const store={get:(key,fallback)=>state.get(key)??fallback,update:async(k,v)=>state.set(k,v)};
 const p=await addLocalConnection(store,'claude-web','Cloud Claude');
 assert.equal(listLocalConnections(store).length,1);
 assert.equal(listLocalConnections(store)[0].id,p.id);
 await assert.rejects(addLocalConnection(store,'not-a-provider','Fake'),/Invalid/);
 console.log('PASS: official provider-specific local/remote modes, persistence, no localhost leak into remote snippets');
})().catch(e=>{console.error(e);process.exitCode=1;});
