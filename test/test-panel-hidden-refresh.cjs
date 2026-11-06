'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
let snapshots=0,secretReads=0,configurationChecks=0;
let visibilityCallback;
const sent=[];
const mockVscode={
 env:{language:'es-ES'},
 Uri:{joinPath:(_base,...parts)=>({toString:()=>parts.join('/')})},
 workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:'C:/test'}}],
  getConfiguration:()=>({get:key=>key==='port'?3000:key==='enabledTools'?{file:true}:false})}
};
const {MultiShellPanel}=proxyquire('../out/panel.js',{
 vscode:mockVscode,
 './ai-connections':{listLocalConnections:()=>[{id:'id1',provider:'gemini-api',name:'Client',createdAt:1}]},
 './ai-provider-settings':{readProviderStatuses:async()=>{secretReads++;return {};}},
 './ai-client-config':{connectionConfigStatus:async()=>{
  configurationChecks++;return{configured:true,managed:false,scope:'user',detail:'ok'};
 }}
});
const state={get:(_key,value)=>value,update:async()=>{}};
const controller={listeningPort:3000,panelState:async()=>{
 snapshots++;return{role:'hub',windowId:'test',workspace:'C:/test',primary:'main',
 shells:[],windows:[],requests:[],windowAutoExit:true};}};
async function until(predicate,description){
 for(let i=0;i<100;i++){
  if(predicate())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('Timed out waiting for '+description);
}
(async()=>{
 const panel=new MultiShellPanel(
  {extensionUri:'file:///extension',subscriptions:[],workspaceState:state,globalState:state},
  ()=>controller);
 try{
  panel.view={visible:false,webview:{postMessage:async message=>{sent.push(message);return true;}}};
  await panel.refresh(false);
  assert.equal(snapshots,0,'Hidden view must not poll remote windows');
  assert.equal(secretReads,0,'Hidden view must not poll SecretStorage');
  assert.equal(configurationChecks,0,'Hidden view must not scan client config files');
  panel.view.visible=true;
  await panel.refresh(false);
  assert.equal(snapshots,1);
  assert.equal(secretReads,1);
  assert.equal(configurationChecks,1);

  const realView={
   visible:false,
   webview:{cspSource:'vscode-resource://test',asWebviewUri:uri=>uri,
    postMessage:async message=>{sent.push(message);return true;},
    onDidReceiveMessage:()=>({dispose(){}})},
   onDidDispose:()=>({dispose(){}}),
   onDidChangeVisibility:callback=>{visibilityCallback=callback;return{dispose(){}};}
  };
  panel.resolveWebviewView(realView);
  await until(()=>sent.length>=2,'initial webview refresh');
  assert.equal(typeof visibilityCallback,'function');
  const before=snapshots;
  await panel.refresh(false);
  assert.equal(snapshots,before,'Periodic refresh must stop when webview is hidden');
  realView.visible=true;
  visibilityCallback();
  await until(()=>sent.length>=3,'visibility event refresh');
  assert.equal(secretReads,3,'Reopening must reread current credential presence');
  assert.equal(configurationChecks,3,'Reopening must check client configs again');
  console.log('PASS hidden periodic refresh avoids I/O, reopened webview updates immediately');
 }finally{
  panel.dispose();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
