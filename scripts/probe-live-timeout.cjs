'use strict';
// End-to-end user-shell timeout test. Never kills or manually unlocks the process.
const fs=require('node:fs'),path=require('node:path');
const shellId=process.argv[2];
if(!shellId){console.error('Usage: node scripts/probe-live-timeout.cjs <user-shell>');process.exit(2);}
const endpoint='http://127.0.0.1:'+(process.env.MULTISHELL_PORT||3000)+'/mcp';
async function invoke(name,args,id){
  const r=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
    signal:AbortSignal.timeout(20000),
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',
      params:{name,arguments:args}})
  });
  const text=await r.text();
  if(!r.ok){throw new Error('HTTP '+r.status+': '+text.slice(0,300));}
  const row=text.split(/\r?\n/).find(x=>x.startsWith('data:'));
  const result=JSON.parse(row?row.slice(5).trim():text);
  if(result.error)throw new Error(JSON.stringify(result.error));
  return {isError:Boolean(result.result?.isError),
    text:result.result?.content?.[0]?.text||''};
}
const execute=(command,timeout,id)=>invoke('execute_shell_command_code',
  {shell_id:shellId,command,timeout},id);
(async()=>{
  const start=Date.now();
  const first=await execute(
    "Write-Output ('TIMEOUT_START='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff')); Start-Sleep -Seconds 6; Write-Output ('TIMEOUT_END='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff'))",
    1000,901);
  const middle=await invoke('list_shells_code',{},902);
  const state=JSON.parse(middle.text).shells.find(s=>s.shell_id===shellId);
  const second=await execute("Write-Output 'SHOULD_NOT_RUN'",4500,903);
  const guarded=first.isError && state?.origin==='user' &&
    state?.timed_out_running===true && second.isError &&
    /still running|timed.out|preserved|blocked/i.test(second.text);
  // Wait for the original six-second process to finish on its own.
  await new Promise(resolve=>setTimeout(resolve,6200));
  const after=await invoke('list_shells_code',{},904);
  const afterState=JSON.parse(after.text).shells.find(s=>s.shell_id===shellId);
  const recovered=await execute("Write-Output 'RECOVERED_AFTER_TIMEOUT'",4500,905);
  const code=!recovered.isError?JSON.parse(recovered.text):null;
  const passed=guarded && afterState?.timed_out_running===false &&
    code?.exit_code===0 && code?.output?.includes('RECOVERED_AFTER_TIMEOUT');
  const report={timestamp:new Date().toISOString(),shellId,elapsedMs:Date.now()-start,
    preservedOnTimeout:first.isError,guardedWhileRunning:guarded,
    stateDuring:state,stateAfter:afterState,secondError:second.text,
    recovered:!recovered.isError,recoveryResult:code,
    passed};
  fs.writeFileSync(path.join(__dirname,'probe-live-timeout-results.json'),JSON.stringify(report,null,2));
  console.log('USER_TIMEOUT_PRESERVED='+first.isError+
    ' OVERLAP_PREVENTED='+guarded+' RECOVERED='+(!recovered.isError)+
    ' PASSED='+passed);
  if(!passed)process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1});
