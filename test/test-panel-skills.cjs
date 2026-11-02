'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();
const skills=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-panel-skills-'));
const owner=path.join(root,'owner'),other=path.join(root,'other'),home=path.join(root,'home');
let panel,handler,scans=0,globalEnabled=false,fileEnabled=true,trusted=true,controller;
const sent=[],clipboard=[],commands=[];
function write(base,name,description,source='.agents/skills'){
  const target=path.join(base,source,name,'SKILL.md');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# Instructions\n`);
}
const view={webview:{asWebviewUri:uri=>uri,
  onDidReceiveMessage:fn=>{handler=fn;},postMessage:async value=>{sent.push(value);return true;}},onDidDispose:()=>{}};
const mock={env:{language:'es',clipboard:{writeText:async text=>clipboard.push(text)}},
  Uri:{joinPath:(base,...parts)=>({toString:()=>[base,...parts].join('/')})},
  commands:{executeCommand:async(...args)=>commands.push(args)},
  workspace:{get isTrusted(){return trusted;},workspaceFolders:[{uri:{fsPath:other}}],
    getConfiguration:()=>({get:key=>({globalCodexSkills:globalEnabled,enabledTools:{file:fileEnabled},port:3000})[key]})}};
const context={extensionUri:'file:///'+path.resolve(__dirname,'..').replaceAll('\\','/'),subscriptions:[],
  workspaceState:{get:(_key,value)=>value,update:async()=>{}}};
