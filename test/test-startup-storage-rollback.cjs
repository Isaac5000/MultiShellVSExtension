'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
let created=0,started=0,stopped=0, failStorage=true;
const errors=[],commands=new Map();
let indicator;
const vscode={
  ThemeColor:class{constructor(id){this.id=id;}},
  StatusBarAlignment:{Right:2},
  workspace:{
    isTrusted:true,workspaceFolders:[{uri:{fsPath:process.cwd()}}],
    getConfiguration:()=>({get:key=>({port:3000,defaultEnabled:true,enabledTools:{file:true,edit:true,shell:true}})[key]}),
    onDidChangeConfiguration:()=>({dispose(){}})
  },
  window:{
    createStatusBarItem:()=>indicator={text:'',show(){},dispose(){}},
    registerWebviewViewProvider:()=>({dispose(){}}),
    showErrorMessage:error=>errors.push(String(error)),
    showInformationMessage:()=>{}
  },
  commands:{
    registerCommand:(name,handler)=>{commands.set(name,handler);return{dispose(){commands.delete(name);}};}
  }
};
class Controller{
  listeningPort=3000;
  primaryShellId='main-startup-test-12345678';
  constructor(){created++;}
  async start(){started++;}
  async stop(preserve){stopped++;assert.equal(preserve,true,'Failed startup must preserve user terminals');}
}
const extension=proxyquire('../out/extension.js',{
  vscode,
  './multi-window':{MultiWindowController:Controller,WindowRouter:class{},getSecret:()=> 'token'},
  './server':{MCPServer:class{}},
  './panel':{MultiShellPanel:class{static viewType='multi-shell-mcp.sessions';refresh(){}dispose(){}}},
  './utils/logger':{logger:{info(){},warn(){},error(){},dispose(){}}}
});
const state={
  globalStorageUri:{fsPath:process.cwd()},subscriptions:[],
  globalState:{get:()=>true,update:async()=>{}},
  workspaceState:{
    get:()=>undefined,
    update:async key=>{if(failStorage && key==='multiShellPrimaryId')throw new Error('Simulated persistent storage failure');}
  }
};
(async()=>{
  await extension.activate(state);
  assert.equal(started,1);
  assert.equal(stopped,1,'The already-started hub must be closed on storage failure');
  assert.match(indicator.text,/OFF/,'Failed startup cannot claim online status');
  assert.equal(errors.length,1,'Failure should still be reported');
  failStorage=false;
  await commands.get('multi-shell-mcp.toggleServer')();
  assert.equal(started,2,'A later retry must work');
  assert.match(indicator.text,/ON/);
  await extension.deactivate();
  assert.equal(stopped,2,'Normal deactivation should also release the hub');
  console.log('PASS: persistence failure rolls back running hub, reports OFF, preserves terminal, and permits a clean retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
