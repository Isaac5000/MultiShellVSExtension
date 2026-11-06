'use strict';
const assert=require('node:assert/strict');
const {BackgroundJobManager}=require('../out/background-jobs.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const eventually=async(fn,ms=1200)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await wait(10);}throw Error('Condition not met');};
let resolveDone,executed=0,abortCount=0;
const executor=async(_shell,_cwd,command,_timeout,signal,onOutput)=>{
 executed++;
 if(command==='fail'){throw Error('synthetic failure');}
 if(command==='big'){
  const output='x'.repeat(20000);
  onOutput(output);
  return{exit_code:0,output,truncated:false};
 }
 if(command==='finish'){
  onOutput('BEGIN\\n');
  await new Promise(r=>{resolveDone=r;});
  onOutput('DONE\\n');
  return{exit_code:0,output:'BEGIN\\nDONE\\n',truncated:false};
 }
 return new Promise((_,reject)=>{
  if(signal.aborted){abortCount++;reject(Error('Isolated command cancelled.'));return;}
  signal.addEventListener('abort',()=>{abortCount++;reject(Error('Isolated command cancelled.'));},{once:true});
 });
};
(async()=>{
 const jobs=new BackgroundJobManager(executor);
 try{
  assert.throws(()=>jobs.start('one','/tmp','',5000),/Empty|non-empty/);
  assert.throws(()=>jobs.start('one','/tmp','less /tmp/file',5000),/interactive/i);
  assert.throws(()=>jobs.start('one','/tmp','Read-Host "secret"',5000),/interactive/i);
  assert.throws(()=>jobs.start('one','/tmp','sleep 10',999),/timeout/i);
  const started=jobs.start('one','/tmp','finish',5000);
  assert.match(started.job_id,/^[a-f0-9-]{36}$/i);
  assert.equal(started.status,'running');
  assert.equal(started.shell_id,'one');
  assert.equal(started.command_label,'isolated','Do not reveal raw commands via metadata');
  assert.equal(jobs.list('one').length,1);
  assert.throws(()=>jobs.status('two',started.job_id),/Unknown background job/);
  assert.throws(()=>jobs.cancel('two',started.job_id),/Unknown background job/);
  assert.deepEqual(jobs.list('two'),[]);
  await eventually(()=>executed===1);
  await eventually(()=>jobs.status('one',started.job_id).output_tail.includes('BEGIN'));
  assert.equal(jobs.status('one',started.job_id).status,'running');
  resolveDone();
  await eventually(()=>jobs.status('one',started.job_id).status==='completed');
  const done=jobs.status('one',started.job_id);
  assert.equal(done.exit_code,0);
  assert.match(done.output_tail,/DONE/);
  assert.ok(done.finished_at);
  assert.equal(done.status,'completed');
  assert.equal(jobs.cancel('one',started.job_id).status,'completed');
  const running=jobs.start('one','/tmp','sleep 20',5000);
  await eventually(()=>executed===2);
  const cancelling=jobs.cancel('one',running.job_id);
  assert.equal(cancelling.status,'cancelling');
  await eventually(()=>jobs.status('one',running.job_id).status==='cancelled');
  assert.equal(abortCount,1);
  assert.equal(jobs.status('one',running.job_id).status,'cancelled');
  const failed=jobs.start('one','/tmp','fail',5000);
  await eventually(()=>jobs.status('one',failed.job_id).status==='failed');
  assert.match(jobs.status('one',failed.job_id).error,/synthetic failure/);
  assert.equal(jobs.list('one').length,3);
  assert.throws(()=>jobs.status('one','guess'),/Unknown background job/);
  const named=jobs.start('one','/tmp','npm run lint',5000);
  assert.equal(named.command_label,'npm','Only a known executable name, not raw arguments, may appear in UI status');
  jobs.cancel('one',named.job_id);
  await eventually(()=>jobs.status('one',named.job_id).status==='cancelled');
  const big=jobs.start('one','/tmp','big',5000);
  await eventually(()=>jobs.status('one',big.job_id).status==='completed');
  assert.equal(jobs.status('one',big.job_id,16384).output_tail.length,16384);
  assert.equal(jobs.status('one',big.job_id,16384).truncated,true,
   'Bounded output tail must signal when older output was dropped');
  console.log('PASS background job ID, progress, completion, cancellation, failure, scope, interactive preflight');
 }finally{await jobs.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
