'use strict';
const assert=require('node:assert/strict');
const {resolveTestShell}=require('../scripts/test-shell-resolver.cjs');
const alias='C:\\Users\\Example\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
const spawned=[];
const fakeSpawn=(command,args)=>{
 spawned.push({command,args});
 if(command==='where.exe')return {status:0,stdout:alias+'\r\n'};
 if(command===alias&&args[0]==='--version')return {status:0,stdout:'PowerShell 7.6.9\r\n'};
 return {status:1,stdout:'',error:new Error('unexpected')};
};
assert.equal(resolveTestShell({platform:'win32',spawnSync:fakeSpawn}),alias,
 'A WindowsApps app execution alias is launchable even when fs.existsSync returns false');
assert.ok(spawned.some(s=>s.command===alias&&s.args[0]==='--version'));
assert.equal(resolveTestShell({platform:'win32',override:alias,spawnSync:fakeSpawn}),alias);
assert.throws(()=>resolveTestShell({
 platform:'win32',override:'PowerShell5.exe',
 spawnSync:()=>({status:0,stdout:'PowerShell 5.1'})}),/PowerShell 7/);
assert.throws(()=>resolveTestShell({
 platform:'win32',override:'fake.exe',
 spawnSync:()=>({status:null,stdout:'',error:new Error('not found')})}),/PowerShell 7/);
const unix=resolveTestShell({platform:'linux',spawnSync:(file,args)=>
 file==='which'?{status:0,stdout:'/usr/bin/pwsh\n'}:
 {status:0,stdout:'PowerShell 7.6.9\n'}});
assert.equal(unix,'/usr/bin/pwsh');
console.log('PASS PowerShell 7 resolver accepts launchable WindowsApps aliases and rejects missing/legacy versions');
