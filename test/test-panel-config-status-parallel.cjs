'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profiles=Array.from({length:24},(_,i)=>({
 id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),
 name:'Provider '+i,provider:'gemini-api',createdAt:i+1
}));
let active=0,peak=0;
const payloads=[];
const mockVscode={
 env:{language:'es-ES'},
 workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:'C:/test-project'}}],
  getConfiguration:()=>({get:key=>key==='port'?3000:key==='enabledTools'?{file:true}:false})}
};
const {MultiShellPanel}=proxyquire('../out/panel.js',{
 vscode:mockVscode,
 './ai-connections':{listLocalConnections:()=>profiles},
 './ai-client-config':{connectionConfigStatus:async profile=>{
   active++;peak=Math.max(peak,active);
   await sleep(16);
   active--;
   return {configured:true,managed:false,scope:'user',detail:profile.id};
 }},
 './ai-provider-settings':{readProviderStatuses:async()=>({})}
});
const storage={get:(_key,def)=>def,update:async()=>{}};
const context={extensionUri:'file:///extension',subscriptions:[],workspaceState:storage,globalState:storage};
const controller={listeningPort:3000,panelState:async()=>({
 role:'hub',windowId:'test',workspace:'C:/test-project',primary:'main-test',
 shells:[],requests:[],windows:[],windowAutoExit:true
})};
(async()=>{
 const panel=new MultiShellPanel(context,()=>controller);
 panel.view={webview:{postMessage:async message=>{payloads.push(message);return true;}}};
 const started=Date.now();
 await panel.refresh(true);
 const duration=Date.now()-started;
 assert.equal(payloads.length,1);
 const states=payloads[0].snapshot.aiLinkStates;
 assert.deepEqual(Object.keys(states),profiles.map(p=>p.id));
 assert.equal(Object.keys(states).length,24);
 assert.ok(peak>1,'Independent profile config checks must overlap; peak='+peak);
 assert.ok(peak<=6,'No more than six profile configs in flight; peak='+peak);
 for(const profile of profiles){assert.equal(states[profile.id].detail,profile.id);}
 console.log('PASS panel profile configuration checks are bounded and ordered; '+duration+'ms; peak='+peak);
})().catch(error=>{console.error(error);process.exitCode=1;});
