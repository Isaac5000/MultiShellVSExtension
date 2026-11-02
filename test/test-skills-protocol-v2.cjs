'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
 'vscode':{},
 './multi-window':{REGISTER_PATH:'/_multishell/register',
   CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error('MCP:',e);}}}
});
const metadata={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
 'io.modelcontextprotocol/clientInfo':{name:'multi-skills-v2-test',version:'1'},
 'io.modelcontextprotocol/clientCapabilities':{}};
const roots=[fs.mkdtempSync(path.join(os.tmpdir(),'mcp-skills-modern-A-')),
 fs.mkdtempSync(path.join(os.tmpdir(),'mcp-skills-modern-B-'))];
let server;
async function main(){
 const docs=[];
 for(let i=0;i<2;i++){
  const d=path.join(roots[i],'.agents','skills','sample-skill');
  fs.mkdirSync(path.join(d,'references'),{recursive:true});
  const content='---\nname: sample-skill\ndescription: Example for workspace '+i+'\nlicense: MIT\n---\n\n# Skill '+i+'\n';
  const reference='Project '+i+' reference';
  fs.writeFileSync(path.join(d,'SKILL.md'),content);
  fs.writeFileSync(path.join(d,'references','RULES.md'),reference);
  docs.push({content,reference});
 }
 const api={
  root(id){const i=['A','B'].indexOf(id);if(i<0)throw Error('Unknown shell '+id);return roots[i];},
  list(){return ['A','B'].map((id,i)=>({shell_id:id,initial_cwd:roots[i],
    origin:'automatic',busy:false,queued:0,timed_out_running:false,recovery_required:false}));},
  windows(){return [];}
 };
 server=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:false});
 await server.start();
 const port=server.httpServer.address().port;
 let id=0;
 async function call(method,params={},modern=true){
  const r=await fetch('http://127.0.0.1:'+port+'/mcp',{
   method:'POST',headers:{'content-type':'application/json',
     accept:'application/json, text/event-stream',
     ...(modern?{'MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,
       ...((method==='resources/read'||method==='tools/call')?{'Mcp-Name':method==='resources/read'?params.uri:params.name}:{})}:{})},
   signal:AbortSignal.timeout(10000),
   body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params:modern?
     {...params,_meta:metadata}:params})
  });
  const text=await r.text();
  assert.equal(r.status,200,method+' status '+text.slice(0,1600));
  const data=text.includes('data:')?JSON.parse(text.split(/\r?\n/)
    .find(x=>x.startsWith('data:')).slice(5)):JSON.parse(text);
  return data;
 }
 const discover=await call('server/discover');
 assert.equal(discover.error,undefined,JSON.stringify(discover.error));
 assert.ok(discover.result.supportedVersions.includes('2026-07-28'));
 assert.deepEqual(discover.result.capabilities.extensions['io.modelcontextprotocol/skills'],
   {directoryRead:false});
 const skills=(await call('skills/list')).result;
 assert.equal(skills.resultType,'complete');
 assert.equal(skills.skills.length,2);
 assert.equal(skills.cacheScope,'private');
 assert.equal(skills.skills[0].frontmatter.license,'MIT');
 assert.ok(skills.skills.every(entry=>entry.resources.length===2));
 const uris=skills.skills.map(s=>s.uri);
 assert.equal(new Set(uris).size,2,'Same-named skills in different projects must not shadow');
 for(let i=0;i<2;i++){
  const uri='skill://workspace/'+(['A','B'][i])+'/agents/sample-skill/SKILL.md';
  const get=await call('skills/get',{uri});
  assert.equal(get.error,undefined,JSON.stringify(get.error));
  const entry=get.result.skill;
  assert.equal(entry.uri,uri);
  assert.equal(entry.frontmatter.description,'Example for workspace '+i);
  const digest='sha256:'+crypto.createHash('sha256')
   .update(Buffer.from(docs[i].content)).digest('hex');
  assert.equal(entry.resources.find(x=>x.uri===uri).digest,digest);
  assert.equal(entry.resources.find(x=>x.uri===uri).size,Buffer.byteLength(docs[i].content));
  const body=await call('resources/read',{uri});
  assert.equal(body.error,undefined,JSON.stringify(body.error));
  assert.match(body.result.contents[0].text,new RegExp('Skill '+i));
  const rulesUri=uri.replace('/SKILL.md','/references/RULES.md');
  const rules=await call('resources/read',{uri:rulesUri});
  assert.equal(rules.result.contents[0].text,docs[i].reference);
 }
 const invalid=await call('skills/get',{uri:'skill://workspace/A/agents/not-found/SKILL.md'});
 assert.equal(invalid.error.code,-32602);
 const badFile=await call('resources/read',
  {uri:'skill://workspace/A/agents/sample-skill/references/../../secret.txt'});
 assert.ok(badFile.error,'Traversal path should never be read');
 const tools=(await call('tools/list')).result.tools.map(x=>x.name);
 for(const name of ['list_skills_code','read_skill_code','read_skill_file_code']){
  assert.ok(tools.includes(name),'Modern tool missing '+name);
 }
 const tool=await call('tools/call',{name:'list_skills_code',arguments:{shell_id:'A'}});
 assert.equal(JSON.parse(tool.result.content[0].text).skills.length,1);
 // Pagination is required by MCP Skills. A skill absent from an
 // individual page must remain addressable through skills/get by its URI.
 for(let j=0;j<23;j++){
  const name='additional-'+j;
  const d=path.join(roots[0],'.agents','skills',name);
  fs.mkdirSync(d,{recursive:true});
  fs.writeFileSync(path.join(d,'SKILL.md'),
   '---\nname: '+name+'\ndescription: Page '+j+'\n---\n# '+name+'\n');
 }
 const firstPage=(await call('skills/list')).result;
 assert.equal(firstPage.skills.length,20);
 assert.ok(firstPage.nextCursor);
 const secondPage=(await call('skills/list',{cursor:firstPage.nextCursor})).result;
 assert.equal(secondPage.skills.length,5);
 assert.equal(secondPage.nextCursor,undefined);
 assert.equal(new Set([...firstPage.skills,...secondPage.skills].map(x=>x.uri)).size,25);
 assert.equal((await call('skills/list',{cursor:'-1'})).error.code,-32602);
 const legacy=await call('initialize',{protocolVersion:'2025-03-26',
   capabilities:{},clientInfo:{name:'legacy',version:'1'}},false);
 assert.equal(legacy.error,undefined,'Legacy MCP was damaged');
 assert.equal(legacy.result.protocolVersion,'2025-03-26');
 console.log('PASS: official v2 discovery, skills/list/get, frontmatter, SHA-256, resources/read, duplicate names, workspace isolation, old MCP initialize');
}
main().catch(e=>{console.error(e);process.exitCode=1;})
.finally(async()=>{await server?.stop();for(const r of roots)fs.rmSync(r,{force:true,recursive:true});});