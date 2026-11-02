'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const z=require('zod');
const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
const {MCPServer}=proxyquire('../out/server.js',{
 'vscode':{},
 './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error('Server:',e);}}}
});
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-official-client-'));
 const dir=path.join(root,'.agents','skills','verified-skill');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),
  '---\nname: verified-skill\ndescription: Check modern client support\n---\n# Verified\n');
 const shells={
  root(id){if(id!=='v2')throw Error('Unknown id');return root;},
  list(){return [{shell_id:'v2',initial_cwd:root,origin:'automatic',
   recovery_required:false,timed_out_running:false,busy:false,queued:0}];},
  windows(){return [];}
 };
 const server=new MCPServer(0,'127.0.0.1',shells,{file:true,edit:false,shell:false});
 let client;
 try{
  await server.start();
  const port=server.httpServer.address().port;
  client=new Client({name:'official-v2-client',version:'1.0'},
   {versionNegotiation:{mode:{pin:'2026-07-28'}}});
  const transport=new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+port+'/mcp'));
  await client.connect(transport);
  assert.equal(client.getProtocolEra(),'modern');
  const list=await client.request({method:'skills/list',params:{}},z.any());

  assert.equal(list.skills.length,1);
  const uri=list.skills[0].uri;
  const read=await client.readResource({uri});
  assert.match(read.contents[0].text,/# Verified/);
  const get=await client.request({method:'skills/get',params:{uri}},
   z.object({skill:z.object({uri:z.string()})}).passthrough());
  assert.equal(get.skill.uri,uri);
  console.log('PASS: official MCP TypeScript v2 client pinned to 2026-07-28 connects, discovers, reads and verifies a skill');
 }finally{
  await client?.close().catch(()=>{});
  await server.stop();
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});