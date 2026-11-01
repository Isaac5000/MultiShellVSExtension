'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function parse(raw){
  const row=raw.split('\n').find(x=>x.startsWith('data:'));
  return JSON.parse(row?row.slice(5):raw);
}
async function main(){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-hardening-'));
  const shells={root:()=>folder};
  for(const [file,edit] of [[true,false],[false,true],[false,false],[true,true]]){
    const server=new MCPServer(0,'127.0.0.1',shells,{file,edit,shell:false});
    await server.start();
    try{
      const port=server.httpServer.address().port;
      const endpoint='http://127.0.0.1:'+port+'/mcp';
      async function request(method,params={},headers={}){
        const response=await fetch(endpoint,{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json,text/event-stream',...headers},
          body:JSON.stringify({jsonrpc:'2.0',id:100,method,params})
        });
        return {status:response.status,data:parse(await response.text())};
      }
      const list=await request('tools/list');
      assert.equal(list.status,200,'No-auth tunnel requests must remain supported');
      const names=list.data.result.tools.map(x=>x.name);
      assert.equal(names.includes('read_file_code'),file);
      assert.equal(names.includes('create_file_code'),edit);
      const init=await request('initialize',{
        protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'tunnel-compat-probe',version:'1'}
      });
      assert.equal(init.data.result.serverInfo.version,require('../package.json').version);
      assert.equal((await request('tools/list',{}, {Origin:'http://127.0.0.1:'+port})).status,200);
      assert.equal((await request('tools/list',{}, {Origin:'https://untrusted.invalid'})).status,403);
      const rawHost=(host,origin)=>new Promise((resolve,reject)=>{
        const req=http.request({hostname:'127.0.0.1',port,path:'/mcp',method:'POST',headers:{
          Host:host, ...(origin?{Origin:origin}:{}),
          'content-type':'application/json','accept':'application/json,text/event-stream'
        }},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
        req.on('error',reject);
        req.end(JSON.stringify({jsonrpc:'2.0',id:101,method:'tools/list',params:{}}));
      });
      assert.equal(await rawHost('attacker.example'),403);
      assert.equal(await rawHost('attacker.example','https://chatgpt.com'),403);
      assert.equal(await rawHost('localhost:'+port),200);
      if(file){
        const failed=await request('tools/call',{
          name:'read_file_code',arguments:{shell_id:'test',path:'missing.txt'}
        });
        assert.equal(failed.data.result.isError,true,'File tool failures must use MCP isError');
      }
    }finally{await server.stop();}
  }
  fs.rmSync(folder,{recursive:true,force:true});
  console.log('PASS: independently enforced file/edit permissions, valid MCP errors, Origin guard, current protocol version and existing no-auth tunnel endpoint');
}
main().catch(e=>{console.error(e);process.exitCode=1;});