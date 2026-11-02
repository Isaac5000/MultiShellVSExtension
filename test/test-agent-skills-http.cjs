'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const vscodeMock={};
const {MCPServer}=proxyquire('../out/server.js',{
 'vscode':vscodeMock,
 './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error('MCP:',e);}}}
});
function setup(dir,name){
 const skill=path.join(dir,'.agents','skills',name);
 fs.mkdirSync(path.join(skill,'references'),{recursive:true});
 fs.writeFileSync(path.join(skill,'SKILL.md'),
  '---\nname: '+name+'\ndescription: Run a workflow for '+name+'\n---\n\n# '+name+'\n\nSee references/DETAIL.md.\n');
 fs.writeFileSync(path.join(skill,'references','DETAIL.md'),'Details for '+name);
}
function parse(text){
 if(text.startsWith('data:'))return JSON.parse(text.substring(5).trim());
 if(text.includes('\ndata:'))return JSON.parse(text.split('\n').find(x=>x.startsWith('data:')).slice(5).trim());
 return JSON.parse(text);
}
(async()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-http-skills-a-'));
 const b=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-http-skills-b-'));
 setup(a,'alpha-workflow');
 setup(b,'beta-workflow');
 const api={
  list(){return [{shell_id:'shell_a',initial_cwd:a,origin:'automatic',busy:false,queued:0},
                {shell_id:'shell_b',initial_cwd:b,origin:'automatic',busy:false,queued:0}];},
  root(id){if(id==='shell_a')return a;if(id==='shell_b')return b;throw Error('Unknown shell: '+id);}
 };
 const server=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:false});
 try{
  await server.start();
  const port=server.httpServer.address().port;
  let count=0;
  const rpc=async(method,params={})=>{
   const res=await fetch('http://127.0.0.1:'+port+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:++count,method,params})
   });
   assert.equal(res.status,200,method+': HTTP '+res.status);
   const body=parse(await res.text());
   assert.equal(body.error,undefined,method+': '+JSON.stringify(body.error));
   return body.result;
  };
  await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},
   clientInfo:{name:'skills-test',version:'1'}});
  const tools=(await rpc('tools/list')).tools.map(t=>t.name);
  for(const tool of ['list_skills_code','read_skill_code','read_skill_file_code']){
   assert.ok(tools.includes(tool),'Missing skill tool '+tool);
  }
  const call=async(name,args)=>{
   const result=await rpc('tools/call',{name,arguments:args});
   return {isError:result.isError,body:JSON.parse(result.content[0].text)};
  };
  const listed=await call('list_skills_code',{shell_id:'shell_a'});
  assert.equal(listed.body.skills.length,1);
  assert.equal(listed.body.skills[0].name,'alpha-workflow');
  assert.deepEqual((await call('list_skills_code',{shell_id:'shell_b'})).body.skills.map(x=>x.name),
   ['beta-workflow']);
  const selection='.agents/skills/alpha-workflow';
  const read=await call('read_skill_code',{shell_id:'shell_a',skill_path:selection});
  assert.match(read.body.content,/# alpha-workflow/);
  const ref=await call('read_skill_file_code',{shell_id:'shell_a',
   skill_path:selection,file:'references/DETAIL.md'});
  assert.equal(ref.body.content,'Details for alpha-workflow');
  assert.equal((await call('read_skill_file_code',{shell_id:'shell_a',
   skill_path:selection,file:'../beta-workflow/SKILL.md'})).isError,true);
  assert.equal((await call('read_skill_code',{shell_id:'shell_b',skill_path:selection})).isError,true);

  const listedResources=await rpc('resources/list');
  assert.ok(listedResources.resources.some(resource=>resource.uri==='skill://index.json'));
  const templates=await rpc('resources/templates/list');
  assert.ok(templates.resourceTemplates.some(t=>t.uriTemplate==='skill://workspace/{+skillFile}'));
  const indexRead=await rpc('resources/read',{uri:'skill://index.json'});
  const index=JSON.parse(indexRead.contents[0].text);
  assert.equal(index.skills.length,2);
  assert.deepEqual(index.skills.map(s=>s.name).sort(),['alpha-workflow','beta-workflow']);
  assert.ok(index.skills.every(s=>s.type==='skill-md'&&s.url.endsWith('/SKILL.md')));
  const resource=await rpc('resources/read',{uri:index.skills[0].url});
  assert.match(resource.contents[0].text,/alpha-workflow/);
  const sibling=await rpc('resources/read',{
   uri:index.skills[0].url.replace('/SKILL.md','/references/DETAIL.md')});
  assert.equal(sibling.contents[0].text,'Details for alpha-workflow');
  // Disabling file reads must also disable Agent Skills, regardless of
  // whether edit or shell tools remain available.
  const denied=new MCPServer(0,'127.0.0.1',api,{file:false,edit:true,shell:false});
  try{
   await denied.start();
   const deniedPort=denied.httpServer.address().port;
   const request=async(method,params={})=>{
    const response=await fetch('http://127.0.0.1:'+deniedPort+'/mcp',{
     method:'POST',
     headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
     body:JSON.stringify({jsonrpc:'2.0',id:888,method,params})
    });
    assert.equal(response.status,200);
    return parse(await response.text());
   };
   const disabledList=await request('tools/list');
   assert.ok(!disabledList.result.tools.some(t=>t.name.includes('skill')),
    'No skills tools should be exposed if file reading is disabled');
   const disabledResources=await request('resources/list');
   assert.ok(disabledResources.error,'No skills resources should be exposed');
  }finally{await denied.stop();}
  console.log('PASS: MCP tools and skill:// resources, 2 workspace windows, independent skill roots and safe on-demand reads');
 }finally{await server.stop();fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});