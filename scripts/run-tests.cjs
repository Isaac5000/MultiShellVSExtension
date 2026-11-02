'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const folder=path.resolve(__dirname,'../test');
const files=fs.readdirSync(folder).filter(n=>/^test-.*\.cjs$/.test(n)).sort();
if(files.length<9){console.error('Expected at least 9 test suites, found '+files.length);process.exit(1);}
for(const file of files){
  const r=spawnSync(process.execPath,[path.join(folder,file)],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',timeout:120000});
  if(r.error){console.error('FAILED '+file+': '+r.error.message);process.exit(1);}
  if(r.status!==0){console.error('FAILED '+file);process.exit(r.status||1);}
}
console.log('PASS: '+files.length+' test suites');
