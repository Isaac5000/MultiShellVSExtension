const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const proxyquire = require('proxyquire').noCallThru();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const calls = [];
let handler;
let dispose;
const sent = [];
const conf = {};
let port = 3000;
let closeDecision;
const userShells=[];
const requests=[{request_id:'abc123',shell_id:'awaiting',cwd:'C:\\projects\\project\\other',share:false}];
let windowAutoExit=true;
let overrides={};
const mock = {
  env: {
    language: 'es-ES',
    clipboard: { writeText: async text => calls.push(['clipboard', text]) }
  },
  ConfigurationTarget: {Global:1},
  workspace: {getConfiguration:()=>({
    get:key=>key==='port'?port:undefined,
    update:async(key,value,target)=>{
      assert.equal(key,'port');
      assert.equal(target,1);
      port=value;
      calls.push(['port',value]);
    }
  })},
  Uri: {
    joinPath: (base, ...fragments) => ({
      toString: () => [String(base), ...fragments].join('/'),
      fsPath: [String(base), ...fragments].join('/')
    })
  },
  commands: { executeCommand: async name => calls.push(['command', name]) },
  window: {showInputBox:async options=>{calls.push(['prompt', options.value]);return 'minecraft';},
    showWarningMessage:async(message,options,action)=>{
      calls.push(['confirmPrompt',message,options?.modal,action]);
      return action==='Confirm idle'||action==='Confirmar disponible'?action:closeDecision;
    }}
};
const { MultiShellPanel } = proxyquire('../out/panel.js', { vscode: mock });
const ctx = {
  extensionUri: 'file:///example-extension',
  subscriptions: [],
  workspaceState: {
    get: (key, def) => conf[key] || def,
    update: async (key, value) => {
      conf[key] = value;
    }
  }
};
const controller = {
  primaryShellId: 'main-project-abcdef01',
  async panelState() {
    return {
      role: 'hub',
      windowId: 'project-abcdef01',
      workspace: 'C:\\projects\\project',
      primary: 'main-project-abcdef01',
      requests: requests.slice(),
      windowAutoExit,
      shells: [
        {
          shell_id: 'main-project-abcdef01',
          initial_cwd: 'C:\\projects\\project',
          busy: false,
          queued: 0
        },
        ...userShells
      ],
      windows: [
        {
          window_id: 'project-abcdef01',
          workspace: 'C:\\projects\\project',
          online: true
        }
      ]
    };
  },
  panelCreateShell: async (id, cwd, shared) => {
    calls.push(['create', id, cwd, shared]);
    const created={shell_id:id,initial_cwd:cwd,origin:'user',busy:false,queued:0};
    userShells.push(created);
    return created;
  },
  panelCloseShell: async id => {
    if(userShells.some(shell=>shell.shell_id===id)){
      const action='Close user terminal';
      const accepted=await mock.window.showWarningMessage(
        'Close persistent user shell '+id+'?',{modal:true},action);
      if(accepted!==action){throw new Error('User terminal closure was not approved.');}
    }
    calls.push(['close',id]);
    const idx=userShells.findIndex(x=>x.shell_id===id);
    if(idx>=0){userShells.splice(idx,1);}
  },
  panelConfirmRestoredShell: async id => {calls.push(['confirmRestored',id]);return {shell_id:id,recovery_required:false};},
  panelSetAlias: async(id,alias)=>{calls.push(['alias',id,alias]);return {shell_id:id,alias};},
  panelShowShell: id => calls.push(['show', id]),
  panelSetWindowAutoExit: enabled =>{windowAutoExit=enabled;calls.push(['window-auto',enabled]);},
  panelSetShellAutoExit:(id,value)=>{
    if(value===undefined){delete overrides[id];}else{overrides[id]=value;}
    calls.push(['shell-auto',id,value]);
  },
  panelGetShellOverrides:()=>({...overrides}),
  panelDecideUserRequest:(id,approve)=>{
    const index=requests.findIndex(x=>x.request_id===id);
    if(index<0){return false;}
    requests.splice(index,1);
    calls.push(['request',id,approve]);
    return true;
  }
};
const view = {
  webview: {
    asWebviewUri: uri => uri,
    onDidReceiveMessage: fn => {
      handler = fn;
      return { dispose() {} };
    },
    postMessage: async message => {
      sent.push(message);
      return true;
    }
  },
  onDidDispose: fn => {
    dispose = fn;
    return { dispose() {} };
  }
};
async function main() {
  assert.equal(MultiShellPanel.viewType, 'multi-shell-mcp.sessions');
  const panel = new MultiShellPanel(ctx, () => controller);
  panel.resolveWebviewView(view);
  await wait(30);
  assert.match(view.webview.html, /id="shellForm"/);
  assert.match(view.webview.html, /id="tabRequests"/);
  assert.match(view.webview.html, /id="requestsPage"/);
  assert.match(view.webview.html, /id="windowInteractive"/);
  assert.equal(sent.findLast(m=>m.type==='state').snapshot.requests.length,1);
  assert.match(view.webview.html, /media\/panel.js/);
  assert.match(view.webview.html, /Content-Security-Policy/);
  assert.equal(sent.findLast(m => m.type === 'state').language, 'es');
  assert.doesNotMatch(view.webview.html, /id="language"/);
  // Locale follows VS Code; an old manual preference must have no effect.
  conf.multiShellPanelLanguage='en';
  mock.env.language='fr-FR';
  await panel.refresh();
  assert.equal(sent.findLast(m=>m.type==='state').language,'en');
  mock.env.language='es-ES';
  await panel.refresh();
  assert.equal(sent.findLast(m=>m.type==='state').language,'es');
  handler({
    type: 'create',
    id: 'my_shell',
    cwd: 'C:\\projects\\project',
    share: true
  });
  handler({ type: 'show', id: 'main-project-abcdef01' });
  handler({ type: 'alias', id: 'main-project-abcdef01' });
  // Exercise closing separately so persistence can be checked before deletion.

  handler({ type: 'copy', value: 'my_shell' });
  await wait(60);
  assert.equal(conf.multiShellUserSessions?.find(x=>x.shell_id==='my_shell')?.origin,undefined);
  assert.equal(conf.multiShellUserSessions?.find(x=>x.shell_id==='my_shell')?.initial_cwd,'C:\\projects\\project');
  handler({type:'window_interactive',value:false});
  await wait(25);
  assert.equal(windowAutoExit,false);
  assert.equal(conf.multiShellWindowAutoExit,false);
  handler({type:'shell_interactive',id:'my_shell',value:true});
  await wait(25);
  assert.equal(overrides.my_shell,true);
  assert.equal(conf.multiShellInteractiveShellOverrides.my_shell,true);
  handler({type:'shell_interactive',id:'my_shell',value:null});
  await wait(25);
  assert.equal(overrides.my_shell,undefined);
  handler({type:'request_decision',id:'abc123',value:false});
  await wait(25);
  assert.ok(calls.some(x=>x[0]==='request'&&x[1]==='abc123'&&x[2]===false));
  assert.equal(sent.findLast(m=>m.type==='state').snapshot.requests.length,0);
  handler({type:'confirm_restore',id:'old_user'});
  await wait(30);
  assert.ok(calls.some(x=>x[0]==='confirmRestored'&&x[1]==='old_user'));
  handler({type:'port',value:4217});
  await wait(30);
  assert.equal(port,4217);
  assert.ok(calls.some(x=>x[0]==='port'&&x[1]===4217));
  handler({type:'port',value:100});
  await wait(30);
  assert.equal(port,4217,'Invalid port must not be stored');
  assert.ok(sent.some(x=>x.type==='error'&&/1024/.test(x.text)));
  assert.match(view.webview.html,/id="portForm"/);
  assert.match(view.webview.html,/id="portInput"/);
  assert.deepEqual(
    calls.find(x => x[0] === 'create'),
    ['create', 'my_shell', 'C:\\projects\\project', true]
  );
  assert.ok(calls.some(x => x[0] === 'show'));
  assert.ok(calls.some(x => x[0] === 'alias' && x[2] === 'minecraft'));
  assert.equal(conf.multiShellPrimaryAlias,'minecraft');
  // Native confirmation must guard the physical close.
  closeDecision=undefined;
  handler({type:'close',id:'my_shell'});
  await wait(30);
  assert.ok(sent.some(x=>x.type==='closeCancelled'&&x.id==='my_shell'));
  assert.equal(calls.filter(x=>x[0]==='close').length,0);
  assert.equal(conf.multiShellUserSessions?.some(x=>x.shell_id==='my_shell'),true);
  assert.ok(calls.some(x=>x[0]==='confirmPrompt'&&x[2]===true&&x[3]==='Close user terminal'));
  closeDecision='Close user terminal';
  handler({type:'close',id:'my_shell'});
  await wait(30);
  assert.equal(conf.multiShellUserSessions?.some(x=>x.shell_id==='my_shell'),false);
  assert.ok(calls.some(x=>x[0]==='close'&&x[1]==='my_shell'));
  assert.ok(sent.some(x=>x.type==='notice'&&x.key==='closed'));
  handler({type:'close',id:'main-project-abcdef01'});
  await wait(30);
  assert.equal(calls.filter(x=>x[0]==='close').length,1,'primary must never be closed from panel');
  assert.ok(calls.some(x => x[0] === 'clipboard'));
  dispose();
  panel.dispose();
  for (const name of [
    'media/panel.js',
    'media/panel.css',
    'media/multishell.svg',
    'package.nls.json',
    'package.nls.es.json'
  ]) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", name)),
      'Missing bundled panel asset: ' + name
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", 'package.json'), 'utf8')
  );
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(
    manifest.contributes.views['multi-shell-mcp'].some(
      v => v.id === 'multi-shell-mcp.sessions'
    )
  );
  const win = fs.readFileSync(
    path.join(__dirname, "..", 'src/multi-window.ts'),
    'utf8'
  );
  assert.match(win, /this\.ensurePrimary\(\);/);
  console.log(
    'PASS: panel locale follows VS Code, user controls, bundled assets and automatic main-shell registration'
  );
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});