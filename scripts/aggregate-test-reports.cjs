'use strict';
const fs=require('node:fs'),path=require('node:path');

function aggregateReports(reports){
 const first=reports[0]||{};
 const batches=first.batches||0,total=first.total||0;
 const ids=new Set(),names=new Set(),duplicateSuites=[],errors=[];
 let passed=0,failed=0,attempted=0;
 for(const report of reports){
  if(!report||report.total!==total||report.batches!==batches||
     !Number.isInteger(report.batch)||report.batch<1||report.batch>batches){
   errors.push('Inconsistent batch metadata');continue;
  }
  if(ids.has(report.batch)){errors.push('Duplicate batch '+report.batch);}
  ids.add(report.batch);
  if(!Array.isArray(report.results)){errors.push('Missing test details for batch '+report.batch);continue;}
  if(report.selected!==report.results.length||report.completed!==report.results.length||
     report.success!==report.results.every(row=>row.passed===true)){
   errors.push('Incomplete or inconsistent batch '+report.batch);
  }
  for(const row of report.results){
   attempted++;
   if(names.has(row.file)){duplicateSuites.push(row.file);}
   names.add(row.file);
   if(row.passed===true){passed++;}else{failed++;}
  }
 }
 const missingBatches=[];
 for(let i=1;i<=batches;i++){if(!ids.has(i)){missingBatches.push(i);}}
 if(duplicateSuites.length){errors.push('Duplicate test suites: '+duplicateSuites.join(', '));}
 if(missingBatches.length){errors.push('Missing batches: '+missingBatches.join(', '));}
 if(names.size!==total){errors.push('Expected '+total+' unique suites, found '+names.size);}
 const success=batches>0&&total>0&&errors.length===0&&failed===0&&
  passed===total&&attempted===total;
 return {success,total,passed,failed,attempted,batchesExpected:batches,
  batchesReceived:ids.size,missingBatches,duplicateSuites,errors};
}
function main(){
 const dir=path.resolve(process.cwd(),process.argv[2]||'.vscode-test/test-results');
 const reports=fs.readdirSync(dir).filter(name=>/^batch-\d+\.json$/.test(name))
  .map(name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')));
 const summary=aggregateReports(reports);
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log('AGGREGATE '+summary.passed+'/'+summary.total+' passed across '+
  summary.batchesReceived+'/'+summary.batchesExpected+' batches');
 if(!summary.success){
  console.error('Incomplete or failing regression report: '+summary.errors.join('; '));
  process.exitCode=1;
 }
}
if(require.main===module){
 try{main();}catch(error){console.error('Aggregate report failed: '+error.message);process.exitCode=1;}
}
module.exports={aggregateReports};
