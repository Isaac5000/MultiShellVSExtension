'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
for(const platform of ['windows-latest','ubuntu-latest','macos-latest']){
 assert.ok(workflow.includes(platform),'CI matrix must cover '+platform);
}
for(const command of ['npm ci','npm run lint','npm run bundle','npm run package:all']){
 assert.ok(workflow.includes(command),'CI must run '+command);
}
for(let batch=1;batch<=5;batch++){
 assert.ok(workflow.includes('--batch='+batch+' --batches=5'),
  'CI must cover test batch '+batch);
}
assert.ok(workflow.includes('upload-artifact'),'CI should preserve test reports');
assert.ok(workflow.includes('node scripts/aggregate-test-reports.cjs'),
 'CI must aggregate all reports before publishing them');
const scripts=require('../package.json').scripts;
assert.ok(scripts['test:batch'].includes('scripts/run-tests.cjs'));
console.log('PASS Windows/Linux/macOS CI tests build, lint, all suite batches and package with reports');
