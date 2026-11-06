'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'test');
const all=fs.readdirSync(folder).filter(n=>/^test-.*\.cjs$/.test(n)).sort();
if(all.length<9){throw Error('Expected at least 9 test suites, found '+all.length);}
function options(args){
 const opts={batch:1,batches:1,plan:false,report:null};
 let hasBatch=false,hasBatches=false;
 for(const arg of args){
  if(arg==='--plan'){opts.plan=true;continue;}
  if(arg.startsWith('--batch=')){opts.batch=Number(arg.slice(8));hasBatch=true;continue;}
  if(arg.startsWith('--batches=')){opts.batches=Number(arg.slice(10));hasBatches=true;continue;}
  if(arg.startsWith('--report=')){opts.report=arg.slice(9);continue;}
  throw Error('Unknown runner option: '+arg);
 }
 if(hasBatch!==hasBatches){throw Error('Use --batch=N and --batches=M together.');}
 if(!Number.isSafeInteger(opts.batch)||!Number.isSafeInteger(opts.batches)||
    opts.batches<1||opts.batch<1||opts.batch>opts.batches||opts.batches>all.length){
  throw Error('Invalid batch or batch count.');
 }
 if(opts.report!==null&&!opts.report.trim()){throw Error('Report path is empty.');}
 return opts;
}
function main(){
 const opts=options(process.argv.slice(2));
 const base=Math.floor(all.length/opts.batches),extra=all.length%opts.batches;
 const start=(opts.batch-1)*base+Math.min(opts.batch-1,extra);
 const count=base+(opts.batch<=extra?1:0);
 const files=all.slice(start,start+count);
 if(opts.plan){
  process.stdout.write(JSON.stringify({batch:opts.batch,batches:opts.batches,total:all.length,files})+'\n');
  return;
 }
 const begun=Date.now(),results=[];
 for(const file of files){
  const started=Date.now();
  const r=spawnSync(process.execPath,[path.join(folder,file)],{
   cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,
   // Preserve the caller's CI environment; do not change test modes implicitly.
   env:process.env
  });
  const passed=!r.error&&r.status===0;
  const row={file,passed,elapsedMs:Date.now()-started,
   ...(passed?{}:{exitCode:r.status,error:r.error?.message||'Test failed'})};
  results.push(row);
  if(passed){console.log('PASS '+file+' ('+row.elapsedMs+'ms)');continue;}
  console.error('FAIL '+file+': '+row.error+' (exit '+r.status+')');
  process.stderr.write(String(r.stdout||'').slice(-4500));
  process.stderr.write(String(r.stderr||'').slice(-4500));
  process.exitCode=1;break;
 }
 const passed=results.filter(r=>r.passed).length;
 const summary={batch:opts.batch,batches:opts.batches,total:all.length,selected:files.length,
  passed,failed:results.length-passed,completed:results.length,elapsedMs:Date.now()-begun,
  success:passed===files.length,results};
 console.log('BATCH '+opts.batch+'/'+opts.batches+': '+passed+'/'+files.length+
  ' passed; '+all.length+' suites available; '+summary.elapsedMs+'ms');
 if(opts.report){
  const target=path.resolve(root,opts.report);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(summary,null,2)+'\n');
 }
}
try{main();}catch(e){console.error('Test runner: '+e.message);process.exitCode=1;}
