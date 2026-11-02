'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {inspectPowerShellReadiness}=require('../out/shell-readiness.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 assert.equal(await inspectPowerShellReadiness(-1),'unknown');
 assert.equal(await inspectPowerShellReadiness(process.pid),'unsupported','A Node process cannot prove an idle PowerShell');
 const executable=process.platform==='win32'?'powershell.exe':'pwsh';
 const target=spawn(executable,['-NoLogo','-NoProfile','-NoExit','-Command',"Write-Output 'READINESS_READY'"],
  {windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',launchError;
 target.on('error',error=>{launchError=error;});
 target.stdout.on('data',chunk=>{output+=String(chunk);});
 target.stderr.on('data',()=>{});
 const closed=new Promise(resolve=>target.once('close',resolve));
 try{
  for(let i=0;i<80&&!output.includes('READINESS_READY')&&!launchError;i++)await wait(40);
  if(launchError?.code==='ENOENT'){
   console.log('SKIP: PowerShell is not installed; unsupported-shell and invalid-PID checks passed');return;
  }
  assert.equal(launchError,undefined);assert.match(output,/READINESS_READY/);
  assert.equal(await inspectPowerShellReadiness(target.pid),'idle');
  target.stdin.write("Start-Sleep -Seconds 3; Write-Output 'READINESS_FINISHED'\n");
  await wait(200);
  assert.equal(await inspectPowerShellReadiness(target.pid),'busy','A childless sleeping command must remain protected');
  for(let i=0;i<100&&!output.includes('READINESS_FINISHED\r\n');i++)await wait(40);
  assert.equal(await inspectPowerShellReadiness(target.pid),'idle');
  target.stdin.write("Read-Host 'READINESS_INPUT'\n");await wait(200);
  assert.equal(await inspectPowerShellReadiness(target.pid),'busy','A credential/input prompt is not an idle shell');
  target.stdin.write('audit-answer\n');await wait(200);
  assert.equal(await inspectPowerShellReadiness(target.pid),'idle');
  console.log('PASS: separate read-only runspace inspection distinguishes idle, childless work and input waits without interrupting the foreground pipeline');
 }finally{
  target.stdin.end('exit\n');
  let timer;
  await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{target.kill();resolve();},2000);})]);
  clearTimeout(timer);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
