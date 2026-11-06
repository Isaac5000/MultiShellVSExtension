'use strict';
const assert=require('node:assert/strict');
const {BackgroundJobManager}=require('../out/background-jobs.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,timeout=1000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(f())return;await wait(10);}throw Error('Timed out');};
(async()=>{
 let cancelled=0;
 const manager=new BackgroundJobManager((_shell,_cwd,_command,_timeout,signal)=>
   new Promise((_,reject)=>{
    const abort=()=>{cancelled++;reject(Error('cancelled'));};
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();}
   }));
 try{
  const first=manager.start('owned','/tmp','sleep 30',30000);
  await until(()=>manager.status('owned',first.job_id).status==='running');
  manager.revokeShell('owned');
  assert.throws(()=>manager.status('owned',first.job_id),/Unknown background job/);
  assert.deepEqual(manager.list('owned'),[]);
  await until(()=>cancelled===1);
  const second=manager.start('owned','/tmp','sleep 30',30000);
  assert.notEqual(first.job_id,second.job_id);
  assert.throws(()=>manager.status('foreign',second.job_id),/Unknown background job/);
  manager.cancel('owned',second.job_id);
  await until(()=>manager.status('owned',second.job_id).status==='cancelled');
  console.log('PASS revoked shell cannot expose old jobs after shell ID reuse; isolated child is cancelled');
 }finally{await manager.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
