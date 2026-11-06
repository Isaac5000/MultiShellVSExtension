'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const workflows=path.join(root,'.github','workflows');
const installed=fs.existsSync(workflows)?
 fs.readdirSync(workflows).filter(name=>/\.ya?ml$/i.test(name)):[];
assert.deepEqual(installed,[],
 'No GitHub Actions workflows should run on push, PR or release (billing restriction)');
const scripts=require('../package.json').scripts;
for(const command of ['lint','bundle','test:multishell','test:batch','package']){
 assert.equal(typeof scripts[command],'string',
  command+' must remain executable locally without GitHub Actions');
}
assert.ok(scripts['test:multishell'].includes('scripts/run-tests.cjs'),
 'All regression suites must remain runnable locally');
assert.ok(scripts.package.includes('package-platform-tunnel.cjs'),
 'Local release packaging must still include the official native tunnel');
assert.ok(fs.existsSync(path.join(root,'scripts','aggregate-test-reports.cjs')),
 'Regression results must remain aggregatable locally');
console.log('PASS: no paid GitHub Actions workflows; local tests, lint, bundle and native VSIX packaging preserved');
