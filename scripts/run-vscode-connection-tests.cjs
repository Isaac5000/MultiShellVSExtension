'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {resolveTestShell}=require('./test-shell-resolver.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.vscode-test','connection-windows');
const report={started:new Date().toISOString(),version:require('../package.json').version,checks:[]};
const profileRoot=path.join(base,'profiles-'+report.started.replace(/[^0-9]/g,''));
let port,requestId=0,commandId=0,token;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=label=>{try{return JSON.parse(fs.readFileSync(path.join(base,label+'-state.json'),'utf8'));}catch{return{};}};
const save=()=>fs.writeFileSync(path.join(base,'report.json'),JSON.stringify(report,null,2));
async function until(check,ms=20000){const begin=Date.now();while(Date.now()-begin<ms){if(await check())return;await wait(100);}throw Error('Condition timed out after '+ms+'ms');}
async function rpc(name,args={},timeout=6000){
 const response=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',signal:AbortSignal.timeout(timeout),
  headers:{'content-type':'application/json',accept:'application/json,text/event-stream',connection:'close','x-multishell-local-auth':token},
  body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method:'tools/call',params:{name,arguments:args}})});
 const text=await response.text();assert.equal(response.status,200);
 const row=text.split(/\r?\n/).find(line=>line.startsWith('data:'));const data=JSON.parse(row?row.slice(5):text);
 if(data.error||data.result?.isError)throw Error(data.result?.content?.[0]?.text||JSON.stringify(data.error));
 return JSON.parse(data.result.content[0].text);
}
const execute=(shell_id,command,timeout=12000)=>rpc('execute_shell_command_code',{shell_id,command,timeout},timeout+5000);
async function control(label,op){const id=++commandId;fs.writeFileSync(path.join(base,label+'-command.json'),JSON.stringify({id,op}));await until(()=>state(label).lastCommand===id&&state(label).stage==='ready');}
async function check(name,fn){report.stage=name;save();const begin=Date.now();try{const details=await fn();report.checks.push({name,passed:true,ms:Date.now()-begin,details});}catch(error){report.checks.push({name,passed:false,ms:Date.now()-begin,error:error.stack});throw error;}finally{save();}}
function psLiteral(value){return "'"+value.replace(/'/g,"''")+"'";}
function forceCloseOwnedProfiles(){
 const profiles=['A','B'].map(label=>path.join(profileRoot,label));
 const conditions=profiles.map(profile=>"$_.CommandLine.Contains('"+profile.replace(/'/g,"''")+"')").join(' -or ');
 const script="Get-CimInstance Win32_Process -Filter \"Name='Code.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('--user-data-dir') -and ("+conditions+") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
 spawnSync('powershell.exe',['-NoLogo','-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,stdio:'ignore'});
}
async function main(){
 if(process.platform!=='win32')throw Error('This multi-window fault harness currently targets Windows.');
 const code=process.env.VSCODE_EXECUTABLE||path.join(process.env.LOCALAPPDATA,'Programs/Microsoft VS Code/Code.exe');
 const shell=resolveTestShell();
 if(!fs.existsSync(code))throw Error('VS Code is required');
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 fs.mkdirSync(base,{recursive:true});token=crypto.randomBytes(32).toString('hex');
 const observer=path.join(base,'observer');fs.mkdirSync(observer,{recursive:true});
 fs.writeFileSync(path.join(observer,'package.json'),JSON.stringify({name:'connection-test-observer',
  displayName:'MultiShell Connection Test Observer',description:'Isolated connection and reload test observer',
  publisher:'local-multishell-test',version:'0.0.1',license:'MIT',engines:{vscode:'^1.99.0'},
  activationEvents:['onStartupFinished'],main:'./observer.cjs'}));
 fs.writeFileSync(path.join(observer,'README.md'),'# Test observer\nOnly for isolated MultiShell integration test profiles.\n');
 fs.writeFileSync(path.join(observer,'LICENSE'),'MIT License\nCopyright (c) 2026 MultiShell test fixture\n');
 fs.writeFileSync(path.join(observer,'observer.cjs'),"const vscode=require('vscode');\nexports.activate=()=>{void require("+
  JSON.stringify(path.join(root,'test/vscode-connection-window.cjs'))+").run().then(()=>vscode.commands.executeCommand('workbench.action.closeWindow'),error=>{console.error(error);return vscode.commands.executeCommand('workbench.action.closeWindow');});};\n");
 const observerVsix=path.join(base,'observer.vsix');
 const packaging=spawnSync(process.execPath,[path.join(root,'node_modules/@vscode/vsce/vsce'),'package',
  '--allow-missing-repository','--no-dependencies','--no-rewrite-relative-links','--out',observerVsix],
  {cwd:observer,encoding:'utf8',windowsHide:true,timeout:30000});
 if(packaging.status!==0)throw Error('Test observer packaging failed: '+packaging.stderr);
 const cliTemplate=/"(%~dp0[^"\r\n]*cli\.js)"/.exec(fs.readFileSync(path.join(path.dirname(code),'bin/code.cmd'),'utf8'))?.[1];
 if(!cliTemplate)throw Error('Could not locate the VS Code CLI entry point');
 const cli=path.resolve(path.join(path.dirname(code),'bin'),cliTemplate.slice('%~dp0'.length));
 const installing=spawnSync(code,[cli,'--user-data-dir',path.join(base,'installer-profile'),'--extensions-dir',path.join(base,'extensions'),
  '--install-extension',observerVsix,'--force'],{encoding:'utf8',windowsHide:true,timeout:30000,
   env:{...process.env,ELECTRON_RUN_AS_NODE:'1',VSCODE_DEV:''}});
 if(installing.status!==0)throw Error('Test observer installation failed: '+installing.stderr);
 function launch(label){
  const profile=path.join(profileRoot,label),workspace=path.join(base,'workspace-'+label);
  fs.mkdirSync(path.join(workspace,'jobs'),{recursive:true});fs.mkdirSync(path.join(profile,'User/globalStorage/local-multishell.multi-shell-mcp-server'),{recursive:true});
  fs.mkdirSync(path.join(base,'extensions'),{recursive:true});
  fs.writeFileSync(path.join(profile,'User/globalStorage/local-multishell.multi-shell-mcp-server/multishell-local-token'),token);
  fs.writeFileSync(path.join(profile,'User/settings.json'),JSON.stringify({
   'multi-shell-mcp.port':port,'multi-shell-mcp.defaultEnabled':false,
   'terminal.integrated.defaultProfile.windows':'AuditPwsh','terminal.integrated.profiles.windows':{AuditPwsh:{path:shell,args:[]}},
   'terminal.integrated.automationProfile.windows':{path:shell,args:[]},'terminal.integrated.enablePersistentSessions':true,
   'security.workspace.trust.enabled':false,'extensions.autoUpdate':false,'update.mode':'none','telemetry.telemetryLevel':'off','workbench.startupEditor':'none'}));
  fs.writeFileSync(path.join(base,label+'-state.json'),JSON.stringify({boot:0,stage:'launching'}));
  fs.writeFileSync(path.join(base,label+'-command.json'),JSON.stringify({id:0,op:'none'}));
  const stdout=fs.openSync(path.join(base,label+'-stdout.log'),'w'),stderr=fs.openSync(path.join(base,label+'-stderr.log'),'w');
  const child=spawn(code,['--user-data-dir',profile,'--extensions-dir',path.join(base,'extensions'),'--extensionDevelopmentPath',root,
   '--disable-workspace-trust',
   '--skip-welcome','--skip-release-notes','--new-window',workspace],{windowsHide:true,stdio:['ignore',stdout,stderr],
    env:{...process.env,MULTISHELL_CONNECTION_ROOT:base,MULTISHELL_CONNECTION_WINDOW:label,MULTISHELL_TEST_PORT:String(port),MULTISHELL_TEST_TOKEN_FILE:path.join(profile,'User/globalStorage/local-multishell.multi-shell-mcp-server/multishell-local-token')}});
  child.once('error',error=>{report.launchError=error.message;save();});fs.closeSync(stdout);fs.closeSync(stderr);
 }
 try{
  await check('two_real_windows_share_one_hub',async()=>{
   launch('A');await until(()=>state('A').stage==='ready',30000);
   launch('B');await until(()=>state('B').stage==='ready',30000);
   const windows=(await rpc('list_windows_code')).windows;assert.equal(windows.length,2);
   assert.notEqual(state('A').windowId,state('B').windowId);return {windows:windows.length};
  });
  for(const label of ['A','B'])await rpc('create_shell_code',{shell_id:'link_'+label,cwd:path.join(base,'workspace-'+label,'jobs'),window_id:state(label).windowId});
  await check('eighty_real_commands_across_two_windows',async()=>{
   // Preserve all 80 commands, but honor the 32-in-flight HTTP ceiling.
   for(let start=0;start<80;start+=20){
    const jobs=[];for(let i=start;i<start+20;i++)jobs.push(execute('link_'+(i%2?'B':'A'),"Write-Output 'WINDOW_JOB_"+i+"'",20000).then(value=>{
     assert.equal(value.exit_code,0);assert.ok(value.output.includes('WINDOW_JOB_'+i));
    }));
    await Promise.all(jobs);
   }
   return {commands:80};
  });
  await check('coordinator_loss_preserves_other_window_work_without_replay',async()=>{
   const marker=path.join(base,'workspace-B/jobs/failover-marker.txt');if(fs.existsSync(marker))fs.unlinkSync(marker);
   const task=execute('link_B',"Start-Sleep -Seconds 6; Add-Content -LiteralPath "+psLiteral(marker)+" -Value 'ONCE'; Write-Output 'FINISHED'",15000).then(value=>({value}),error=>({error:error.message}));
   await until(async()=>(await rpc('list_shells_code')).shells.find(shell=>shell.shell_id==='link_B')?.busy);
   const before=state('B').terminals?.find(t=>t.name==='MCP [link_B]')?.pid;
   await control('A','stop');
   await until(async()=>{try{return (await rpc('list_windows_code')).windows.some(w=>w.window_id===state('B').windowId);}catch{return false;}},15000);
   const interrupted=await task;assert.ok(interrupted.error,'The old request must report connection loss/cancellation');
   await until(()=>fs.existsSync(marker),15000);assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split(/\r?\n/),['ONCE']);
   assert.equal((await execute('link_B',"Write-Output 'AFTER_FAILOVER'")).exit_code,0);
   const after=state('B').terminals?.find(t=>t.name==='MCP [link_B]')?.pid;
   if(before&&after)assert.equal(before,after);return {executions:1,oldRequestFailed:true,sameProcess:before&&after?before===after:null};
  });
  await check('stopped_window_rejoins_existing_coordinator',async()=>{
   await control('A','start');await until(async()=>(await rpc('list_windows_code')).windows.length===2,18000);
   assert.equal((await execute('link_B',"Write-Output 'OTHER_WINDOW_UNAFFECTED'")).exit_code,0);return {windows:2};
  });
  await check('real_reload_reconnects_without_manual_terminal_recovery',async()=>{
   const priorWindow=state('A').windowId;
   const priorMain=(await rpc('list_shells_code')).shells.find(shell=>shell.window_id===priorWindow&&shell.shell_id.startsWith('main-'));
   assert.ok(priorMain);let reloadedWindow;
   assert.equal((await execute(priorMain.shell_id,"Write-Output 'BEFORE_RELOAD'")).exit_code,0);
   report.reloadBefore={state:state('A'),shell:priorMain};save();
   fs.writeFileSync(path.join(base,'A-command.json'),JSON.stringify({id:++commandId,op:'reload'}));
   // The observer restarts after Reload Window. The public endpoint must also
   // report the new worker before the restored terminal can be addressed.
   await until(async()=>{try{
    const windows=(await rpc('list_windows_code')).windows;
    reloadedWindow=windows.find(window=>path.resolve(window.workspace).toLowerCase()===path.join(base,'workspace-A').toLowerCase()&&window.window_id!==priorWindow);
    return windows.length===2&&!!reloadedWindow;
   }catch{return false;}},25000);
   let main;
   await until(async()=>{
    const shells=(await rpc('list_shells_code')).shells;
    main=shells.find(shell=>shell.window_id===reloadedWindow.window_id&&shell.shell_id.startsWith('main-'));
    return !!main;
   },8000);
   report.reloadAfter={state:state('A'),shell:main};save();
   assert.equal(main.shell_id,priorMain.shell_id,'Reload must retain the original primary terminal identity');
   await until(async()=>{try{return (await execute(main.shell_id,"Write-Output 'RELOADED_AUTO'",5000)).exit_code===0;}catch{return false;}},20000);
   assert.equal((await execute('link_B',"Write-Output 'SURVIVED_OTHER_RELOAD'")).exit_code,0);
   return {windowId:reloadedWindow.window_id,restoredPrimarySameId:true,manualRecovery:false};
  });
  await check('reload_preserves_busy_primary_then_recovers_automatically',async()=>{
   const before=state('A'),main=(await rpc('list_shells_code')).shells.find(shell=>shell.window_id===before.windowId&&shell.shell_id.startsWith('main-'));
   assert.ok(main);const name='MCP ['+main.shell_id+']',pid=before.terminals.find(t=>t.name===name)?.pid;
   const marker=path.join(base,'workspace-A/reload-running-marker.txt');if(fs.existsSync(marker))fs.unlinkSync(marker);
   const task=execute(main.shell_id,"Start-Sleep -Seconds 30; Add-Content -LiteralPath "+psLiteral(marker)+" -Value 'ONCE'",40000)
    .then(value=>({value}),error=>({error:error.message}));
   await until(async()=>(await rpc('list_shells_code')).shells.find(shell=>shell.shell_id===main.shell_id)?.busy);
   fs.writeFileSync(path.join(base,'A-command.json'),JSON.stringify({id:++commandId,op:'reload'}));
   await until(()=>state('A').boot>before.boot&&state('A').stage==='ready',25000);
   await until(async()=>(await rpc('list_shells_code')).shells.some(shell=>shell.shell_id===main.shell_id&&shell.window_id===state('A').windowId),8000);
   const request=await task;assert.ok(request.error,'The disconnected request cannot claim success');
   assert.equal(fs.existsSync(marker),false,'The command must still be running while recovery is checked');
   await assert.rejects(execute(main.shell_id,"Write-Output 'MUST_NOT_OVERLAP'",3000),/busy|verif|recover|running/i);
   assert.equal((await execute('link_B',"Write-Output 'PEER_STILL_READY'")).exit_code,0);
   await until(()=>fs.existsSync(marker),25000);
   assert.deepEqual(fs.readFileSync(marker,'utf8').trim().split(/\r?\n/),['ONCE']);
   await until(async()=>{try{return (await execute(main.shell_id,"Write-Output 'AUTO_AFTER_BUSY'",5000)).exit_code===0;}catch{return false;}},12000);
   const after=state('A').terminals.find(t=>t.name===name)?.pid;
   assert.ok(pid&&after);assert.equal(after,pid,'Reload must preserve the running shell process');
   return {executions:1,sameProcess:true,overlapRejected:true,manualRecovery:false};
  });
  report.passed=true;
 }catch(error){report.passed=false;report.error=error.stack;throw error;}
 finally{
  for(const label of ['A','B'])fs.writeFileSync(path.join(base,label+'-command.json'),JSON.stringify({id:++commandId,op:'exit'}));
  try{await until(()=>['A','B'].every(label=>['complete','launching'].includes(state(label).stage)),6000);}catch{}
  forceCloseOwnedProfiles();report.completed=new Date().toISOString();report.stage='complete';save();
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(c=>({name:c.name,passed:c.passed,ms:c.ms})),report:path.join(base,'report.json')}));
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
