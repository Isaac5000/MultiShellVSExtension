'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {readProviderStatuses}=require('../out/ai-provider-settings.js');
const {LOCAL_CONNECTIONS_KEY}=require('../out/ai-connections.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const items=Array.from({length:24},(_,i)=>({id:randomUUID(),provider:'gemini-api',name:'Client '+i,createdAt:i+1}));
let active=0,peak=0,seen=[];
const store={
 get:(key,def)=>key===LOCAL_CONNECTIONS_KEY?items:def,
 update:async()=>{}
};
const secret={get:async key=>{
 active++;peak=Math.max(peak,active);seen.push(key);
 await sleep(18);
 active--;
 return key.includes(items[2].id)?'real-secret-value':undefined;
}};
(async()=>{
 const begun=Date.now();
 const states=await readProviderStatuses({globalState:store,secrets:secret});
 const elapsed=Date.now()-begun;
 assert.equal(Object.keys(states).length,24);
 assert.equal(seen.length,48);
 assert.ok(peak>2,'A second independent profile should load concurrently, not serially. peak='+peak);
 assert.ok(peak<=12,'Limit SecretStorage concurrent calls to 6 profiles. peak='+peak);
 assert.deepEqual(Object.keys(states),items.map(x=>x.id),'Output order must remain stable');
 assert.equal(states[items[2].id].hasProviderApiKey,true);
 assert.equal(states[items[2].id].hasMcpBearer,true);
 assert.ok(!JSON.stringify(states).includes('real-secret-value'),'Secret values must never enter UI snapshots');
 console.log('PASS 24 provider profiles refresh concurrently, bounded to 12 secret gets; '+elapsed+'ms; peak='+peak);
})().catch(e=>{console.error(e);process.exitCode=1;});
