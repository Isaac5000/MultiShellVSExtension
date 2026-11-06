'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const proxyquire=require('proxyquire').noCallThru();
const {AiGatewayManager}=proxyquire('../out/ai-gateway-manager.js',{
 './ai-connections':{listLocalConnections:()=>[{id:'ai-one'}]}
});
const data=new Map(),secrets=new Map();
const host={globalState:{
 get:(key,fallback)=>data.has(key)?data.get(key):fallback,
 update:async(key,value)=>{data.set(key,value);}
},secrets:{
 get:async key=>secrets.get(key),
 store:async(key,value)=>{secrets.set(key,value)},
 delete:async key=>{secrets.delete(key)}
}};
let failStop=true,active=false,stopCalls=0;
const factory=()=>({start:async()=>{active=true;},
 stop:async()=>{stopCalls++;if(failStop)throw Error('injected shutdown failure');active=false;},
 isHealthy:()=>active});
const api={list:async()=>[{shell_id:'one',initial_cwd:process.cwd()}],
 root:()=>process.cwd(),windows:()=>[],
 execute:async()=>({output:'',exit_code:0})};
const m=new AiGatewayManager(host,()=>api,()=>true,()=>({file:true,edit:true,shell:true}),()=>true,factory);
(async()=>{
 await m.provision('ai-one','one','read');
 await m.start('ai-one');
 assert.equal(m.statuses()[0].running,true);
 await assert.rejects(m.stop('ai-one'),/injected shutdown failure/);
 assert.equal(m.statuses()[0].running,true,
  'Failed stop must retain the original active handle for retry and revocation');
 assert.equal(active,true);
 // A failed stop must prevent secret rotation, removal and policy replacement.
 await assert.rejects(m.rotate('ai-one'),/injected shutdown failure/);
 assert.equal(m.statuses()[0].running,true);
 failStop=false;
 await m.stop('ai-one');
 assert.equal(m.statuses()[0].running,false);
 assert.equal(active,false);
 assert.ok(stopCalls>=3);
 console.log('PASS: failed AI gateway shutdown remains tracked, retryable and fails closed');
})().catch(error=>{console.error(error);process.exitCode=1;});
