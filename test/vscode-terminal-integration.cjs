'use strict';
const vscode=require('vscode');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..');
const base=process.env.MULTISHELL_TEST_ROOT;
if(!base){throw Error('Launch through npm run test:vscode');}
const testPort=Number(process.env.MULTISHELL_TEST_PORT);
const report={version:vscode.version,started:new Date().toISOString(),checks:[]};
const reportFile=path.join(base,'extension-host-results.json');
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,ms=15000){const start=Date.now();while(Date.now()-start<ms){if(await check())return;await wait(80);}throw Error('Condition timed out after '+ms+'ms');}
async function check(name,fn){report.stage=name;save();const start=Date.now();try{const details=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,details});}catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});}save();}
let id=0;
async function rpc(method,params,signal){
 const response=await fetch('http://127.0.0.1:'+testPort+'/mcp',{method:'POST',signal:signal||AbortSignal.timeout(22000),
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
 const body=await response.text();assert.equal(response.status,200,body);
 const row=body.split(/\r?\n/).find(x=>x.startsWith('data:'));
 const data=JSON.parse(row?row.slice(5):body);if(data.error)throw Error(JSON.stringify(data.error));return data.result;
}
async function tool(name,args={},signal){return rpc('tools/call',{name,arguments:args},signal);}
function parsed(value){if(value.isError)throw Error(value.content?.[0]?.text);return JSON.parse(value.content[0].text);}
const execute=(shell_id,command,timeout=10000,signal)=>tool('execute_shell_command_code',{shell_id,command,timeout},signal);
exports.run=async()=>{
 let extraManager;
 let started=false;
 const shellIds=[];
 try{
  const terminalSettings=vscode.workspace.getConfiguration('terminal.integrated');
  report.terminalSettings={defaultProfile:terminalSettings.get('defaultProfile.windows'),automationProfile:terminalSettings.get('automationProfile.windows'),profiles:terminalSettings.get('profiles.windows')};save();
  await check('activate_current_release_and_start_private_hub',async()=>{
   const extension=vscode.extensions.getExtension('local-multishell.multi-shell-mcp-server');assert.ok(extension);
   report.extensionVersion=extension.packageJSON.version;assert.equal(report.extensionVersion,require(path.join(project,'package.json')).version);
   await extension.activate();await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');started=true;
   const windows=parsed(await tool('list_windows_code')).windows;assert.equal(windows.length,1);
   assert.equal(path.resolve(windows[0].workspace).toLowerCase(),path.join(base,'test-workspace').toLowerCase());
   report.windowId=windows[0].window_id;return {windows:windows.length};
  });
  if(!report.windowId)throw Error('Private hub unavailable');
  for(const [suffix,folder] of [['a','a'],['b','b']]){
   const shell='audit_live_'+suffix;shellIds.push(shell);
   parsed(await tool('create_shell_code',{shell_id:shell,cwd:path.join(base,'test-workspace',folder),window_id:report.windowId}));
  }
  for(const id of shellIds){vscode.window.terminals.find(t=>t.name==='MCP ['+id+']')?.show(true);}
  try{await until(()=>shellIds.every(id=>vscode.window.terminals.find(t=>t.name==='MCP ['+id+']')?.shellIntegration),20000);}
  catch(error){report.terminalDiagnostics=await Promise.all(vscode.window.terminals.map(async t=>({name:t.name,pid:await t.processId,exit:t.exitStatus,integration:!!t.shellIntegration,options:t.creationOptions})));throw error;}
  await check('real_terminal_short_command',async()=>{
   const result=parsed(await execute(shellIds[0],"Write-Output 'LIVE_OK'"));assert.equal(result.exit_code,0);assert.match(result.output,/LIVE_OK/);return {exitCode:result.exit_code};
  });
  await check('two_real_terminals_run_concurrently',async()=>{
   const begin=Date.now();const out=await Promise.all(shellIds.map(id=>execute(id,"Start-Sleep -Seconds 2; Write-Output 'PARALLEL_OK'")));
   for(const value of out){assert.equal(parsed(value).exit_code,0);}const ms=Date.now()-begin;assert.ok(ms<3600,'Two 2-second tasks took '+ms+'ms');return {elapsedMs:ms};
  });
  await check('real_fifo_same_terminal',async()=>{
   const first=execute(shellIds[0],"Start-Sleep -Milliseconds 1500; Write-Output ('A_END=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())");
   await wait(150);const second=execute(shellIds[0],"Write-Output ('B_START=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())");
   const [a,b]=(await Promise.all([first,second])).map(parsed);
   const end=Number(/A_END=(\d{13})/.exec(a.output)?.[1]);const next=Number(/B_START=(\d{13})/.exec(b.output)?.[1]);
   assert.ok(end&&next&&next>=end,'FIFO timestamps invalid');return {gapMs:next-end};
  });
  await check('isolated_work_does_not_wait_for_busy_terminal',async()=>{
   const terminalTask=execute(shellIds[1],"Start-Sleep -Seconds 3; Write-Output 'TERMINAL_FINISHED'");await wait(200);
   const begin=Date.now();const result=parsed(await tool('execute_isolated_command_code',{shell_id:shellIds[1],command:"Write-Output 'ISOLATED_OK'",timeout:5000}));
   const ms=Date.now()-begin;assert.equal(result.exit_code,0);assert.ok(ms<2300,'Isolated task blocked for '+ms+'ms');
   assert.equal(parsed(await terminalTask).exit_code,0);return {isolatedMs:ms};
  });
  await check('temporary_terminal_timeout_removes_session',async()=>{
   const result=await execute(shellIds[0],"Start-Sleep -Seconds 8",1000);assert.equal(result.isError,true);
   await until(async()=>!parsed(await tool('list_shells_code')).shells.some(s=>s.shell_id===shellIds[0]),5000);
   return {error:result.content[0].text};
  });
  const {ShellManager}=require(path.join(project,'out/shell-manager.js'));
  extraManager=new ShellManager();extraManager.create('audit_preserved_user',path.join(base,'test-workspace'),true,'user');
  const owned=vscode.window.terminals.find(t=>t.name==='MCP [audit_preserved_user]');await until(()=>owned.shellIntegration,20000);
  await check('real_user_timeout_preserves_and_recovers',async()=>{
   await assert.rejects(extraManager.execute('audit_preserved_user',"Start-Sleep -Seconds 6; Write-Output 'PRESERVED'",1000),/timed out/);
   const during=extraManager.list()[0];assert.equal(during.timed_out_running,true);assert.equal(during.busy,true);
   assert.ok(vscode.window.terminals.includes(owned));
   await assert.rejects(extraManager.execute('audit_preserved_user',"Write-Output 'MUST_WAIT'",1000),/still running/);
   await until(()=>!extraManager.list()[0].busy,7000);
   const after=await extraManager.execute('audit_preserved_user',"Write-Output 'RECOVERED'",5000);assert.equal(after.exit_code,0);
   return {preserved:true,recovered:true};
  });
  await check('manual_command_is_protected_in_real_terminal',async()=>{
   const manual=owned.shellIntegration.executeCommand('Start-Sleep -Seconds 2');
   const drained=(async()=>{for await(const chunk of manual.read()){void chunk;}})();
   await until(()=>extraManager.list()[0].external_busy===true,2000);
   await assert.rejects(extraManager.execute('audit_preserved_user',"Write-Output 'MUST_NOT_INTERRUPT'",5000),/outside its MCP queue/);
   await drained;await until(()=>!extraManager.list()[0].external_busy,4000);return {rejected:true};
  });
  await check('unfinished_prompt_input_remains_protected',async()=>{
   const {inspectPowerShellReadiness}=require(path.join(project,'out/shell-readiness.js'));
   owned.sendText('Write-Output SHOULD_NOT_RUN',false);await wait(200);
   try{assert.equal(await inspectPowerShellReadiness(await owned.processId),'busy');}
   finally{owned.sendText(String.fromCharCode(3),false);await wait(200);}
   await extraManager.resumeProvenIdleTerminals();
   assert.equal(await inspectPowerShellReadiness(await owned.processId),'idle');
   return {partialInputPreserved:true};
  });
  await check('restored_idle_terminal_recovers_without_confirmation',async()=>{
   const firstManager=new ShellManager();firstManager.create('audit_restored_idle',path.join(base,'test-workspace'),true,'user');
   const physical=vscode.window.terminals.find(t=>t.name==='MCP [audit_restored_idle]');
   await until(()=>physical.shellIntegration,20000);firstManager.dispose(true);
   const restored=new ShellManager();
   try{
    restored.restoreUserTerminals(path.join(base,'test-workspace'),[{shell_id:'audit_restored_idle',initial_cwd:path.join(base,'test-workspace')}]);
    assert.equal(restored.list()[0].recovery_required,true);
    const recovered=await restored.resumeProvenIdleTerminals();assert.deepEqual(recovered,['audit_restored_idle']);
    assert.equal(restored.list()[0].recovery_required,false);
    const result=await restored.execute('audit_restored_idle',"Write-Output 'RESTORED_AUTO'",5000);assert.equal(result.exit_code,0);
    return {recovered:true,manualConfirmation:false};
   }finally{restored.dispose(false);}
  });
  await check('restored_running_terminal_is_not_unlocked',async()=>{
   const firstManager=new ShellManager();firstManager.create('audit_restored_busy',path.join(base,'test-workspace'),true,'user');
   const physical=vscode.window.terminals.find(t=>t.name==='MCP [audit_restored_busy]');await until(()=>physical.shellIntegration,20000);
   const task=physical.shellIntegration.executeCommand('Start-Sleep -Seconds 3');
   const drained=(async()=>{for await(const chunk of task.read()){void chunk;}})();
   await wait(200);firstManager.dispose(true);const restored=new ShellManager();
   try{
    restored.restoreUserTerminals(path.join(base,'test-workspace'),[{shell_id:'audit_restored_busy',initial_cwd:path.join(base,'test-workspace')}]);
    assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);assert.equal(restored.list()[0].recovery_required,true);
    await drained;await until(()=>!restored.list()[0].recovery_required,4000);return {protectedWhileBusy:true,recoveredAfterCompletion:true};
   }finally{restored.dispose(false);}
  });
  await check('lost_completion_event_recovers_using_actual_runspace',async()=>{
   const proxyquire=require(path.join(project,'node_modules/proxyquire')).noCallThru();
   const windowProxy=new Proxy(vscode.window,{get(target,key){
    if(key==='onDidEndTerminalShellExecution')return ()=>({dispose(){}});
    return Reflect.get(target,key);
   }});
   const {ShellManager:MissingEndManager}=proxyquire(path.join(project,'out/shell-manager.js'),
    {vscode:{...vscode,window:windowProxy}});
   const missing=new MissingEndManager();missing.create('audit_lost_completion',path.join(base,'test-workspace'),true,'user');
   const physical=vscode.window.terminals.find(t=>t.name==='MCP [audit_lost_completion]');await until(()=>physical.shellIntegration,20000);
   try{
    const task=missing.execute('audit_lost_completion',"Write-Output 'ACTUALLY_FINISHED'",10000);
    await until(()=>missing.list()[0].execution_phase==='waiting_for_completion',5000);
    assert.deepEqual(await missing.resumeProvenIdleTerminals(),['audit_lost_completion']);
    const result=await task;assert.match(result.output,/ACTUALLY_FINISHED/);assert.equal(missing.list()[0].busy,false);
    assert.equal(result.exit_code,undefined,'Lost exit status must not be invented');
    return {recovered:true,exitCodeUnknown:true,manualConfirmation:false};
   }finally{missing.dispose(false);}
  });
 }catch(error){report.fatal=error.stack;}
 finally{
  report.stage='cleanup';save();
  for(const shell_id of shellIds){try{const shells=parsed(await tool('list_shells_code')).shells;if(shells.some(s=>s.shell_id===shell_id))await tool('close_shell_code',{shell_id});}catch(error){report.cleanupError=String(error);}}
  extraManager?.dispose(false);
  if(started)await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');
  report.completed=new Date().toISOString();report.stage='complete';save();
 }
 if(report.fatal||report.checks.some(x=>!x.passed))throw Error('Extension audit failed; see '+reportFile);
};

