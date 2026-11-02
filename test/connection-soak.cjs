'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const http=require('node:http');
const crypto=require('node:crypto');
const {environment,tool,rpc,wait}=require('./connection-fixture.cjs');
const seconds=Number(process.env.MULTISHELL_SOAK_SECONDS||180);
if(!Number.isInteger(seconds)||seconds<30||seconds>1800){throw Error('MULTISHELL_SOAK_SECONDS must be 30..1800');}
const reportFile=path.resolve(__dirname,'../.vscode-test/connection-soak/results.json');
fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const report={version:require('../package.json').version,durationSeconds:seconds,started:new Date().toISOString(),
 commands:0,rounds:0,workerReconnects:0,hubRestarts:0,metadataRetries:0,unexpectedErrors:[],samples:[]};
report.node=process.version;report.compiledSourceSha256={};
for(const name of ['multi-window','server','shell-manager','shell-readiness','http-limits']){
 report.compiledSourceSha256[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../out',name+'.js'))).digest('hex');
}
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const latencies=[];
const lag=monitorEventLoopDelay({resolution:20});lag.enable();
(async()=>{
 const env=await environment();const start=Date.now();let lastRegistration=Date.now(),lastSample=0;
 let agent=new http.Agent({keepAlive:true,maxSockets:12});
 try{
  await rpc(env.port,'tools/list',{}, {agent});global.gc?.();const baseline=process.memoryUsage();report.baselineMemory=baseline;
  while(Date.now()-start<seconds*1000){
   if(Date.now()-lastRegistration>2000){await Promise.all([0,1,2].map(index=>env.register(index)));lastRegistration=Date.now();}
   if(report.rounds&&report.rounds%50===0){
    const index=(report.workerReconnects++)%3;await env.workers[index].stop();await env.workers[index].start();
    try{await env.register(index);}catch{report.metadataRetries++;await wait(20);await env.register(index);}
   }
   if(report.rounds&&report.rounds%125===0){
    agent.destroy();await env.restartHub();agent=new http.Agent({keepAlive:true,maxSockets:12});report.hubRestarts++;
   }
   const requests=Array.from({length:12},async(_,index)=>{
    const command='soak_'+report.rounds+'_'+index,begin=Date.now();
    const result=await tool(env.port,'execute_shell_command_code',
     {shell_id:'connection_'+(index%3),command,timeout:5000},{agent});
    assert.equal(result.exit_code,0);assert.equal(JSON.parse(result.output).command,command);
    latencies.push(Date.now()-begin);
   });
   await Promise.all(requests);report.commands+=12;report.rounds++;
   assert.equal(env.hub.sessions.size,0,'MCP transports leaked');
   assert.ok(env.workers.every(worker=>worker.requests.size===0),'Worker HTTP controllers leaked');
   assert.ok(env.managers.every(manager=>manager.list().every(shell=>!shell.busy&&shell.queued===0)),'A queue stayed blocked');
   for(const kind of ['closed','started','ended'])assert.equal(env.hooks[kind].size,3,'Terminal listeners leaked: '+kind);
   env.issued.length=0;env.finished.length=0;env.logs.length=0;
   if(Date.now()-lastSample>5000){
    const memory=process.memoryUsage();report.samples.push({elapsedMs:Date.now()-start,commands:report.commands,heapUsed:memory.heapUsed,rss:memory.rss});
    report.elapsedMs=Date.now()-start;save();lastSample=Date.now();
   }
   await wait(10);
  }
  global.gc?.();report.finalMemory=process.memoryUsage();
  report.heapGrowthBytes=report.finalMemory.heapUsed-baseline.heapUsed;
  assert.ok(report.heapGrowthBytes<32*1024*1024,'Retained heap grew more than 32 MB after GC');
  latencies.sort((a,b)=>a-b);report.latencyMs={p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],p99:latencies[Math.floor(latencies.length*.99)],max:latencies.at(-1)};
  report.eventLoopLagMs={p99:lag.percentile(99)/1e6,max:lag.max/1e6};
  assert.ok(report.latencyMs.max<5000,'A request exceeded the local 5-second limit');
  report.passed=true;
 }catch(error){report.unexpectedErrors.push(error.stack);report.passed=false;throw error;}
 finally{
  lag.disable();agent.destroy();report.elapsedMs=Date.now()-start;report.completed=new Date().toISOString();save();await env.stop();
  console.log(JSON.stringify({passed:report.passed,commands:report.commands,seconds:Math.round(report.elapsedMs/1000),workerReconnects:report.workerReconnects,hubRestarts:report.hubRestarts,report:reportFile}));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
