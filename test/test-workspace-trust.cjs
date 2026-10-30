'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8'));
assert.deepEqual(pkg.capabilities.untrustedWorkspaces.supported,false,
  'The extension must opt OUT of Restricted Mode at the VSCode manifest level');
assert.match(pkg.capabilities.untrustedWorkspaces.description,/shell|commands|MCP/i);

const commands=new Map();
const errors=[],steps=[];
const vscode={
 ThemeColor:class {constructor(id){this.id=id;}},
 StatusBarAlignment:{Right:2},
 workspace:{
  isTrusted:false,
  workspaceFolders:[{uri:{fsPath:'C:\\Project'}}],
  getConfiguration:()=>({get:(key)=>({
   port:3000,defaultEnabled:true,enabledTools:{file:true,edit:true,shell:true}
  })[key]}),
  onDidChangeConfiguration:()=>({dispose(){}})
 },
 window:{
  createStatusBarItem:()=>({show(){},dispose(){},text:'',color:null,tooltip:''}),
  registerWebviewViewProvider:()=>({dispose(){}}),
  showErrorMessage:message=>errors.push(String(message)),
  showInformationMessage:()=>{}
 },
 commands:{
  registerCommand:(name,cb)=>{
   commands.set(name,cb);
   return{dispose(){commands.delete(name);}};
  }
 }
};
class FakeController {
 constructor(port,_secret,_workspace,_factory,status){
  this.listeningPort=port;this.status=status;steps.push('construct');
 }
 async start(){steps.push('start');this.status('hub','trusted');}
 async stop(){steps.push('stop');}
}
const extension=proxyquire('../out/extension.js',{
 vscode,
 './multi-window':{MultiWindowController:FakeController,WindowRouter:class{},getSecret:()=>{steps.push('secret');return 'token';}},
 './server':{MCPServer:class{}},
 './panel':{MultiShellPanel:class{static viewType='multi-shell-mcp.sessions';refresh(){}dispose(){}}},
 './utils/logger':{logger:{info(){},warn(){},error(){},dispose(){}}}
});
const globalState=new Map([['multiShellMcpEnabled',true]]);
const context={
 subscriptions:[],
 globalStorageUri:{fsPath:'C:\\Project\\storage'},
 workspaceState:{get:()=>undefined,update:async()=>{}},
 globalState:{
  get:(k,d)=>globalState.has(k)?globalState.get(k):d,
  update:async(k,v)=>{globalState.set(k,v);}
 }
};
async function main(){
 try{
  await extension.activate(context);
  assert.deepEqual(steps,[],'Autostart must not bind the server or create a shell in an untrusted workspace');
  assert.equal(commands.has('multi-shell-mcp.toggleServer'),true);
  await commands.get('multi-shell-mcp.toggleServer')();
  assert.deepEqual(steps,[],'Manual server start must be denied in an untrusted workspace');
  assert.equal(globalState.get('multiShellMcpEnabled'),true,'Trust refusal must not rewrite user preference');
  assert.ok(errors.some(s=>/confianza|Trust/i.test(s)));

  vscode.workspace.isTrusted=true;
  await commands.get('multi-shell-mcp.toggleServer')();
  assert.deepEqual(steps,['secret','construct','start'],'Once trusted, normal start should work');
  await commands.get('multi-shell-mcp.toggleServer')();
  assert.deepEqual(steps,['secret','construct','start','stop'],'Normal stop should still work');
  console.log('PASS: Workspace Trust manifest disables Restricted Mode; autostart and manual start blocked; normal trusted start/stop');
 }finally{await extension.deactivate();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
