'use strict';
// Live, read-only FIFO regression. Execute from a THIRD shell, not from the target.
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const shellId=process.argv[2];
const seconds=Number(process.argv[3]||6);
if(!shellId||!Number.isInteger(seconds)||seconds<3||seconds>20){
  console.error('Usage: node scripts/probe-live-fifo.cjs <user-shell> [seconds:3..20]');
  process.exit(2);
}
const port=process.env.MULTISHELL_PORT||3000;
const endpoint='http://127.0.0.1:'+port+'/mcp';
async function call(command,id){
  const response=await fetch(endpoint,{method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
    signal:AbortSignal.timeout((seconds+20)*1000),
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',
      params:{name:'execute_shell_command_code',
        arguments:{shell_id:shellId,command,timeout:(seconds+12)*1000}}})
  });
  const body=await response.text();
  if(!response.ok)throw new Error('HTTP '+response.status+' '+body.slice(0,350));
  const line=body.split(/\r?\n/).find(s=>s.startsWith('data:'));
  const data=JSON.parse(line?line.slice(5).trim():body);
  if(data.result?.isError||data.error){
    throw new Error(data.result?.content?.[0]?.text||JSON.stringify(data.error));
  }
  return JSON.parse(data.result.content[0].text);
}
const first="Write-Output ('FIFO_A_START='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff')); Start-Sleep -Seconds "+seconds+"; Write-Output ('FIFO_A_END='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff'))";
const second="Write-Output ('FIFO_B_START='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff')); Write-Output ('FIFO_B_END='+[DateTime]::UtcNow.ToString('HH:mm:ss.fff'))";
const get=(out,key)=>[...String(out).matchAll(new RegExp(key+'=(\\d\\d:\\d\\d:\\d\\d\\.\\d{3})','g'))].map(x=>x[1]).at(-1);
(async()=>{
  const start=performance.now();
  const firstRequest=call(first,801);
  await new Promise(resolve=>setTimeout(resolve,400));
  const secondRequest=call(second,802);
  const settled=await Promise.allSettled([firstRequest,secondRequest]);
  const elapsedMs=Math.round(performance.now()-start);
  const results=settled.map((x,i)=>x.status==='fulfilled'?{
    label:i?'second':'first',exit_code:x.value.exit_code,output:x.value.output
  }:{label:i?'second':'first',error:String(x.reason)});
  const a=results[0]?.output||'',b=results[1]?.output||'';
  const times={aStart:get(a,'FIFO_A_START'),aEnd:get(a,'FIFO_A_END'),
    bStart:get(b,'FIFO_B_START'),bEnd:get(b,'FIFO_B_END')};
  const fifo=results.every(r=>r.exit_code===0)&&
    Object.values(times).every(Boolean)&&times.bStart>=times.aEnd;
  const report={timestamp:new Date().toISOString(),shellId,seconds,
    elapsedMs,ordered:fifo,times,results};
  fs.writeFileSync(path.join(__dirname,'probe-live-fifo-results.json'),JSON.stringify(report,null,2));
  console.log('FIFO_ORDERED='+fifo+' ELAPSED_MS='+elapsedMs);
  console.log(JSON.stringify(times));
  if(!fifo)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
