'use strict';
const assert=require('node:assert/strict');
const {restrictedShellApi}=require('../out/ai-access.js');
(async()=>{
 const log=[];
 let live=true;
 const shells={
  root:id=>id==='one'?'/safe/workspace':'/other',
  list:async()=>live?[{shell_id:'one',initial_cwd:'/safe/workspace'},
   {shell_id:'two',initial_cwd:'/other'}]:[],
  startBackground:async(id,command)=>{log.push('start:'+id);return{job_id:'a',command};},
  backgroundStatus:async(id,job)=>{log.push('status:'+id);return{job_id:job};},
  listBackgroundJobs:async id=>{log.push('list:'+id);return[{job_id:'a'}];},
  cancelBackground:async(id,job)=>{log.push('cancel:'+id);return{job_id:job};}
 };
 const readonly=restrictedShellApi(shells,'one','read','/safe/workspace');
 for(const action of [
  ()=>readonly.startBackground('one','safe'),
  ()=>readonly.backgroundStatus('one','a'),
  ()=>readonly.listBackgroundJobs('one'),
  ()=>readonly.cancelBackground('one','a')]){
  await assert.rejects(action(),/denies/,'Read-only AI must not control or inspect job output');
 }
 const shell=restrictedShellApi(shells,'one','shell','/safe/workspace');
 for(const action of [
  ()=>shell.startBackground('two','unsafe'),
  ()=>shell.backgroundStatus('two','a'),
  ()=>shell.listBackgroundJobs('two'),
  ()=>shell.cancelBackground('two','a')]){
  await assert.rejects(action(),/denies/,'AI gateway cannot access jobs of another shell');
 }
 assert.equal((await shell.startBackground('one','safe')).job_id,'a');
 assert.equal((await shell.backgroundStatus('one','a')).job_id,'a');
 assert.equal((await shell.listBackgroundJobs('one')).length,1);
 assert.equal((await shell.cancelBackground('one','a')).job_id,'a');
 assert.deepEqual(log,['start:one','status:one','list:one','cancel:one']);
 live=false;
 await assert.rejects(shell.cancelBackground('one','a'),/denies/,
  'A stale or removed terminal must not provide job access');
 assert.deepEqual(log,['start:one','status:one','list:one','cancel:one']);
 console.log('PASS per-AI background job operations require shell permission, exact shell, live root');
})().catch(e=>{console.error(e);process.exitCode=1;});
