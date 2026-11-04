'use strict';
const assert=require('node:assert/strict');
const {registerNativeTools}=require('../out/tools/native-mcp-tools.js');
const registry=new Map();
const server={tool:(name,_description,schema,fn)=>registry.set(name,{schema,fn})};
let shells=[{shell_id:'primary',initial_cwd:'/repo'}];
const calls=[];
const api={list:async()=>shells,
 native:async(id,kind,args)=>{calls.push({id,kind,args});return{root:id,kind};}};
registerNativeTools(server,api);
(async()=>{
 const diag=registry.get('get_diagnostics_code');
 assert.ok(diag);
 const noShell=await diag.fn({path:'src/a.ts',severities:[0,1],format:'json',includeSource:true});
 assert.equal(noShell.isError,false);
 assert.equal(calls[0].id,'primary','legacy connector may omit shell_id only with one shell');
 shells=[{shell_id:'one'},{shell_id:'two'}];
 const ambiguous=await diag.fn({path:'src/a.ts',severities:[0,1],format:'text',includeSource:false});
 assert.equal(ambiguous.isError,true);
 assert.equal(calls.length,1,'ambiguous shell omission may not call native');
 const explicit=await diag.fn({shell_id:'two',path:'src/a.ts',severities:[0,1],format:'text',includeSource:false});
 assert.equal(explicit.isError,false);
 assert.equal(calls[1].id,'two');
 console.log('PASS native connector compatibility without shell_id for single-shell scope, fail closed for ambiguous windows');
})().catch(e=>{console.error(e);process.exitCode=1;});