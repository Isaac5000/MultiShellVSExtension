'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let receiver,trust=true,approve=true,running=true;
const state=new Map(),secrets=new Map(),sent=[],copied=[],managed=new Set(),opened=[],gateways=new Map();
const mock={
 env:{language:'es-ES',clipboard:{writeText:async value=>copied.push(value)},openExternal:async uri=>{opened.push(uri.value);return true;}},
 workspace:{
   get isTrusted(){return trust;},
   workspaceFolders:[{uri:{fsPath:'/tmp/project'}}],
   getConfiguration:()=>({get:key=>key==='port'?3000:key==='enabledTools'?{file:true,edit:true,shell:true}:false}),
   openTextDocument:async uri=>({uri})
 },
 Uri:{joinPath:(base,...parts)=>({toString:()=>[String(base),...parts].join('/')}),parse:value=>({value})},
 window:{showWarningMessage:async(_text,_opts,label)=>approve?label:undefined,
 showTextDocument:async()=>{}},
 commands:{executeCommand:async()=>{}}
};
const {MultiShellPanel}=proxyquire('../out/panel.js',{vscode:mock,
 './ai-client-config':{
    connectionConfigStatus:async p=>({configured:false,managed:managed.has(p.id),
       scope:'user',detail:'/test/virtual/mcp.json'}),
    configureClient:async p=>{managed.add(p.id);return 'configured';},
    disconnectClient:async p=>{managed.delete(p.id);return true;},
    ownsClientProfile:(_store,id)=>managed.has(id),
    integrationLocation:()=>({file:'/test/virtual/mcp.json'})
 }});
const storage={
 get:(key,def)=>state.has(key)?state.get(key):def,
 update:async(key,value)=>{state.set(key,value);}
};
const gateway={
  statuses:()=>[...gateways.values()],
  configured:id=>gateways.has(id),
  provision:async(id,shellId,level)=>{
    const item={profileId:id,shellId,level,port:38100,
      endpoint:'http://127.0.0.1:38100/mcp',running:false};
    gateways.set(id,item);return item;
  },
  start:async id=>{gateways.get(id).running=true;return gateways.get(id);},
  stop:async id=>{gateways.get(id).running=false;},
  secret:async id=>gateways.has(id)?'private-test-secret':undefined,
  rotate:async id=>{gateways.get(id).running=false;return 'new-private-secret';},
  remove:async id=>{gateways.delete(id);}
};
const context={extensionUri:'file:///extension',subscriptions:[],
 globalState:storage,workspaceState:storage,secrets:{
 get:async k=>secrets.get(k),
 store:async(k,v)=>{secrets.set(k,v);},
 delete:async k=>{secrets.delete(k);}
 }};
