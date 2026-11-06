'use strict';
const assert=require('node:assert/strict');
const {aggregateReports}=require('../scripts/aggregate-test-reports.cjs');
const report=(batch,batches,total,files)=>({
 batch,batches,total,selected:files.length,completed:files.length,
 passed:files.filter(x=>x.passed).length,failed:files.filter(x=>!x.passed).length,
 success:files.every(x=>x.passed),results:files
});
const a=report(1,2,3,[{file:'test-a.cjs',passed:true},{file:'test-b.cjs',passed:true}]);
const b=report(2,2,3,[{file:'test-c.cjs',passed:true}]);
const good=aggregateReports([a,b]);
assert.equal(good.success,true);
assert.equal(good.total,3);
assert.equal(good.passed,3);
assert.equal(good.failed,0);
const missing=aggregateReports([a]);
assert.equal(missing.success,false,'Missing CI batch must be reported as incomplete');
const duplicate=aggregateReports([a,report(2,2,3,[{file:'test-b.cjs',passed:true}])]);
assert.equal(duplicate.success,false,'Duplicate test suite must not count twice');
const failed=aggregateReports([a,report(2,2,3,[{file:'test-c.cjs',passed:false}])]);
assert.equal(failed.success,false);
assert.equal(failed.failed,1);
console.log('PASS aggregated suite summary detects missing, failing and duplicate batches');
