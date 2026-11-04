'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sent=[],actions=[];
let receive,trust=true,approve=true;
const secret='never-send-this-key-back-to-the-panel';
const tunnel={
  installed:false,version:'0.0.19',configured:false,autostart:false,
  childRunning:false,listenerOccupied:false,ready:false,owner:'none',
  profile:'vscode-local',source:'managed',retryFailures:0,retryPaused:false
};
const manager={
  async status(){return {...tunnel};},
  async install(){actions.push('install');tunnel.installed=true;return '/tmp/tunnel-client';},
  async configure(id,key,profile){
    actions.push(['configure',id,profile]);
    assert.equal(key,secret);
    tunnel.profile=profile;tunnel.configured=true;
  },
  async updateApiKey(key){assert.equal(key,secret);actions.push('updateKey');},
  async start(){actions.push('start');tunnel.childRunning=true;tunnel.owner='extension';return 'started';},
  async stop(){actions.push('stop');tunnel.childRunning=false;tunnel.owner='none';tunnel.autostart=false;},
  async setAutostart(value){actions.push(['autostart',value]);tunnel.autostart=value;},
  async startIfEnabled(){actions.push('startIfEnabled');}
};
const mock={
  env:{language:'es-ES'},
  workspace:{
    get isTrusted(){return trust;},
    getConfiguration(){return {get:key=>key==='port'?3000:key==='enabledTools'?{file:true}:false};},
    workspaceFolders:[{uri:{fsPath:'/tmp/project'}}]
  },
  ProgressLocation:{Notification:15},
  Uri:{joinPath:(base,...parts)=>({
    fsPath:[String(base),...parts].join('/'),
    toString:()=>[String(base),...parts].join('/')
  })},
  window:{
    withProgress:async(_opts,cb)=>cb({report:()=>{}}),
    showWarningMessage:async(_text,_opts,answer)=>approve?answer:undefined
  },
  commands:{executeCommand:async name=>actions.push(['command',name])}
};
const {MultiShellPanel}=proxyquire('../out/panel.js',{vscode:mock});
const context={
 extensionUri:'file:///extension',
 subscriptions:[],
 workspaceState:{get:(_key,def)=>def,update:async()=>{}}
};
const controller={
 listeningPort:3000,
 async panelState(){return {role:'hub',windowId:'w-1',workspace:'/tmp/project',
  primary:'p-1',shells:[],windows:[],requests:[]};}
};
const view={
 webview:{
  asWebviewUri:uri=>uri,
  onDidReceiveMessage:cb=>{receive=cb;return {dispose(){}};},
  postMessage:async message=>{sent.push(message);return true;}
 },
 onDidDispose:()=>({dispose(){}})
};
async function action(data){
 const before=sent.filter(x=>x.type==='tunnel_done'||x.type==='error').length;
 receive(data);
 for(let i=0;i<50;i++){
   await wait(10);
   if(sent.filter(x=>x.type==='tunnel_done'||x.type==='error').length>before){return sent.at(-1);}
 }
 throw Error('Tunnel UI action did not finish');
}
(async()=>{
 const panel=new MultiShellPanel(context,()=>controller,undefined,undefined,()=>manager);
 try{
   panel.resolveWebviewView(view);
   await wait(30);
   for(const id of ['tabTunnel','tunnelPage','tunnelId','tunnelProfile',
      'tunnelApiKey','tunnelConfigure','tunnelStart','tunnelStop','tunnelAutostart']){
     assert.ok(view.webview.html.includes('id="'+id+'"'),id);
   }
   assert.match(view.webview.html,/type="password" id="tunnelApiKey"/);
   assert.match(view.webview.html,/Content-Security-Policy/);
   assert.equal(sent.findLast(x=>x.type==='state').snapshot.tunnel.version,'0.0.19');
   await action({type:'tunnel_install'});
   await action({type:'tunnel_configure',
     id:'tunnel_0123456789abcdef0123456789abcdef',profile:'new-profile',key:secret});
   assert.equal(tunnel.profile,'new-profile');
   assert.equal(tunnel.configured,true);
   assert.ok(actions.some(x=>Array.isArray(x)&&x[0]==='configure'));
   assert.ok(!JSON.stringify(sent).includes(secret),
     'A saved API key must never be reflected in UI state or notification messages');
   await action({type:'tunnel_update_key',key:secret});
   await action({type:'tunnel_start'});
   assert.equal(tunnel.owner,'extension');
   approve=false;
   await action({type:'tunnel_stop'});
   assert.equal(tunnel.owner,'extension','Cancelled disconnect must preserve the tunnel');
   approve=true;
   await action({type:'tunnel_autostart',value:true});
   assert.equal(tunnel.autostart,true);
   await action({type:'tunnel_stop'});
   assert.equal(tunnel.autostart,false);
   assert.equal(tunnel.owner,'none');
   await action({type:'tunnel_reuse'});
   assert.ok(actions.some(x=>Array.isArray(x)&&x[1]==='multi-shell-mcp.tunnelReuseProfile'));
   const prior=actions.length;
   await action({type:'tunnel_configure',id:'x',profile:5,key:secret});
   assert.equal(actions.length,prior);
   assert.ok(sent.some(x=>x.type==='error'&&/required/.test(x.text)));
   trust=false;
   await action({type:'tunnel_install'});
   assert.equal(actions.length,prior,'Untrusted workspaces must not manage tunnels');
   assert.ok(sent.some(x=>x.type==='error'&&/Trust/.test(x.text)));
   assert.ok(!JSON.stringify(sent).includes(secret));
   console.log('PASS: tunnel tab actions, secure one-way key flow, host validation, trust checks, cancellation, and state refresh');
 }finally{panel.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