const {MultiShellPanel}=proxyquire('../out/panel.js',{vscode:mock,'./tools/agent-skills':{
  listWorkspaceSkills:(base,options)=>{scans++;return skills.listWorkspaceSkills(base,{...options,homeDir:home});},
  readWorkspaceSkill:(base,selected,options)=>skills.readWorkspaceSkill(base,selected,{...options,homeDir:home})
}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function send(message){handler(message);await tick();return sent.at(-1);}
async function main(){
  for(let i=0;i<83;i++){write(owner,`skill-${String(i).padStart(3,'0')}`,i===82?'Last skill for accessibility':'Instructions for building');}
  write(owner,'skill-000','Duplicate name from GitHub','.github/skills');
  write(other,'foreign-only','Foreign workspace instructions');
  write(home,'private-skill','Personal instructions');
  controller={worker:{workspace:owner},primaryShellId:'main-owner',panelState:async()=>({
    workspace:owner,windowId:'owner-id',shells:[{shell_id:'main-owner',initial_cwd:owner,busy:true,queued:0}],windows:[],requests:[]})};
  panel=new MultiShellPanel(context,()=>controller);
  panel.resolveWebviewView(view);
  await tick();
  assert.equal(scans,0,'Periodic panel state must not rescan skills');
  const search=(id,extra={})=>send({type:'skills',requestId:id,query:'',scope:'all',...extra});
  let result=await search(1);
  assert.equal(result.type,'skills_result');
  assert.equal(result.skills.length,40);
  assert.equal(result.next_cursor,'40');
  assert.ok(!result.skills.some(s=>s.name==='foreign-only'),'Local controller root wins over other workspace/cwd');
  const first=result.skills;
  result=await search(2,{cursor:result.next_cursor});
  assert.equal(result.skills.length,40);
  result=await search(3,{cursor:result.next_cursor});
  assert.equal(result.skills.length,4);
  assert.equal(result.next_cursor,undefined);
  result=await search(4,{query:'ACCESSIBILITY'});
  assert.deepEqual(result.skills.map(s=>s.name),['skill-082'],'Search must reach beyond the first page');
  result=await search(5,{query:'skill-000'});
  assert.equal(result.skills.length,2,'Duplicate names retain exact selectable paths');
  await send({type:'skill_copy',value:'.github/skills/skill-000'});
  assert.match(clipboard.at(-1),/load_skill_code/);
  assert.match(clipboard.at(-1),/"shell_id":"main-owner"/);
  assert.match(clipboard.at(-1),/"skill":".github\/skills\/skill-000"/);
  assert.match(clipboard.at(-1),/"scope":"project"/);
  assert.ok(!commands.length,'Copying a skill never executes a terminal command');
  const copies=clipboard.length;
  await send({type:'skill_copy',value:'@global/agents/private-skill'});
  assert.equal(clipboard.length,copies);
  globalEnabled=true;
  result=await search(6,{scope:'global'});
  assert.deepEqual(result.skills.map(s=>s.name),['private-skill']);
  await send({type:'skill_copy',value:'@global/agents/private-skill'});
  assert.match(clipboard.at(-1),/"scope":"global"/);
  let release;
  const originalState=controller.panelState;
  controller.panelState=()=>new Promise(resolve=>{release=async()=>resolve(await originalState());});
  handler({type:'skill_copy',value:'@global/agents/private-skill'});
  await tick();
  globalEnabled=false;
  await release();await tick();
  assert.equal(clipboard.length,copies+1,'Revoked permission while awaiting state must stop copy');
  controller.panelState=originalState;
  for(const value of ['../other/foreign-only','C:/outside','.agents/skills/skill-000/../../private']){
    await send({type:'skill_copy',value});
  }
  assert.equal(clipboard.length,copies+1,'Forged paths must not be copied');
  const count=scans;
  for(const extra of [{query:'a'.repeat(101)},{scope:'other'},{cursor:'../x'},{requestId:-1}]){
    assert.ok((await search(7,extra)).error);
  }
  assert.equal(scans,count,'Invalid messages must fail before filesystem access');
  trusted=false;
  assert.ok((await search(8)).error);
  trusted=true;fileEnabled=false;
  assert.ok((await search(9)).error);
  assert.equal(scans,count,'Trust and file permission checks precede discovery');
  fileEnabled=true;controller=undefined;
  result=await search(10);
  assert.deepEqual(result.skills.map(s=>s.name),['foreign-only'],'Offline catalog uses the open local workspace');
  await send({type:'skill_copy',value:'.agents/skills/foreign-only'});
  assert.equal(clipboard.length,copies+1,'Offline copy explains that MCP must be started');
  await send({type:'skill_settings'});
  assert.deepEqual(commands,[['workbench.action.openSettings','multi-shell-mcp.globalCodexSkills']],
    'Settings action never enables global reading itself');
  mock.env.language='en';
  controller={worker:{workspace:owner},primaryShellId:'main-owner',panelState:originalState};
  await send({type:'skill_copy',value:first[0].skill_path});
  assert.match(clipboard.at(-1),/^Use the /);
  if(process.argv.includes('--preview')){
    const target=path.resolve(__dirname,'../.vscode-test/panel-skills-preview.html');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const fixture={snapshot:{running:true,skillsEnabled:true,globalSkillsEnabled:false,workspace:owner,windowId:'owner-id',primary:'main-owner',
      role:'hub',port:3000,shells:[{shell_id:'main-owner',alias:'multishell',initial_cwd:owner,busy:false,queued:0}],windows:[],
      requests:[{request_id:'request-1',shell_id:'build-terminal',cwd:owner,share:false}]},skills:skills.listWorkspaceSkills(owner,{limit:100}).skills};
    const bootstrap=`<script>const fixture=${JSON.stringify(fixture)}; window.messages=[]; window.acquireVsCodeApi=()=>({postMessage:m=>{messages.push(m);queueMicrotask(()=>{if(m.type==='refresh') window.postMessage({type:'state',snapshot:fixture.snapshot,language:'es'},'*'); if(m.type==='skills'){const all=fixture.skills.filter(s=>(s.name+' '+s.description).toLowerCase().includes(m.query.toLowerCase()));const start=Number(m.cursor||0);window.postMessage({type:'skills_result',requestId:m.requestId,skills:all.slice(start,start+40),next_cursor:all.length>start+40?String(start+40):undefined},'*');}})}});</script>`;
    const html=view.webview.html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/,'')
      .replace('<body>','<body>'+bootstrap).replace('</head>',`<style>:root{--vscode-sideBar-background:#181818;--vscode-editor-background:#202020;--vscode-foreground:#ddd;--vscode-descriptionForeground:#aaa;--vscode-panel-border:#424242;--vscode-input-background:#303030;--vscode-input-foreground:#eee;--vscode-button-background:#1473b3;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#383838;--vscode-button-secondaryForeground:#eee;--vscode-focusBorder:#3794ff;--vscode-badge-background:#444;--vscode-badge-foreground:#fff}body{max-width:330px}</style></head>`);
    fs.writeFileSync(target,html);console.log('Preview: '+target);
  }
  console.log('PASS: local window skill browser, pagination/search, exact-path ChatGPT copy, offline discovery, permissions and stale-copy rejection');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{panel?.dispose();fs.rmSync(root,{recursive:true,force:true});});
