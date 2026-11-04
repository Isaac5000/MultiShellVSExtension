'use strict';
const assert=require('node:assert/strict');
const {addLocalConnection,listLocalConnections,removeLocalConnection,
  localConnectionInstructions,validConnectionName,LOCAL_CONNECTIONS_KEY,
  PROVIDERS}=require('../out/ai-connections.js');
(async()=>{
 const m=new Map(),storage={
  get:(key,defaultValue)=>m.has(key)?m.get(key):defaultValue,
  update:async(key,value)=>{m.set(key,value);}
 };
 assert.equal(listLocalConnections(storage).length,0);
 assert.ok(validConnectionName('Claude personal'));
 for(const bad of ['',' leading','trailing ','../escape','abc<script>','x'.repeat(50)]){
   assert.equal(validConnectionName(bad),false);
 }
 for(const provider of PROVIDERS){
   const x=await addLocalConnection(storage,provider,'Test '+provider);
   assert.equal(x.provider,provider);
   assert.equal(listLocalConnections(storage).length,PROVIDERS.indexOf(provider)+1);
   const snippet=localConnectionInstructions(provider,3000,'http://127.0.0.1:38100/mcp');
   assert.ok(snippet.includes('127.0.0.1:38100/mcp'));
   assert.ok(snippet.includes('Authorization'));
   assert.ok(snippet.includes('YOUR_PER_CLIENT_GATEWAY_KEY'));
   assert.ok(!snippet.includes('0.0.0.0'));
   assert.ok(!snippet.includes('tunnel_id')&&!snippet.includes('api_key'));
   if(provider==='vscode'){
     assert.equal(JSON.parse(snippet).servers.multishell.type,'http');
   }else if(provider==='gemini-cli'){
     assert.equal(JSON.parse(snippet).mcpServers['multi-shell'].trust,false);
   }else if(provider==='cursor'){
     assert.equal(JSON.parse(snippet).mcpServers.multishell.url,'http://127.0.0.1:38100/mcp');
   }else if(provider==='claude-code'){
     assert.match(snippet,/^claude mcp add --transport http multishell/);
   }
 }
 assert.equal(JSON.parse(localConnectionInstructions('vscode',4200,'http://127.0.0.1:38120/mcp')).servers.multishell.url,
   'http://127.0.0.1:38120/mcp');
 assert.throws(()=>localConnectionInstructions('vscode',4200),/gateway/);
 await assert.rejects(addLocalConnection(storage,'vscode','test VSCODE'),/already exists/);
 await assert.rejects(addLocalConnection(storage,'bad','Rejected'),/Invalid/);
 await assert.rejects(addLocalConnection(storage,'other','<script>'),/Invalid/);
 assert.throws(()=>localConnectionInstructions('vscode',70000),/Invalid MCP port/);
 const entries=listLocalConnections(storage);
 assert.equal(await removeLocalConnection(storage,entries[1].id),true);
 assert.equal(await removeLocalConnection(storage,entries[1].id),false);
 assert.equal(listLocalConnections(storage).length,entries.length-1);
 assert.deepEqual([...m.get(LOCAL_CONNECTIONS_KEY)].map(x=>Object.keys(x).sort().join(',')),
   Array(entries.length-1).fill('createdAt,id,name,provider'));
 m.set(LOCAL_CONNECTIONS_KEY,[{id:'forged',name:'safe',provider:'other',createdAt:1},...entries]);
 assert.equal(listLocalConnections(storage).length,entries.length);
 console.log('PASS: safe local AI profile persistence, no secrets, local-only snippets, validation and removal');
})().catch(error=>{console.error(error);process.exitCode=1;});
