'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');

const pkg=require('../package.json');
assert.ok(pkg.dependencies['@modelcontextprotocol/server']);
assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'],undefined,
 'SDK v1 must no longer be a runtime dependency');
assert.equal(pkg.devDependencies?.['@modelcontextprotocol/sdk'],undefined,
 'SDK v1 must no longer be a test dependency');
for(const dir of ['src','test']){
 const queue=[path.resolve(__dirname,'..',dir)];
 while(queue.length){
  const directory=queue.pop();
  for(const e of fs.readdirSync(directory,{withFileTypes:true})){
   const file=path.join(directory,e.name);
   if(e.isDirectory())queue.push(file);
   else if(/\.(?:ts|cjs)$/.test(e.name)&&e.name!=='test-sdk-v2-migration.cjs'){
    const src=fs.readFileSync(file,'utf8');
    assert.equal(src.includes("@modelcontextprotocol/sdk"),false,
     'An old SDK import remains: '+file);
   }
  }
 }
}
const {MCPServer}=proxyquire('../out/server.js',{
 vscode:{},
 './multi-window':{REGISTER_PATH:'/_multishell/register',
   CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-v2-dual-era-'));
const skill=path.join(root,'.agents','skills','dual-era');
fs.mkdirSync(skill,{recursive:true});
fs.writeFileSync(path.join(skill,'SKILL.md'),
 '---\nname: dual-era\ndescription: Compatible with both MCP protocol eras\n---\n# Dual era\n');
let hub;
const clients=[];
async function main(){
 const api={
  root(id){assert.equal(id,'selected');return root;},
  list:async()=>[{shell_id:'selected',initial_cwd:root,origin:'automatic',
   busy:false,queued:0,recovery_required:false}],
  windows:()=>[{window_id:'win',workspace:root,online:true}]
 };
 hub=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:false});
 await hub.start();
 const url=new URL('http://127.0.0.1:'+hub.httpServer.address().port+'/mcp');
 const modern=new Client({name:'modern-client',version:'1'},
  {versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const legacy=new Client({name:'legacy-client',version:'1'});
 clients.push(modern,legacy);
 await Promise.all([modern.connect(new StreamableHTTPClientTransport(url)),
  legacy.connect(new StreamableHTTPClientTransport(url))]);
 assert.equal(modern.getProtocolEra(),'modern');
 assert.equal(legacy.getProtocolEra(),'legacy');
 const [a,b]=await Promise.all([modern.listTools(),legacy.listTools()]);
 const names=items=>items.tools.map(tool=>tool.name).sort();
 assert.deepEqual(names(a),names(b),'Both eras should expose identical tools');
 assert.ok(names(a).includes('list_skill_names_code'));
 assert.equal(a.tools.some(x=>x.name==='execute_shell_command_code'),false,
  'Disabled shell execution must not appear in either era');

 for(const client of [modern,legacy]){
  const result=await client.callTool({name:'list_skill_names_code',
   arguments:{shell_id:'selected',scope:'project'}});
  assert.equal(result.isError===true,false);
  const parsed=JSON.parse(result.content[0].text);
  assert.deepEqual(parsed.names,['dual-era']);
  const resource=await client.readResource({uri:'skill://index.json'});
  const index=JSON.parse(resource.contents[0].text);
  assert.ok(index.skills.some(s=>s.name==='dual-era'));
 }
 const modernTool=await modern.callTool({name:'list_skill_names_code',
  arguments:{shell_id:'selected'}});
 assert.equal(modernTool.isError===true,false);
 // The SDK client normalizes the result before exposing it. Verify the raw
 // modern wire contains the required resultType instead.
 const rawRequest={jsonrpc:'2.0',id:141,method:'tools/call',params:{
  name:'list_skill_names_code',arguments:{shell_id:'selected'},
  _meta:{
   'io.modelcontextprotocol/protocolVersion':'2026-07-28',
   'io.modelcontextprotocol/clientInfo':{name:'raw-v2-check',version:'1'},
   'io.modelcontextprotocol/clientCapabilities':{}
  }
 }};
 const rawResponse=await fetch(url,{method:'POST',headers:{
  'content-type':'application/json',accept:'application/json, text/event-stream',
  'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call',
  'Mcp-Name':'list_skill_names_code'
 },body:JSON.stringify(rawRequest)});
 assert.equal(rawResponse.status,200);
 const rawText=await rawResponse.text();
 const sse=rawText.split(/\r?\n/).find(line=>line.startsWith('data:'));
 const rawReply=JSON.parse(sse?sse.slice(5):rawText);
 assert.equal(rawReply.result.resultType,'complete',
  '2026-07-28 tools/call requires explicit resultType');
 const legacyTool=await legacy.callTool({name:'list_skill_names_code',
  arguments:{shell_id:'selected'}});
 assert.equal(legacyTool.isError===true,false);
 assert.equal(hub.isHealthy(),true);
 assert.equal(hub.sessions.size,0,'Stateless requests must not leak on idle');

 const hostile=await fetch(url,{method:'POST',headers:{
  'content-type':'application/json',accept:'application/json',
  origin:'https://attacker.invalid'
 },body:JSON.stringify({jsonrpc:'2.0',id:55,method:'tools/list',params:{}})});
 assert.equal(hostile.status,403,'Untrusted browser Origin must remain blocked');
 await hostile.text();

 console.log('PASS: SDK v2-only dependency/imports, official dual-era clients, same tools/resources, mandatory resultType, permissions, loopback HTTP and lifecycle');
}
main().catch(e=>{console.error(e);process.exitCode=1;})
.finally(async()=>{await Promise.all(clients.map(c=>c.close().catch(()=>{})));
 await hub?.stop();fs.rmSync(root,{recursive:true,force:true});});