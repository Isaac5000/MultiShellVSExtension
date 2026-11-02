'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {listWorkspaceSkills}=require('../out/tools/agent-skills.js');
class FakeShellManager {
 constructor(){this.values=new Map();}
 create(id,cwd){this.values.set(id,cwd);return {shell_id:id,initial_cwd:cwd,busy:false,queued:0};}
 root(id){if(!this.values.has(id))throw Error('Unknown shell');return this.values.get(id);}
 list(){return [...this.values].map(([id,cwd])=>({shell_id:id,initial_cwd:cwd,busy:false,queued:0}));}
 close(id){this.values.delete(id);}
 dispose(){}
}
const {WindowRouter,WindowWorker}=proxyquire('../out/multi-window.js',{
 './shell-manager':{ShellManager:FakeShellManager}
});
const {MCPServer}=proxyquire('../out/server.js',{
 vscode:{},
 './multi-window':{
  REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',
  authenticated:()=>false
 },
 './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-name-pagination-'));
function make(name,description){
 const file=path.join(dir,'.agents','skills',name,'SKILL.md');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,'---\nname: '+name+'\ndescription: '+description+'\n---\n# '+name+'\n');
}
(async()=>{
 let worker,server;
 try{
  for(let i=0;i<120;i++)make('a-'+String(i).padStart(3,'0'),'contains needle in description');
  make('needle-target','target by name only');
  const broad=listWorkspaceSkills(dir,{scope:'project',query:'needle',limit:20});
  assert.equal(broad.skills.length,20,'General search should include matching descriptions');
  assert.ok(broad.next_cursor);
  const direct=listWorkspaceSkills(dir,{scope:'project',query:'needle',nameOnly:true,limit:20});
  assert.deepEqual(direct.skills.map(x=>x.name),['needle-target']);
  assert.equal(direct.next_cursor,undefined);
  const secret='e'.repeat(64);
  worker=new WindowWorker(new FakeShellManager(),secret,dir);
  await worker.start();
  const router=new WindowRouter(secret);
  router.register({window_id:worker.id,workspace:dir,worker_port:worker.port});
  await router.create('sample_shell',dir,false,worker.id);
  const routed=await router.skillList('sample_shell','project',false,
   {query:'needle',nameOnly:true,limit:20});
  assert.deepEqual(routed.skills.map(x=>x.name),['needle-target'],
   'Window worker must preserve name-only filtering across IPC');
  server=new MCPServer(0,'127.0.0.1',router,
   {file:true,edit:false,shell:false,globalSkills:false});
  await server.start();
  async function call(name,args){
   const response=await fetch('http://127.0.0.1:'+server.httpServer.address().port+'/mcp',{
    method:'POST',headers:{'content-type':'application/json',
     accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
     params:{name,arguments:args}})
   });
   assert.equal(response.status,200);
   const raw=await response.text();
   const decoded=JSON.parse(raw.includes('data:')?
    raw.split(/\r?\n/).find(x=>x.startsWith('data:')).slice(5):raw);
   assert.equal(decoded.result.isError,false);
   return JSON.parse(decoded.result.content[0].text);
  }
  const result=await call('list_skill_names_code',
   {shell_id:'sample_shell',scope:'project',query:'needle',limit:20});
  assert.deepEqual(result.names,['needle-target']);
  assert.equal(result.next_cursor,undefined);
  const find=await call('find_skills_code',
   {shell_id:'sample_shell',scope:'project',query:'needle',limit:20});
  assert.equal(find.skills.length,20,'General skill discovery must still match descriptions');
  console.log('PASS: 120 description matches do not suppress a later name match; name-only pagination survives worker routing and MCP');
 }finally{
  await server?.stop();
  await worker?.stop();
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