const controller={
 listeningPort:4001,
 async panelState(){return {role:'hub',windowId:'a',workspace:'/tmp/project',
  primary:'main-a',shells:[],windows:[],requests:[]};}
};
const view={webview:{
 asWebviewUri:x=>x,
 onDidReceiveMessage:cb=>{receiver=cb;return{dispose(){}};},
 postMessage:async x=>{sent.push(x);return true;}
},onDidDispose:()=>({dispose(){}})};
async function action(message){
 const before=sent.filter(x=>x.type==='ai_done'||x.type==='error').length;
 receiver(message);
 for(let i=0;i<80;i++){
  await wait(10);
  if(sent.filter(x=>x.type==='ai_done'||x.type==='error').length>before){return;}
 }
 throw Error('AI panel action did not finish: '+message.type);
}
(async()=>{
 const panel=new MultiShellPanel(context,()=>running?controller:undefined,
    undefined,undefined,undefined,()=>gateway);
 try{
   panel.resolveWebviewView(view);
   await wait(30);
   const html=view.webview.html;
   for(const id of ['navDisclosure','overviewPage','requestsPage','connectionsPage',
    'settingsPage','tabConnections','aiProvider','aiName','aiList','tunnelPage','portForm',
    'chatgptOpenTunnels','chatgptOpenRuntimeKeys','chatgptOpenChat','chatgptOpenMcpGuide']){
     assert.ok(html.includes('id="'+id+'"'),id);
   }
   await action({type:'ai_add',provider:'gemini-cli',value:'Gemini local'});
   let snapshot=sent.findLast(x=>x.type==='state').snapshot;
   assert.equal(snapshot.aiConnections.length,1);
   const profile=snapshot.aiConnections[0];
   assert.equal(profile.name,'Gemini local');
   assert.deepEqual(snapshot.aiOnboarding.find(g=>g.provider==='gemini-cli').fields,[]);
   await action({type:'ai_provider_save',id:profile.id,field:'providerApiKey',value:'UNNEEDED_GEMINI_KEY'});
   assert.ok(sent.some(x=>x.type==='error'&&/Unsupported setup field/.test(x.text)));
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiProviderSaved[profile.id].hasProviderApiKey,false);
   assert.equal(secrets.size,0);
   const legacyKey='multiShellAiProviderCredentialV1:'+profile.id+':providerApiKey';
   secrets.set(legacyKey,'legacy-test-key');
   await panel.refresh();
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiProviderSaved[profile.id].hasProviderApiKey,true);
   await action({type:'ai_provider_clear',id:profile.id,field:'providerApiKey'});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiProviderSaved[profile.id].hasProviderApiKey,false);
   assert.equal(secrets.size,0);
   assert.ok(!JSON.stringify(sent).includes('CONTROL_PLANE_API_KEY'));
   approve=false;
   await action({type:'ai_copy',id:profile.id});
   assert.equal(copied.length,0,'Denied copy must not disclose executable MCP setup');
   approve=true;
   await action({type:'ai_copy',id:profile.id});
   assert.equal(copied.length,0,'No snippet before a scoped authenticated gateway exists');
   assert.ok(sent.some(x=>x.type==='error'&&/gateway/i.test(x.text)));
   await gateway.provision(profile.id,'main-a','read');
   await action({type:'ai_copy',id:profile.id});
   assert.equal(copied.length,1);
   assert.equal(JSON.parse(copied[0]).mcpServers['multi-shell'].httpUrl,'http://127.0.0.1:38100/mcp');
   assert.equal(JSON.parse(copied[0]).mcpServers['multi-shell'].trust,false);
   assert.equal(JSON.parse(copied[0]).mcpServers['multi-shell'].headers.Authorization,
     'Bearer YOUR_PER_CLIENT_GATEWAY_KEY');
   assert.ok(!copied[0].includes('private-test-secret'));
   approve=false;
   await action({type:'ai_install',id:profile.id});
   assert.equal(managed.has(profile.id),false,'Denied setup must not write client settings');
   approve=true;
   await action({type:'ai_install',id:profile.id});
   assert.equal(managed.has(profile.id),false,'Do not generate unauthenticated client config');
   assert.ok(sent.some(x=>x.type==='error'&&/authenticated|secure/i.test(x.text)));
   managed.add(profile.id); // Simulate a legacy managed entry needing cleanup.
   await panel.refresh();
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiLinkStates[profile.id].configured,false);
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiLinkStates[profile.id].managed,true);
   await action({type:'ai_check',id:profile.id});
   await action({type:'ai_open',id:profile.id});
   await action({type:'ai_remove',id:profile.id});
   assert.equal(managed.has(profile.id),true,'Managed configurations must be unlinked before deleting profile');
   approve=false;
   await action({type:'ai_uninstall',id:profile.id});
   assert.equal(managed.has(profile.id),true,'Cancelled disconnect must preserve configuration');
   approve=true;
   await action({type:'ai_uninstall',id:profile.id});
   assert.equal(managed.has(profile.id),false);
   await gateway.remove(profile.id);
   await action({type:'ai_add',provider:'gemini-cli',value:'Gemini local'});
   assert.ok(sent.some(x=>x.type==='error'&&/already exists/.test(x.text)));
   running=false;
   await action({type:'ai_copy',id:profile.id});
   assert.equal(copied.length,1,'Must not copy config when MCP is offline');
   running=true;
   approve=false;
   await action({type:'ai_remove',id:profile.id});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiConnections.length,1);
   approve=true;
   await action({type:'ai_remove',id:profile.id});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiConnections.length,0);
   await action({type:'ai_add',provider:'claude-web',value:'Claude remoto'});
   snapshot=sent.findLast(x=>x.type==='state').snapshot;
   const remote=snapshot.aiConnections[0];
   assert.equal(remote.provider,'claude-web');
   assert.equal(snapshot.aiProviders.find(p=>p.id==='claude-web').mode,'remote');
   await action({type:'ai_copy',id:remote.id});
   assert.ok(sent.some(x=>x.type==='error'&&/Remote providers/.test(x.text)));
   assert.equal(copied.length,1,'Cloud profiles must not receive localhost snippets');
   await action({type:'ai_install',id:remote.id});
   assert.ok(sent.some(x=>x.type==='error'&&/authenticated HTTPS gateway/.test(x.text)));
   await action({type:'ai_open',id:remote.id});
   assert.deepEqual(opened,['https://claude.ai']);
   await action({type:'ai_guide_open',id:remote.id,linkIndex:0});
   assert.equal(opened.at(-1),'https://claude.ai');
   await action({type:'ai_guide_open',id:remote.id,linkIndex:999});
   assert.ok(sent.some(x=>x.type==='error'&&/Unknown official guide URL/.test(x.text)));
   await action({type:'ai_provider_save',id:remote.id,field:'publicMcpUrl',
      value:'https://mcp.example.com/mcp'});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiProviderSaved[remote.id].publicMcpUrl,
     'https://mcp.example.com/mcp');
   await action({type:'ai_provider_save',id:remote.id,field:'publicMcpUrl',
      value:'http://127.0.0.1:3000/mcp'});
   assert.ok(sent.some(x=>x.type==='error'&&/public HTTPS/.test(x.text)));
   await action({type:'ai_provider_clear',id:remote.id,field:'publicMcpUrl'});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiProviderSaved[remote.id].publicMcpUrl,
     undefined);
   approve=false;
   await action({type:'ai_gateway_configure',id:remote.id,
      shellId:'main-a',level:'read'});
   assert.equal(gateway.configured(remote.id),false,'Setup requires explicit confirmation');
   approve=true;
   await action({type:'ai_gateway_configure',id:remote.id,
      shellId:'main-a',level:'read'});
   assert.equal(gateway.configured(remote.id),true);
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiGateways.length,1);
   await action({type:'ai_gateway_start',id:remote.id});
   assert.equal(gateway.statuses()[0].running,true);
   approve=false;
   await action({type:'ai_gateway_copy_key',id:remote.id});
   assert.equal(copied.length,1,'Denied key copying must not disclose secrets');
   approve=true;
   await action({type:'ai_gateway_copy_key',id:remote.id});
   assert.equal(copied.at(-1),'private-test-secret');
   assert.equal(JSON.stringify(sent).includes('private-test-secret'),false,
     'No secret may enter the webview state or notifications');
   await action({type:'ai_gateway_copy_url',id:remote.id});
   assert.equal(copied.at(-1),'http://127.0.0.1:38100/mcp');
   await action({type:'ai_remove',id:remote.id});
   assert.equal(gateway.configured(remote.id),true,
      'Managed gateway blocks profile deletion');
   await action({type:'ai_gateway_rotate',id:remote.id});
   assert.equal(gateway.statuses()[0].running,false);
   await action({type:'ai_gateway_revoke',id:remote.id});
   assert.equal(gateway.configured(remote.id),false);
   await action({type:'ai_remove',id:remote.id});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiConnections.length,0);
   await action({type:'ai_add',provider:'gemini-cli',value:'Gemini guide test'});
   const guideProfile=sent.findLast(x=>x.type==='state').snapshot.aiConnections[0];
   await action({type:'ai_guide_copy',id:guideProfile.id,commandIndex:0});
   assert.equal(copied.at(-1),'npm install -g @google/gemini-cli');
   await action({type:'ai_guide_copy',id:guideProfile.id,commandIndex:99});
   assert.ok(sent.some(x=>x.type==='error'&&/Unknown guide command/.test(x.text)));
   await action({type:'ai_chatgpt_tunnels'});
   assert.equal(opened.at(-1),'https://platform.openai.com/settings/organization/tunnels');
   await action({type:'ai_chatgpt_runtime_keys'});
   assert.equal(opened.at(-1),'https://platform.openai.com/settings/organization/api-keys');
   await action({type:'ai_chatgpt_chat'});
   assert.equal(opened.at(-1),'https://chatgpt.com/');
   await action({type:'ai_chatgpt_guide'});
   assert.match(opened.at(-1),/help\.openai\.com\/en\/articles\/12584461/);
   await action({type:'ai_remove',id:guideProfile.id});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiConnections.length,0);
   trust=false;
   await action({type:'ai_add',provider:'vscode',value:'untrusted'});
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.aiConnections.length,0);
   assert.ok(sent.some(x=>x.type==='error'&&/trusted workspace/.test(x.text)));
   assert.ok(state.has('multiShellMcpLocalConnectionsV1'));
   assert.equal(state.get('multiShellMcpLocalConnectionsV1').length,0);
   console.log('PASS: structured AI panel and persistence, clipboard config, trust/offline gates and safe removal confirmation');
 }finally{panel.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});