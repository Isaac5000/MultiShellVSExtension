'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const calls=[];
let statusItem;
let workspaceDir;
const commandHandlers=new Map();
let copiedSkill;
let desiredSkill='quick-skill';
let desiredPath;
let lastPickerItems=[];
let lastPickerTitle;
let lastWarning;
const vscode={
 ThemeColor:class{constructor(id){this.id=id;}},
 StatusBarAlignment:{Right:2},
 window:{
  createOutputChannel:()=>({appendLine(){},show(){},dispose(){}}),
  createStatusBarItem:()=>{statusItem={show(){calls.push('status')},dispose(){},text:'',tooltip:'',color:null};return statusItem;},
  registerWebviewViewProvider:()=>({dispose(){calls.push('panel-disposed')}}),
  showInformationMessage:()=>{},
  showWarningMessage:async message=>{lastWarning=message;return undefined;},
  showQuickPick:async (items,options)=>{
   lastPickerItems=items;
   lastPickerTitle=options.title;
   return items.find(item=>item.name===desiredSkill&&
    (!desiredPath||item.skillPath===desiredPath));
  },
  showErrorMessage:(message)=>{throw Error(message);}
 },
 commands:{registerCommand:(name,callback)=>{calls.push(name);commandHandlers.set(name,callback);return{dispose(){}}}},
 workspace:{workspaceFolders:[{uri:{fsPath:''}}],
  getConfiguration:()=>({get:(key)=>key==='defaultEnabled'||key==='globalCodexSkills'?false:
   key==='port'?3000:key==='enabledTools'?{file:true,edit:true,shell:true}:undefined}),
  onDidChangeConfiguration:()=>({dispose(){}})},
 env:{language:'en',clipboard:{writeText:async value=>{copiedSkill=value;}}},
 Uri:{joinPath:(base,...rest)=>({fsPath:path.join(base.fsPath||'',...rest)})}
};
const mod=proxyquire('../dist/extension.js',{vscode});
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'extension-startup-'));
 workspaceDir=temp;
 vscode.workspace.workspaceFolders[0].uri.fsPath=temp;
 const source=path.join(temp,'.agents','skills','quick-skill');
 fs.mkdirSync(source,{recursive:true});
 fs.writeFileSync(path.join(source,'SKILL.md'),'---\nname: quick-skill\ndescription: Quick selection test\n---\n');
 const duplicate=path.join(temp,'.github','skills','quick-skill');
 fs.mkdirSync(duplicate,{recursive:true});
 fs.writeFileSync(path.join(duplicate,'SKILL.md'),
  '---\nname: quick-skill\ndescription: Duplicate from GitHub\n---\n');
 // A picker limited to the first 100 catalog results cannot find z-last.
 for(let i=0;i<110;i++){
  const name='a-'+String(i).padStart(3,'0');
  const directory=path.join(temp,'.agents','skills',name);
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'SKILL.md'),
   '---\nname: '+name+'\ndescription: Generated picker test\n---\n');
 }
 const tail=path.join(temp,'.agents','skills','z-last');
 fs.mkdirSync(tail,{recursive:true});
 fs.writeFileSync(path.join(tail,'SKILL.md'),
  '---\nname: z-last\ndescription: Skill beyond first catalog page\n---\n');
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
  assert.ok(calls.includes('multi-shell-mcp.listSkills'));
  for(const name of ['tunnelInstall','tunnelConfigure','tunnelReuseProfile',
    'tunnelUpdateKey','tunnelStart','tunnelStop','tunnelStatus','tunnelAutoStart']){
    assert.ok(commandHandlers.has('multi-shell-mcp.'+name),
      'Missing explicit local tunnel command: '+name);
  }
  desiredSkill='z-last';
  await commandHandlers.get('multi-shell-mcp.listSkills')();
  assert.ok(lastPickerItems.some(item=>item.name==='z-last'),
   'Picker must enumerate catalog pages beyond the first 100');
  assert.match(lastPickerItems.find(item=>item.name==='z-last').detail,
   /Skill beyond first catalog page/,'Picker should display the skill description');
  assert.equal(copiedSkill,'z-last','Unique skills should copy just the name');
  assert.match(lastPickerTitle,/Available skills/,
   'English VS Code must show an English picker title');
  desiredSkill='quick-skill';
  desiredPath='.agents/skills/quick-skill';
  await commandHandlers.get('multi-shell-mcp.listSkills')();
  assert.equal(copiedSkill,desiredPath,
   'Ambiguous skills must copy their exact project-relative skill_path');
  desiredPath='.github/skills/quick-skill';
  await commandHandlers.get('multi-shell-mcp.listSkills')();
  assert.equal(copiedSkill,desiredPath,
   'Identical names from different sources cannot be conflated');
  // A window without a project must not advertise the extension host cwd.
  const originalFolders=vscode.workspace.workspaceFolders;
  vscode.workspace.workspaceFolders=[];
  const previousCopy=copiedSkill;
  await commandHandlers.get('multi-shell-mcp.listSkills')();
  assert.equal(copiedSkill,previousCopy);
  assert.match(lastWarning,/open a workspace folder/i);
  vscode.workspace.workspaceFolders=originalFolders;
  // The quick picker must honor the VS Code display language.
  vscode.env.language='es';
  desiredSkill='z-last';
  desiredPath=undefined;
  await commandHandlers.get('multi-shell-mcp.listSkills')();
  assert.match(lastPickerTitle,/Skills disponibles/);
  vscode.env.language='en';
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