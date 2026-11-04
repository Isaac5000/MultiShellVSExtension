'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {readTunnelProcessIdentity,sameTunnelProcess}=require('../out/tunnel-process.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const child=spawn(process.execPath,
   ['-e','setInterval(()=>{},1000)','--','run','--profile','vscode-local'],
   {windowsHide:true,stdio:'ignore'});
 try{
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
   let current;
   for(let attempt=0;attempt<4;attempt++){
     current=await readTunnelProcessIdentity(child.pid,process.execPath);
     if(current){break;}
     await sleep(200);
   }
   assert.ok(current,'Platform process inspector must identify a live child by executable and startup fingerprint');
   assert.equal(current.pid,child.pid);
   assert.ok(current.started);
   assert.equal(current.commandHash.length,64);
   assert.equal(sameTunnelProcess(current,{...current,started:'reused-pid'}),false);
   assert.equal(sameTunnelProcess(current,{...current}),true);
   assert.equal(await readTunnelProcessIdentity(child.pid,path.join(path.dirname(process.execPath),'impostor-tunnel.exe')),undefined);
   console.log('PASS: native process identity, executable validation, start fingerprint and PID-reuse refusal');
 }finally{
   child.kill();
   await new Promise(resolve=>child.once('exit',resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
