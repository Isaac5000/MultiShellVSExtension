'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeShellManager {
 constructor(){this.data=new Map();}
 create(id,cwd){this.data.set(id,cwd);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};}
 list(){return [...this.data].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
 root(id){if(!this.data.has(id))throw Error('Unknown owner shell '+id);return this.data.get(id);}
 close(id){this.data.delete(id);}
 dispose(){}
}
const multi=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager:FakeShellManager}});
const {MCPServer}=proxyquire('../out/server.js',{
 'vscode':{},
 './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error(e);}}}
});
function make(base,relative,name,description){
 const dir=path.join(base,...relative.split('/'),name);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),
  '---\nname: '+name+'\ndescription: '+description+'\n---\n# '+description+'\n');
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-routing-'));
const A=path.join(root,'window-A'),B=path.join(root,'window-B');
const HA=path.join(root,'home-A'),HB=path.join(root,'home-B');
for(const d of [A,B,HA,HB])fs.mkdirSync(d,{recursive:true});
make(A,'.agents/skills','collision','Workspace A');
make(B,'.agents/skills','collision','Workspace B');
make(HA,'.agents/skills','global-same','Machine A');
make(HB,'.agents/skills','global-same','Machine B');
const secret='e'.repeat(64);
const wa=new multi.WindowWorker(new FakeShellManager(),secret,A,undefined,undefined,false,()=>true,HA);
let consentB=false;
const wb=new multi.WindowWorker(new FakeShellManager(),secret,B,undefined,undefined,false,()=>consentB,HB);
let server;
async function run(){
 await wa.start();await wb.start();
 const router=new multi.WindowRouter(secret);
 try{
  router.register({window_id:wa.id,workspace:A,worker_port:wa.port,machine_id:'a'.repeat(20)});
  router.register({window_id:wb.id,workspace:B,worker_port:wb.port,machine_id:'b'.repeat(20)});
  await router.create('shell_A',A,false,wa.id);
  await router.create('shell_B',B,false,wb.id);
  const shells=await router.list();
  assert.equal(shells.find(x=>x.shell_id==='shell_A').machine_id,'a'.repeat(20));
  assert.equal(shells.find(x=>x.shell_id==='shell_B').machine_id,'b'.repeat(20));
  assert.equal(new Set(router.windows().map(x=>x.machine_id)).size,2);

  // Simulated foreign machine: the hub's path is NOT locally usable.
  // Owner worker still resolves its own true workspace + personal home.
  router.assigned.get('shell_A').cwd=path.join(root,'inaccessible-remote-A');
  router.assigned.get('shell_B').cwd=path.join(root,'inaccessible-remote-B');
  assert.ok(!fs.existsSync(router.root('shell_A')));
  assert.deepEqual((await router.skillList('shell_A','all',true)).skills.map(x=>x.name),
    ['collision','global-same']);
  const denied=await router.skillList('shell_B','all',true);
  assert.deepEqual(denied.skills.map(x=>x.name),['collision']);
  assert.ok(denied.warnings.some(x=>/disabled in the owning/i.test(x)));
  await assert.rejects(router.skillRead('shell_B','@global/agents/global-same',{includeGlobal:true}),
    /Global Codex skills are disabled/);
  assert.match((await router.skillRead('shell_A','.agents/skills/collision',{})).content,/Workspace A/);
  assert.match((await router.skillRead('shell_B','.agents/skills/collision',{})).content,/Workspace B/);
  assert.match((await router.skillRead('shell_A','@global/agents/global-same',{includeGlobal:true})).content,/Machine A/);
  consentB=true;
  assert.match((await router.skillRead('shell_B','@global/agents/global-same',{includeGlobal:true})).content,/Machine B/);
  const manifestA=await router.skillManifest('shell_A','@global/agents/global-same',{includeGlobal:true});
  const manifestB=await router.skillManifest('shell_B','@global/agents/global-same',{includeGlobal:true});
  assert.notEqual(manifestA.uri,manifestB.uri);
  assert.notEqual(manifestA.resources[0].digest,manifestB.resources[0].digest);

  server=new MCPServer(0,'127.0.0.1',router,{file:true,edit:false,shell:false,globalSkills:true});
  await server.start();
  const port=server.httpServer.address().port;
  let n=0;
  async function rpc(method,params={},modern=false){
   const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
    method:'POST',headers:{'content-type':'application/json',
     accept:'application/json, text/event-stream',
     ...(modern?{'MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,
       ...((method==='resources/read'||method==='tools/call')?
        {'Mcp-Name':method==='resources/read'?params.uri:params.name}:{})}:{})},
    body:JSON.stringify({jsonrpc:'2.0',id:++n,method,params:modern?
     {...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',
      'io.modelcontextprotocol/clientInfo':{name:'test',version:'1'},
      'io.modelcontextprotocol/clientCapabilities':{}}}:params})
   });
   assert.equal(response.status,200,method);
   const text=await response.text();
   return JSON.parse(text.includes('data:')?text.split(/\r?\n/).find(x=>x.startsWith('data:')).slice(5):text);
  }
  for(const [id,expected] of [['shell_A','Workspace A'],['shell_B','Workspace B']]){
   const response=await rpc('tools/call',{name:'read_skill_code',
    arguments:{shell_id:id,skill_path:'.agents/skills/collision'}});
   assert.equal(response.result.isError,false);
   assert.match(JSON.parse(response.result.content[0].text).content,new RegExp(expected));
  }
  const modern=(await rpc('skills/list',{},true)).result;
  assert.equal(modern.skills.length,4,'Same-named global and project skills must remain per-window');
  const indexes=await rpc('resources/read',{uri:'skill://index.json'});
  const index=JSON.parse(indexes.result.contents[0].text);
  assert.equal(index.skills.length,4);
  for(const [id,expected] of [['shell_A','Machine A'],['shell_B','Machine B']]){
   const uri='skill://workspace/'+id+'/global-agents/global-same/SKILL.md';
   const get=await rpc('skills/get',{uri},true);
   assert.equal(get.result.skill.uri,uri);
   const resource=await rpc('resources/read',{uri},true);
   assert.match(resource.result.contents[0].text,new RegExp(expected));
  }
  await wb.stop();
  await assert.rejects(router.skillRead('shell_B','.agents/skills/collision',{}),
    /fetch failed|aborted|offline|refused/i,'A disconnected worker must never fall back to the hub filesystem');
  assert.match((await router.skillRead('shell_A','.agents/skills/collision',{})).content,/Workspace A/);
  console.log('PASS: owner-window skill routing, independent simulated machines/homes, per-worker consent, preserved duplicates, MCP v1/v2 reads, no hub-path fallback');
 }finally{await server?.stop();await Promise.all([wa.stop(),wb.stop()]);}
}
run().catch(e=>{console.error(e);process.exitCode=1;})
.finally(()=>fs.rmSync(root,{recursive:true,force:true}));
