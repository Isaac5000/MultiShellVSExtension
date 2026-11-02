'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
const {MCPServer}=proxyquire('../out/server.js',{
 './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(){}}}});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-modern-legacy-'));
const calls=[];let server,client;
const shell={shell_id:'selected',initial_cwd:root,origin:'automatic',busy:false,queued:0};
const api={root(id){assert.equal(id,'selected');return root;},list:async()=>[shell],
 windows(){return[{window_id:'window',workspace:root,online:true}];},
 native:async(id,kind,args)=>{calls.push({id,kind,args});return[];},
 execute:async(id,command)=>{calls.push({id,command});return{shell_id:id,command,output:'ok',exit_code:0,truncated:false};}};
(async()=>{
 const dir=path.join(root,'.agents/skills/example');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: example\ndescription: Legacy discovery\n---\n# Example\n');
 server=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:true});await server.start();
 client=new Client({name:'cached-schema-test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.httpServer.address().port+'/mcp')));
 const decode=async(name,args)=>{const result=await client.callTool({name,arguments:args});
  assert.equal(result.isError===true,false,result.content?.[0]?.text);return JSON.parse(result.content[0].text);};
 assert.deepEqual(await decode('get_diagnostics_code',{path:'@shell:selected',format:'json'}),[]);
 assert.equal(calls[0].id,'selected');assert.equal(calls[0].kind,'diagnostics');
 const skills=await decode('execute_shell_command_code',{cwd:'@mcp',command:'skills selected project'});
 assert.deepEqual(skills.names,['example']);
 const windows=await decode('execute_shell_command_code',{cwd:'@mcp',command:'windows'});
 assert.equal(windows.length,1);
 assert.equal((await decode('execute_shell_command_code',{cwd:'@mcp',command:'shells'}))[0].shell_id,'selected');
 assert.ok((await decode('execute_shell_command_code',{cwd:'@mcp',command:'help'})).usage.skills);
 assert.equal(calls.length,1,'Control discovery must not execute a terminal command');
 assert.equal((await decode('execute_shell_command_code',{cwd:'@shell:selected',command:'explicit'})).exit_code,0);
 assert.equal(calls[1].id,'selected');assert.equal(calls[1].command,'explicit');
 const denied=await client.callTool({name:'execute_shell_command_code',arguments:{command:'must_not_run',cwd:'/implicit'}});
 assert.equal(denied.isError,true);assert.equal(calls.length,2);
 // A mismatched routing header must still be rejected before execution.
 const response=await fetch('http://127.0.0.1:'+server.httpServer.address().port+'/mcp',{
  method:'POST',headers:{'content-type':'application/json',accept:'application/json','MCP-Protocol-Version':'2026-07-28',
   'Mcp-Method':'tools/call','Mcp-Name':'list_skill_names_code'},body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/call',
   params:{name:'execute_shell_command_code',arguments:{cwd:'@mcp',command:'skills selected project'},
    _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'mismatch',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}})});
 assert.ok(response.status>=400,'Legacy adaptation must not make a forged MCP routing header valid');await response.text();
 server.config.file=false;
 const disabled=await client.callTool({name:'execute_shell_command_code',arguments:{cwd:'@mcp',command:'skills selected project'}})
  .then(result=>({result}),error=>({error}));
 assert.ok(disabled.error||disabled.result?.isError,'Cached discovery cannot bypass disabled file reads');
 assert.equal(calls.length,2,'Disabled discovery must not fall through to terminal execution');
 console.log('PASS: official modern client uses cached legacy selectors and read-only controls without bypassing routing validation');
})().catch(error=>{console.error(error);process.exitCode=1;})
 .finally(async()=>{await client?.close().catch(()=>{});await server?.stop();fs.rmSync(root,{recursive:true,force:true});});