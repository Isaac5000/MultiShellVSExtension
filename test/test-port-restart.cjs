'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();

let configuredPort=3000;
let configuredTools={file:true,edit:true,shell:true};
let configChanged;
let statusItem;
const alerts=[];
const events=[];
const vscode={
  ThemeColor:class{constructor(id){this.id=id;}},
  ConfigurationTarget:{Global:1},
  StatusBarAlignment:{Right:2},
  window:{
    createStatusBarItem:()=>statusItem={text:'',color:null,tooltip:'',show(){},dispose(){}},
    registerWebviewViewProvider:()=>({dispose(){}}),
    showErrorMessage:message=>alerts.push(String(message)),
    showInformationMessage:()=>{}
  },
  workspace:{
    workspaceFolders:[{uri:{fsPath:'C:\\testproject'}}],
    getConfiguration:()=>({
      get:(key)=>({port:configuredPort,defaultEnabled:true,enabledTools:configuredTools})[key],
      update:async(key,value,target)=>{
        assert.equal(key,'port');assert.equal(target,1);
        configuredPort=value;
        configChanged({affectsConfiguration:name=>name==='multi-shell-mcp.port'});
      }
    }),
    onDidChangeConfiguration:callback=>{
      configChanged=callback;
      return{dispose(){}};
    }
  },
  commands:{registerCommand:()=>({dispose(){}})}
};
class FakeController {
  constructor(port,_token,_workspace,_factory,status){
    this.listeningPort=port;
    this.status=status;
    events.push('created:'+port);
  }
  async start(){
    events.push('started:'+this.listeningPort);
    if(this.listeningPort===4400)throw new Error('Port busy');
    if(this.listeningPort===4500)await delay(120);
    this.status('hub','test');
  }
  async stop(preserve=false){events.push('stopped:'+this.listeningPort);if(preserve){events.push('preserved:'+this.listeningPort);}}
}
const extension=proxyquire('../out/extension.js',{
  vscode,
  './multi-window':{MultiWindowController:FakeController,WindowRouter:class{},getSecret:()=> 'token'},
  './server':{MCPServer:class{}},
  './panel':{MultiShellPanel:class{static viewType='multi-shell-mcp.sessions';refresh(){}dispose(){}}},
  './utils/logger':{logger:{info(){},warn(){},error(){},dispose(){}}}
});
const context={
  globalStorageUri:{fsPath:'C:\\testproject\\.storage'},
  workspaceState:{get:()=>undefined,update:async()=>{}},
  globalState:{get:()=>true,update:async()=>{}},
  subscriptions:[]
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  try{
    await extension.activate(context);
    assert.equal(statusItem.text,'MultiShell MCP: ON · 3000');
    configuredPort=4300;
    configChanged({affectsConfiguration:key=>key==='multi-shell-mcp.port'});
    await delay(60);
    assert.ok(events.includes('stopped:3000'));
    assert.ok(events.includes('preserved:3000'),'Port restart must keep existing terminals alive');
    assert.ok(events.includes('started:4300'));
    assert.equal(statusItem.text,'MultiShell MCP: ON · 4300');
    assert.equal(statusItem.color.id,'testing.iconPassed');

    configuredPort=4400;
    configChanged({affectsConfiguration:key=>key==='multi-shell-mcp.port'});
    await delay(60);
    assert.ok(events.includes('started:4400'));
    assert.equal(configuredPort,4300,'Failed change must restore the original configuration');
    assert.ok(events.filter(x=>x==='started:4300').length>=2,'Previous port must restart');
    assert.equal(statusItem.text,'MultiShell MCP: ON · 4300');
    assert.ok(alerts.some(x=>x.includes('4400')),'Failed port must be reported');
    const before=events.length;
    configuredTools={file:true,edit:false,shell:true};
    configChanged({affectsConfiguration:key=>key==='multi-shell-mcp.enabledTools'});
    await delay(60);
    assert.ok(events.length>before,'Changing tool permissions must restart the running server');
    assert.ok(events.filter(x=>x==='started:4300').length>=3,
      'The shared port must be preserved while tool permissions change');
    configuredPort=4500;
    configChanged({affectsConfiguration:key=>key==='multi-shell-mcp.port'});
    await delay(25);
    configuredPort=4600;
    configChanged({affectsConfiguration:key=>key==='multi-shell-mcp.port'});
    await delay(270);
    assert.ok(events.includes('started:4500'));
    assert.ok(events.includes('started:4600'),'A newer port change must not be ignored');
    assert.equal(statusItem.text,'MultiShell MCP: ON · 4600');
    console.log('PASS: port rollback, live tool-permission reload, queued rapid config changes, preserved terminals');
  }finally{await extension.deactivate();assert.ok(events.includes('preserved:4600'),'Extension unload must preserve VSCode terminals');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});