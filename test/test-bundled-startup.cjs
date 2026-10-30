'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const calls=[];
let statusItem;
const vscode={
 ThemeColor:class{constructor(id){this.id=id;}},
 StatusBarAlignment:{Right:2},
 window:{
  createOutputChannel:()=>({appendLine(){},show(){},dispose(){}}),
  createStatusBarItem:()=>{statusItem={show(){calls.push('status')},dispose(){},text:'',tooltip:'',color:null};return statusItem;},
  registerWebviewViewProvider:()=>({dispose(){calls.push('panel-disposed')}}),
  showInformationMessage:()=>{},
  showErrorMessage:(message)=>{throw Error(message);}
 },
 commands:{registerCommand:(name,callback)=>{calls.push(name);return{dispose(){}}}},
 workspace:{getConfiguration:()=>({get:(key)=>key==='defaultEnabled'?false:key==='port'?3000:{file:true,edit:true,shell:true}}),onDidChangeConfiguration:()=>({dispose(){}})},
 env:{language:'en'},
 Uri:{joinPath:(base,...rest)=>({fsPath:path.join(base.fsPath||'',...rest)})}
};
const mod=proxyquire('../dist/extension.js',{vscode});
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'extension-startup-'));
 const ctx={
  subscriptions:[],
  workspaceState:{get:(_k,def)=>def,update:async()=>{}},
  globalState:{get:(_k,def)=>def,update:async()=>{}},
  extensionUri:{fsPath:temp},
  globalStorageUri:{fsPath:path.join(temp,'storage')}
 };
 try{
  await mod.activate(ctx);
  assert.ok(calls.includes('multi-shell-mcp.toggleServer'));
  assert.ok(calls.includes('multi-shell-mcp.showServerInfo'));
  assert.ok(calls.includes('status'));
  assert.equal(statusItem.text,'MultiShell MCP: OFF');
  assert.equal(statusItem.color.id,'editorWarning.foreground');
  assert.equal(statusItem.tooltip,'Iniciar MultiShell MCP');
  assert.equal(mod.statusIndicator(true).text,'MultiShell MCP: ON');
  assert.equal(mod.statusIndicator(true,4242).text,'MultiShell MCP: ON · 4242');
  assert.equal(mod.statusIndicator(true).color.id,'testing.iconPassed');
  assert.equal(mod.statusIndicator(false).text,'MultiShell MCP: OFF');
  assert.ok(ctx.subscriptions.length>=3);
  await mod.deactivate();
  console.log('PASS: bundled extension activate/deactivate, panel and command registration on Windows mock');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});