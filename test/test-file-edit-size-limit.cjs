'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
 './multi-window':{
  REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',
  authenticated:()=>false
 },
 './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function parse(raw){
 const line=raw.split('\n').find(x=>x.startsWith('data:'));
 return JSON.parse(line?line.slice(5).trim():raw);
}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-edit-size-'));
 const target=path.join(root,'sparse-large.txt');
 fs.writeFileSync(target,'header\n');
 fs.truncateSync(target,64*1024*1024+1);
 const server=new MCPServer(0,'127.0.0.1',{root:()=>root},
  {file:true,edit:true,shell:false});
 try{
  await server.start();
  const port=server.httpServer.address().port;
  const res=await fetch('http://127.0.0.1:'+port+'/mcp',{
   method:'POST',headers:{'content-type':'application/json',
    accept:'application/json,text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/call',
    params:{name:'replace_lines_code',arguments:{
     shell_id:'test-shell',path:'sparse-large.txt',
     startLine:1,endLine:1,originalCode:'header',content:'changed'
    }}})
  });
  assert.equal(res.status,200);
  const reply=parse(await res.text()).result;
  assert.equal(reply.isError,true,'File over the safe edit limit must be rejected');
  assert.match(reply.content[0].text,/too large|edit limit|maximum editable size/i,
   'The error must explicitly identify the size limit, not read the whole file');
  assert.equal(fs.statSync(target).size,64*1024*1024+1);
  const handle=fs.openSync(target,'r');
  const buffer=Buffer.alloc(7);
  try{assert.equal(fs.readSync(handle,buffer,0,7,0),7);}
  finally{fs.closeSync(handle);}
  assert.equal(buffer.toString('utf8'),'header\n');
  console.log('PASS large file edits refused before reading whole content');
 }finally{
  await server.stop();
  fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
