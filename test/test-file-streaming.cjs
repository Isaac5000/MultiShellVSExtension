'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function decode(raw){
  const message=raw.split('\n').find(line=>line.startsWith('data:'));
  return JSON.parse(message?message.slice(5):raw);
}
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-streaming-'));
  const big=path.join(dir,'large.txt'),small=path.join(dir,'small.txt');
  fs.writeFileSync(big,'first\r\n'+'x'.repeat(8_000_000)+'\nlast\n','utf8');
  fs.writeFileSync(small,'uno\r\ndos\r\n','utf8');
  const server=new MCPServer(0,'127.0.0.1',{root:()=>dir},{file:true,edit:false,shell:false});
  await server.start();
  const original=fs.promises.readFile;
  fs.promises.readFile=async(file,...rest)=>{
    if(path.resolve(file)===big)throw new Error('Whole-file read forbidden by regression test');
    return original.call(fs.promises,file,...rest);
  };
  try{
    const port=server.httpServer.address().port;
    async function read(file,args={}){
      const resp=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers:{
        'content-type':'application/json','accept':'application/json,text/event-stream'
      },body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{
        name:'read_file_code',arguments:{shell_id:'test',path:file,...args}
      }})});
      assert.equal(resp.status,200);
      return decode(await resp.text()).result;
    }
    const first=await read('large.txt',{startLine:1,endLine:1,maxCharacters:100});
    assert.equal(first.isError,false);
    assert.equal(first.content[0].text,'first');
    const tail=await read('large.txt',{startLine:3,endLine:4,maxCharacters:100});
    assert.equal(tail.content[0].text,'last\n');
    const normal=await read('small.txt',{maxCharacters:64});
    assert.equal(normal.content[0].text,'uno\ndos\n');
    const exceed=await read('large.txt',{maxCharacters:50});
    assert.equal(exceed.isError,true);
    assert.match(exceed.content[0].text,/maxCharacters/);
    const base64=await read('large.txt',{encoding:'base64',maxCharacters:100});
    assert.equal(base64.isError,true);
    assert.match(base64.content[0].text,/maxCharacters/);
    console.log('PASS: UTF-8 line streaming avoids loading large files, preserves line ranges/CRLF, bounds output and guards base64 allocation');
  }finally{
    fs.promises.readFile=original;
    await server.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
