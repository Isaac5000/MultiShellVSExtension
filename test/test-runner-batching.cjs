'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const all=fs.readdirSync(path.join(root,'test')).filter(f=>/^test-.*\.cjs$/.test(f)).sort();
const cli=additional=>spawnSync(process.execPath,['scripts/run-tests.cjs',...additional],{
 cwd:root,encoding:'utf8',timeout:10000
});
const planned=[];
for(let batch=1;batch<=5;batch++){
 const output=cli(['--plan','--batches=5','--batch='+batch]);
 assert.equal(output.status,0,'plan should exit cleanly: '+output.stderr);
 const data=JSON.parse(output.stdout);
 assert.equal(data.batch,batch);
 assert.equal(data.batches,5);
 assert.equal(data.total,all.length);
 assert.equal(data.files.length,Math.floor(all.length/5)+(batch<=(all.length%5)?1:0));
 planned.push(...data.files);
}
assert.deepEqual(planned.slice().sort(),all,'All suites must occur exactly once across batches');
for(const flags of [
 ['--plan','--batches=5','--batch=0'],
 ['--plan','--batches=5','--batch=6'],
 ['--plan','--batch=1'],
 ['--plan','--batches=0','--batch=1']
])assert.notEqual(cli(flags).status,0,'Must reject invalid batch arguments: '+flags.join(' '));
const defaults=cli(['--plan']);
assert.equal(defaults.status,0);
assert.deepEqual(JSON.parse(defaults.stdout).files,all);
console.log('PASS batch planner partitions all '+all.length+' suites once, validates flags and retains full-suite default');
