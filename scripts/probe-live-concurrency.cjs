'use strict';

// Manual, non-destructive MCP transport test. Targets MUST be two different shells
// already available in the local VS Code extension; this script creates none.
const {performance}=require('node:perf_hooks');
const fs=require('node:fs');
const path=require('node:path');
const [sleepShell,countShell,secondsText='8']=process.argv.slice(2);
const seconds=Number(secondsText);
if(!sleepShell||!countShell||sleepShell===countShell||
   !Number.isInteger(seconds)||seconds<2||seconds>45){
  console.error('Usage: node scripts/probe-live-concurrency.cjs <sleep-shell> <counter-shell> [seconds: 2..45]');
  process.exit(2);
}
const port=Number(process.env.MULTISHELL_PORT||3000);
const endpoint='http://127.0.0.1:'+port+'/mcp';
const sleepCmd="Write-Output ('SLEEP_START='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff')); Start-Sleep -Seconds "+seconds+"; Write-Output ('SLEEP_END='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff'))";
const counterCmd="1.."+seconds+" | ForEach-Object { Write-Output ('TICK_'+$_+'='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff')); Start-Sleep -Seconds 1 }; Write-Output 'COUNTER_DONE'";
async function call(shell_id,command,id){
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
    signal:AbortSignal.timeout((seconds+22)*1000),
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{
      name:'execute_shell_command_code',
      arguments:{shell_id,command,timeout:(seconds+15)*1000}
    }})
  });
  const body=await response.text();
  if(!response.ok)throw new Error('HTTP '+response.status+': '+body.slice(0,300));
  const data=body.split(/\r?\n/).find(line=>line.startsWith('data:'));
  const parsed=JSON.parse(data?data.slice(5).trim():body);
  if(parsed.error)throw new Error(JSON.stringify(parsed.error));
  const result=parsed.result;
  if(result?.isError)throw new Error(result.content?.[0]?.text||'MCP execution failed');
  return JSON.parse(result.content[0].text);
}
(async()=>{
  console.log('TARGETS='+sleepShell+' + '+countShell+'; SECONDS='+seconds+'; ENDPOINT='+endpoint);
  const start=performance.now();
  const results=await Promise.allSettled([
    call(sleepShell,sleepCmd,701),
    call(countShell,counterCmd,702)
  ]);
  const elapsed=performance.now()-start;
  for(let i=0;i<results.length;i++){
    const name=i===0?sleepShell:countShell;
    const result=results[i];
    if(result.status!=='fulfilled'){
      console.log('JOB '+name+' FAILED: '+String(result.reason));
      continue;
    }
    const value=result.value;
    console.log('JOB '+name+' exit_code='+value.exit_code);
    const relevant=String(value.output).split(/\r?\n/).filter(line=>
      /SLEEP_START|SLEEP_END|TICK_\d+=|COUNTER_DONE/.test(line));
    console.log(relevant.join('\n'));
  }
  console.log('DIRECT_HTTP_WALL_MS='+Math.round(elapsed));
  const overlap=results.every(x=>x.status==='fulfilled') && elapsed<seconds*1650;
  const report={timestamp:new Date().toISOString(),sleepShell,countShell,seconds,
    elapsedMs:Math.round(elapsed),parallel:overlap,
    jobs:results.map((x,i)=>x.status==='fulfilled'?{
      shell:i===0?sleepShell:countShell,
      exit_code:x.value.exit_code,
      lines:String(x.value.output).split(/\r?\n/).filter(line=>/SLEEP_START|SLEEP_END|TICK_\d+=|COUNTER_DONE/.test(line))
    }:{shell:i?countShell:sleepShell,error:String(x.reason)})};
  fs.writeFileSync(path.join(__dirname,'probe-live-results.json'),JSON.stringify(report,null,2));
  console.log('REPORT=probe-live-results.json');
  console.log('CONCURRENT_EXECUTION_OBSERVED='+overlap);
  if(!overlap)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});