'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment,rpc,tool}=require('./connection-fixture.cjs');
(async()=>{
 const env=await environment(1);env.hub.config.file=true;let client;
 function write(source,name,description){const dir=path.join(env.workers[0].workspace,source,name);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: '+name+'\ndescription: '+description+'\n---\n# Instructions\n');}
 try{
  for(let i=0;i<121;i++)write('.agents/skills','workflow-'+String(i).padStart(3,'0'),i===120?'Repair a broken compilation':'General work');
  const args={shell_id:'connection_0'};
  const found=await tool(env.port,'find_skills_code',{...args,query:'compilation'});
  assert.deepEqual(found.skills.map(s=>s.name),['workflow-120'],'Description search must reach past entry 100 in the owning worker');
  const first=await tool(env.port,'list_skills_code',{...args,scope:'project'});assert.equal(first.skills.length,100);assert.ok(first.next_cursor);
  const second=await tool(env.port,'list_skills_code',{...args,scope:'project',cursor:first.next_cursor});assert.equal(second.skills.length,21);
  assert.equal(new Set([...first.skills,...second.skills].map(s=>s.skill_path)).size,121);
  const loaded=await tool(env.port,'load_skill_code',{...args,skill:'workflow-120'});
  assert.match(loaded.content,/Instructions/);assert.equal(loaded.execution_authorized,false);assert.equal(loaded.next.arguments.skill_path,'.agents/skills/workflow-120');
  write('.github/skills','workflow-120','Another source');
  const ambiguous=await rpc(env.port,'tools/call',{name:'load_skill_code',arguments:{...args,skill:'workflow-120'}});
  assert.equal(ambiguous.result.isError,true);assert.equal(JSON.parse(ambiguous.result.content[0].text).candidates.length,2);
  assert.equal((await tool(env.port,'load_skill_code',{...args,skill:'.github/skills/workflow-120'})).metadata.source,'github');
  const denied=await rpc(env.port,'tools/call',{name:'load_skill_code',arguments:{...args,skill:'@global/agents/private',scope:'global'}});
  assert.equal(denied.result.isError,true);
  assert.equal(env.issued.length,0,'Finding and loading skills must never execute terminal commands');
  const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
  client=new Client({name:'easy-skills',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+env.port+'/mcp')));
  const modern=await client.callTool({name:'find_skills_code',arguments:{...args,query:'compilation'}});
  assert.notEqual(modern.isError,true);const selection=JSON.parse(modern.content[0].text).skills[0];
  const modernLoad=await client.callTool({name:'load_skill_code',arguments:selection.load_arguments});
  assert.notEqual(modernLoad.isError,true);assert.match(JSON.parse(modernLoad.content[0].text).content,/Instructions/);
  const latePage=await client.request({method:'skills/list',params:{cursor:'120'}},require('zod').any());
  assert.equal(latePage.skills.length,2,'Native MCP Skills must also discover catalog entries beyond 100');
  console.log('PASS: owner-worker search beyond 100 entries, pagination, loading by name, ambiguous selection, global denial and zero terminal execution');
 }finally{await client?.close();await env.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
