'use strict';
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {validBearer,restrictedShellApi,scopedTools}=require('../out/ai-access.js');
(async()=>{
 const token=randomBytes(32).toString('base64url');
 assert.equal(validBearer('Bearer '+token,token),true);
 for(const value of ['bearer '+token,'Bearer '+token+'x','Bearer '+token+'\nX: injected',
   'Bearer '+token+',Bearer '+token,'Bearer '+'a'.repeat(43),'',undefined]){
   assert.equal(validBearer(value,token),false,'Invalid credential must be rejected');
 }
 const calls=[];
 const items=[{shell_id:'one',initial_cwd:'/safe/project'},
  {shell_id:'two',initial_cwd:'/other/project'}];
 const shells={
   list:async()=>items,
   root:id=>id==='one'?'/safe/project':'/other/project',
   execute:async(id,cmd)=>{calls.push([id,cmd]);return{command:cmd};},
   executeIsolated:async(id,cmd)=>{calls.push([id,cmd]);return{command:cmd};},
   create:()=>{throw Error('unexpected create');},close:()=>{throw Error('unexpected close');},
   windows:()=>[{window_id:'a',workspace:'/safe/project',online:true},
      {window_id:'b',workspace:'/other/project',online:true}],
   native:async(id,kind)=>({id,kind}),
   setAlias:async()=>{throw Error('unexpected alias');}
 };
 const read=restrictedShellApi(shells,'one','read','/safe/project');
 assert.deepEqual((await read.list()).map(x=>x.shell_id),['one']);
 assert.deepEqual(read.windows(),[]);
 assert.equal(read.root('one'),'/safe/project');
 assert.throws(()=>read.root('two'),/denies/);
 await assert.rejects(read.execute('one','get secret'),/denies/);
 await assert.rejects(read.execute('two','get secret'),/denies/);
 await assert.rejects(read.executeIsolated('two','get secret'),/denies/);
 assert.throws(()=>read.create('new'),/denies/);
 assert.throws(()=>read.close('one'),/denies/);
 await assert.rejects(read.setAlias('one','changed'),/denies/);
 await assert.rejects(read.native('two','diagnostics',{}),/denies/);
 assert.equal((await read.native('one','diagnostics',{})).id,'one');
 const exec=restrictedShellApi(shells,'one','shell','/safe/project');
 await exec.execute('one','safe test');
 await assert.rejects(exec.execute('two','unsafe'),/denies/);
 assert.deepEqual(calls,[['one','safe test']]);
 items[0]={shell_id:'one',initial_cwd:'/replaced/path'};
 await assert.rejects(exec.execute('one','stale shell'),/denies/);
 assert.deepEqual(await exec.list(),[]);
 assert.deepEqual(scopedTools('read',{file:true,edit:true,shell:true}),
   {file:true,edit:false,shell:false,globalSkills:false});
 assert.deepEqual(scopedTools('edit',{file:true,edit:true,shell:true}),
   {file:true,edit:true,shell:false,globalSkills:false});
 assert.deepEqual(scopedTools('shell',{file:true,edit:true,shell:true}),
   {file:true,edit:false,shell:true,globalSkills:false});
 assert.deepEqual(scopedTools('full',{file:false,edit:true,shell:true}),
   {file:false,edit:true,shell:true,globalSkills:false});
 console.log('PASS: per-AI exact shell scope, no cross-shell execution, deny mutations, constant-time bearer checks and global permission ceilings');
})().catch(e=>{console.error(e);process.exitCode=1;});
