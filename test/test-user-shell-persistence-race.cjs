'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let controller,created,aliasChanged,panelSave,panelDelete,closedCallback;
const persisted=new Map();
const context={
  subscriptions:[],
  globalStorageUri:{fsPath:process.cwd()},
  globalState:{get:()=>true,update:async()=>{}},
  workspaceState:{
    get:(key,fallback)=>persisted.has(key)?persisted.get(key):fallback,
    update:async(key,value)=>{
      if(key==='multiShellUserSessions'){await sleep(70);}
      persisted.set(key,value);
    }
  }
};
const vscode={
  ThemeColor:class{constructor(id){this.id=id;}},
  StatusBarAlignment:{Right:2},
  workspace:{
    isTrusted:true,
    workspaceFolders:[{uri:{fsPath:process.cwd()}}],
    getConfiguration:()=>({get:key=>({port:3000,defaultEnabled:true,enabledTools:{file:true,edit:true,shell:true}})[key]}),
    onDidChangeConfiguration:()=>({dispose(){}})
  },
  window:{
    createStatusBarItem:()=>({text:'',show(){},dispose(){}}),
    registerWebviewViewProvider:()=>({dispose(){}}),
    onDidCloseTerminal:fn=>{closedCallback=fn;return{dispose(){}};},
    showErrorMessage:()=>{},showInformationMessage:()=>{}
  },
  commands:{registerCommand:()=>({dispose(){}})}
};
class FakeController{
  listeningPort=3000;
  primaryShellId='main-project-abcdef01';
  constructor(...args){
    controller=this;
    aliasChanged=args[8];
    created=args[9];
  }
  async start(){}
  async stop(){}
}
class FakePanel{
  static viewType='multi-shell-mcp.sessions';
  constructor(_context,_getController,save,forget){
    panelSave=save;panelDelete=forget;
  }
  async refresh(){}
  dispose(){}
}
const extension=proxyquire('../out/extension.js',{
  vscode,
  './multi-window':{MultiWindowController:FakeController,WindowRouter:class{},getSecret:()=> 'a'.repeat(64)},
  './server':{MCPServer:class{}},
  './panel':{MultiShellPanel:FakePanel},
  './utils/logger':{logger:{info(){},warn(){},error(){},dispose(){}}}
});
const get=()=>context.workspaceState.get('multiShellUserSessions',[]);
const session=(shell_id)=>({shell_id,initial_cwd:process.cwd(),origin:'user'});
(async()=>{
  await extension.activate(context);
  assert.ok(controller);
  assert.equal(typeof created,'function');
  const concurrent=Promise.all([
    created(session('user_one')),
    created(session('user_two'))
  ]);
  await concurrent;
  assert.deepEqual(get().map(x=>x.shell_id).sort(),['user_one','user_two'],
    'Two simultaneous approved creations must both be persisted');

  await Promise.all([
    aliasChanged('user_one','one_alias'),
    created(session('user_three')),
    panelSave(session('user_four'))
  ]);
  const saved=get();
  assert.equal(saved.length,4);
  assert.equal(saved.find(x=>x.shell_id==='user_one').alias,'one_alias');
  assert.ok(saved.some(x=>x.shell_id==='user_three'));
  assert.ok(saved.some(x=>x.shell_id==='user_four'));

  await Promise.all([
    panelDelete('user_two'),
    panelSave({...session('user_four'),alias:'four_alias'}),
    created(session('user_five'))
  ]);
  assert.equal(get().some(x=>x.shell_id==='user_two'),false);
  assert.equal(get().length,4);
  assert.equal(get().find(x=>x.shell_id==='user_four').alias,'four_alias');
  assert.equal(get().some(x=>x.shell_id==='user_five'),true);

  closedCallback({name:'MCP [user_five]'});
  await sleep(120);
  assert.equal(get().some(x=>x.shell_id==='user_five'),false,
    'Manual terminal closure must remove persisted session, even after concurrent writes');

  await extension.deactivate();
  console.log('PASS: concurrent approved user-shell creation, alias updates and removals are serialized without losing saved sessions');
})().catch(e=>{console.error(e);process.exitCode=1});
