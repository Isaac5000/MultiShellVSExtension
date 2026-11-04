'use strict';
const assert=require('node:assert/strict');
const {AI_ONBOARDING_GUIDES,onboardingGuide,onboardingGuidesForUi}=
  require('../out/ai-provider-onboarding.js');
const {AI_CLIENT_CATALOG}=require('../out/ai-provider-catalog.js');
const {addLocalConnection,listLocalConnections}=require('../out/ai-connections.js');
const {readProviderStatuses,saveProviderField,clearProviderField,
  removeProviderSettings}=require('../out/ai-provider-settings.js');

(async()=>{
 const all=new Set(AI_CLIENT_CATALOG.map(x=>x.id));
 assert.deepEqual(new Set(AI_ONBOARDING_GUIDES.map(x=>x.provider)),all);
 assert.equal(AI_ONBOARDING_GUIDES.length,10);
 for(const guide of AI_ONBOARDING_GUIDES){
   assert.ok(guide.stepsEs.length>=2&&guide.stepsEn.length>=2);
   assert.ok(guide.noteEs&&guide.noteEn);
   assert.equal(new Set(guide.fields.map(x=>x.id)).size,guide.fields.length);
   for(const entry of guide.commands){
     assert.ok(['all','windows','unix'].includes(entry.platform));
     assert.ok(entry.command.length>0);
     assert.ok(!/[\r\n\x00-\x1f]/.test(entry.command));
   }
   for(const link of guide.links){
     const target=new URL(link.url);
     assert.equal(target.protocol,'https:','Guide opens HTTPS official sources only');
     assert.ok(link.labelEs&&link.labelEn);
   }
   for(const fld of guide.fields){
     assert.ok(['https-url','text','secret'].includes(fld.kind));
     assert.ok(fld.labelEs&&fld.labelEn&&fld.helpEs&&fld.helpEn);
   }
 }
 const gem=onboardingGuide('gemini-cli');
 assert.ok(gem.commands.some(c=>c.command==='npm install -g @google/gemini-cli'));
 assert.ok(gem.commands.some(c=>c.command==='gemini mcp list'));
 assert.ok(gem.stepsEs.some(x=>x.includes('Google')));
 assert.deepEqual(gem.fields,[],'Gemini CLI must not prompt for an unused API key');
 assert.deepEqual(onboardingGuide('claude-code').fields,[],
   'Claude Code must sign in through its official flow, not by collecting an API key');
 assert.equal(onboardingGuide('invalid-provider'),undefined);
 const guideCopy=onboardingGuidesForUi();
 guideCopy[0].stepsEs[0]='inject';
 assert.notEqual(onboardingGuide(guideCopy[0].provider).stepsEs[0],'inject');

 const metadata=new Map(),privateSecrets=new Map();
 const globalState={
   get:(key,def)=>metadata.has(key)?metadata.get(key):def,
   update:async(k,v)=>{metadata.set(k,v);}
 };
 const host={globalState,secrets:{
   get:async k=>privateSecrets.get(k),
   store:async(k,v)=>{privateSecrets.set(k,v);},
   delete:async k=>{privateSecrets.delete(k);}
 }};
 const a=await addLocalConnection(globalState,'gemini-cli','Gemini local test');
 const b=await addLocalConnection(globalState,'gemini-api','Gemini API test');
 const c=await addLocalConnection(globalState,'grok-web','Grok external test');
 const d=await addLocalConnection(globalState,'gemini-api','Second Gemini API test');
 assert.equal(listLocalConnections(globalState).length,4);
 await assert.rejects(saveProviderField(host,a.id,'providerApiKey','gemini_key_123'),/Unsupported/);
 await saveProviderField(host,d.id,'providerApiKey','gemini_key_123');
 await saveProviderField(host,b.id,'providerApiKey','api_key_different');
 await saveProviderField(host,c.id,'publicMcpUrl','https://public.example.com/mcp');
 await saveProviderField(host,c.id,'connectorId','mcp-test-connector');
 await saveProviderField(host,c.id,'mcpBearer','secret-for-grok');
 let publicStatus=await readProviderStatuses(host);
 assert.equal(publicStatus[a.id].hasProviderApiKey,false);
 assert.equal(publicStatus[d.id].hasProviderApiKey,true);
 assert.equal(publicStatus[b.id].hasProviderApiKey,true);
 assert.equal(publicStatus[c.id].hasMcpBearer,true);
 assert.equal(publicStatus[c.id].publicMcpUrl,'https://public.example.com/mcp');
 assert.equal(publicStatus[c.id].connectorId,'mcp-test-connector');
 const displayed=JSON.stringify([...metadata.values()])+JSON.stringify(publicStatus);
 for(const secret of ['gemini_key_123','api_key_different','secret-for-grok']){
   assert.ok(!displayed.includes(secret),'Secret must never be stored in Memento or returned in Webview state');
   assert.ok([...privateSecrets.values()].includes(secret),'SecretStorage should own credential');
 }
 assert.equal(new Set([...privateSecrets.keys()]).size,3);
 for(const badUrl of ['http://example.com/mcp','http://127.0.0.1:3000/mcp',
   'https://localhost/mcp','https://192.168.1.22/mcp','https://user:pass@example.com/mcp',
   'https://example.com/mcp?key=s3cr3t','https://example.com/mcp#secret',
   'javascript:alert(1)','https://example.com/mcp ']){
   await assert.rejects(saveProviderField(host,c.id,'publicMcpUrl',badUrl),/HTTPS|URL|endpoint/,
     'Invalid URL should be rejected: '+badUrl);
 }
 await assert.rejects(saveProviderField(host,a.id,'publicMcpUrl','https://example.com'),/Unsupported/);
 await assert.rejects(saveProviderField(host,c.id,'providerApiKey','bad-key'),/Unsupported/);
 await assert.rejects(saveProviderField(host,b.id,'providerApiKey','has\nnewline'),/credential/);
 await assert.rejects(saveProviderField(host,'fake','mcpBearer','fake'),/no longer exists/);
 await assert.rejects(saveProviderField(host,c.id,'connectorId','bad; echo hi'),/identifier/);
 await clearProviderField(host,c.id,'mcpBearer');
 await clearProviderField(host,c.id,'publicMcpUrl');
 publicStatus=await readProviderStatuses(host);
 assert.equal(publicStatus[c.id].hasMcpBearer,false);
 assert.equal(publicStatus[c.id].publicMcpUrl,undefined);
 // Simulate a credential from a pre-0.10.50 local-client profile:
 const legacyKey='multiShellAiProviderCredentialV1:'+a.id+':providerApiKey';
 privateSecrets.set(legacyKey,'legacy-unused-secret');
 publicStatus=await readProviderStatuses(host);
 assert.equal(publicStatus[a.id].hasProviderApiKey,true);
 await clearProviderField(host,a.id,'providerApiKey');
 assert.equal((await readProviderStatuses(host))[a.id].hasProviderApiKey,false);
 await removeProviderSettings(host,d.id);
 assert.equal((await readProviderStatuses(host))[d.id].hasProviderApiKey,false);
 assert.equal((await readProviderStatuses(host))[b.id].hasProviderApiKey,true);
 console.log('PASS: 10 provider guides, no unnecessary local API key fields, legacy-key cleanup, per-profile SecretStorage and safe URLs');
})().catch(e=>{console.error(e);process.exitCode=1;});