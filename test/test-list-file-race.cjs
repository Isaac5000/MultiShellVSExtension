'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerScopedFileTools}=require('../out/tools/scoped-file-tools.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-list-race-inside-'));
const outside=fs.mkdtempSync(path.join(os.tmpdir(),'ms-list-race-outside-'));
const box=path.join(root,'box'),parked=path.join(root,'parked');
const tools=new Map();
registerScopedFileTools({tool:(name,_desc,_schema,fn)=>tools.set(name,fn)},
 {root:()=>root},{file:true,edit:false});
(async()=>{
 fs.mkdirSync(box);fs.writeFileSync(path.join(outside,'outside-only-canary.txt'),'');
 const original=fs.promises.readdir;
 let swapped=false,available=true;
 fs.promises.readdir=async function(directory,...args){
  if(String(directory)===box&&!swapped){
   fs.renameSync(box,parked);
   try{
    fs.symlinkSync(outside,box,process.platform==='win32'?'junction':'dir');
   }catch(error){
    available=false;
    fs.renameSync(parked,box);
    return original.call(this,directory,...args);
   }
   try{
    swapped=true;
    return await original.call(this,directory,...args);
   }finally{
    fs.unlinkSync(box);
    fs.renameSync(parked,box);
   }
  }
  return original.call(this,directory,...args);
 };
 try{
  const result=await tools.get('list_files_code')({shell_id:'probe',path:'box',recursive:false});
  if(!available){
   console.log('SKIP: test environment cannot create a directory junction.');
  }else{
   assert.equal(swapped,true);
   assert.equal(result.isError,true,'Listing a swapped directory must be rejected');
   assert.equal(JSON.stringify(result).includes('outside-only-canary.txt'),false,
    'Outside directory filenames must not escape through list_files_code');
   console.log('PASS: swapped directory listing cannot disclose external filenames');
  }
 }finally{
  fs.promises.readdir=original;
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(outside,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
