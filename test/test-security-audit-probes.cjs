'use strict';
/**
 * Manual, non-destructive security probes for MultiShell MCP.
 * NOT named test-*.cjs: separate from the required regression suite.
 * Uses only a mocked ShellApi, ephemeral local HTTP ports and temporary files.
 * Does not execute shell commands or read any real user files.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function decode(raw){
 const data=raw.split('\n').find(line=>line.startsWith('data:'));
 return JSON.parse(data?data.slice(5).trim():raw);
}
function makeRequest(port,method,params={},signal){
 return fetch('http://127.0.0.1:'+port+'/mcp',{
   method:'POST',signal,
   headers:{'content-type':'application/json','accept':'application/json,text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:Math.round(Math.random()*1e8),method,params})
 });
}
async function tool(port,name,args,signal){
 const res=await makeRequest(port,'tools/call',{name,arguments:args},signal);
 return {status:res.status,body:decode(await res.text())};
}
const waitFor=async(fn,timeout=8000)=>{
 for(let t=0;t<timeout;t+=20){
  if(fn())return true;
  await sleep(20);
 }
 return false;
};
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-security-root-'));
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-security-outside-'));
 let release;
 const gate=new Promise(done=>{release=done;});
 const called=[];
 const shell={
  root:()=>root,
  list:async()=>[{shell_id:'probe',initial_cwd:root,origin:'mcp'}],
  windows:()=>[],
  execute:async(id,cmd)=>{
   called.push({id,cmd});
   if(cmd==='hold'){await gate;}
   return {shell_id:id,command:cmd,output:'simulated-only',exit_code:0,truncated:false};
  }
 };
 const server=new MCPServer(0,'127.0.0.1',shell,{file:true,edit:true,shell:true});
 const pending=[],controllers=[];
 try {
  await server.start();
  const port=server.listeningPort;
  // PROBE 1: no authorization header, simulated command execution.
  const execution=await tool(port,'execute_shell_command_code',
   {shell_id:'probe',command:'harmless-simulation',timeout:1000});
  assert.equal(execution.status,200);
  assert.equal(execution.body.result?.isError,false);
  assert.deepEqual(called[0],{id:'probe',cmd:'harmless-simulation'});
  console.log('FIXTURE: synthetic MCP server is intentionally unauthenticated; production listener auth is verified separately.');

  // PROBE 2: in-flight bound on the unauthenticated listener.
  for(let i=0;i<34;i++){
    const controller=new AbortController();
    controllers.push(controller);
    pending.push(makeRequest(port,'tools/call',{
      name:'execute_shell_command_code',
      arguments:{shell_id:'probe',command:'hold',timeout:15000}
    },controller.signal).then(async r=>{await r.text();return r.status;},()=>undefined));
  }
  const overLimit=await waitFor(()=>server.sessions.size>32,900);
  assert.equal(overLimit,false,'No listener may accept more than 32 simultaneous requests.');
  release();
  const statuses=await Promise.all(pending);
  assert.ok(statuses.filter(x=>x===429).length>=1,
    'Excess requests must receive HTTP 429');
  console.log('PASS: unprivileged fixture enforces 32 in-flight requests and HTTP 429.');

  // PROBE 3: deterministic symlink-swap between path check and async stat/read.
  // Outside file is an artificial canary, never a real private resource.
  const box=path.join(root,'box');
  const parked=path.join(root,'box-parked');
  const wanted=path.join(box,'canary.txt');
  fs.mkdirSync(box);
  fs.writeFileSync(wanted,'INSIDE_CANARY');
  fs.writeFileSync(path.join(outside,'canary.txt'),'OUTSIDE_CANARY');
  const originalStat=fs.promises.stat;
  let switched=false,symlinkSupported=true;
  fs.promises.stat=async function(file,...args){
   if(path.resolve(String(file))===wanted && !switched){
    fs.renameSync(box,parked);
    try{
     fs.symlinkSync(outside,box,process.platform==='win32'?'junction':'dir');
     switched=true;
    }catch(error){
     symlinkSupported=false;
     fs.renameSync(parked,box);
    }
   }
   return originalStat.call(this,file,...args);
  };
  let readResult;
  try{
   readResult=await tool(port,'read_file_code',
     {shell_id:'probe',path:'box/canary.txt',encoding:'base64',maxCharacters:2048});
  }finally{
   fs.promises.stat=originalStat;
   if(switched){
    fs.unlinkSync(box);
    fs.renameSync(parked,box);
   }
  }
  if(!symlinkSupported){
   console.log('SKIP: OS did not permit an isolated directory symlink/junction.');
  }else{
   const answer=readResult.body.result;
   const actual=answer?.content?.[0]?.text||'';
   const leaked=answer?.isError===false &&
     Buffer.from(actual,'base64').toString('utf8')==='OUTSIDE_CANARY';
   assert.equal(leaked,false,'Symlink race leaked an outside file.');
   console.log('PASS: no outside data returned after read symlink race.');
  }
  // PROBE 4: swap an ancestor after validation but before atomic write.
  const writeBox=path.join(root,'write-box'),writeParked=path.join(root,'write-box-parked');
  const externalCanary=path.join(outside,'write-canary.txt');
  fs.mkdirSync(writeBox);
  fs.writeFileSync(externalCanary,'BEFORE');
  const originalWriteFile=fs.promises.writeFile;
  let writeSwitched=false,writeSymlinkSupported=true;
  fs.promises.writeFile=async function(file,...args){
   const filename=String(file);
   if(path.dirname(filename)===writeBox &&
      path.basename(filename).startsWith('.write-canary.txt.multishell-') &&
      !writeSwitched){
    fs.renameSync(writeBox,writeParked);
    try{
     fs.symlinkSync(outside,writeBox,process.platform==='win32'?'junction':'dir');
     writeSwitched=true;
    }catch(error){
     writeSymlinkSupported=false;
     fs.renameSync(writeParked,writeBox);
    }
   }
   return originalWriteFile.call(this,file,...args);
  };
  let writeResult;
  try{
   writeResult=await tool(port,'create_file_code',{
    shell_id:'probe',path:'write-box/write-canary.txt',
    content:'OUTSIDE_WRITE_PROBE',overwrite:true
   });
  }finally{
   fs.promises.writeFile=originalWriteFile;
   if(writeSwitched){
    fs.unlinkSync(writeBox);
    fs.renameSync(writeParked,writeBox);
   }
  }
  if(!writeSymlinkSupported){
   console.log('SKIP: directory junction unavailable for write probe.');
  }else{
   const escaped=fs.readFileSync(externalCanary,'utf8')==='OUTSIDE_WRITE_PROBE';
   assert.equal(escaped,false,'Symlink race modified an outside file.');
   assert.equal(writeResult.body.result?.isError,true);
   console.log('PASS: no outside file overwritten after write symlink race.');
  }
 }finally{
  release();
  controllers.forEach(x=>x.abort());
  await Promise.allSettled(pending);
  await server.stop();
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(outside,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
