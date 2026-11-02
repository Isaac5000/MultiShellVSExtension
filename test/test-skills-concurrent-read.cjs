'use strict';
/* Mixed MCP-version skill-read stress test. Uses temporary roots only.
 * No shell execution, user resources or extension UI are involved. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const proxyquire=require('proxyquire').noCallThru();

const {MCPServer}=proxyquire('../out/server.js',{
  vscode:{},
  './multi-window':{
    REGISTER_PATH:'/_multishell/register',
    CONTROL_PATH:'/_multishell/control',
    authenticated:()=>false
  },
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const roots=['A','B'].map(key=>
  fs.mkdtempSync(path.join(os.tmpdir(),'multishell-mixed-skills-'+key+'-')));
const originals=new Map();
const metadata={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'mixed-version-read-stress',version:'1'},
  'io.modelcontextprotocol/clientCapabilities':{}
};
let server;
let nextId=0;
function createSkill(root,key){
  const directory=path.join(root,'.agents','skills','identical-name');
  fs.mkdirSync(path.join(directory,'references'),{recursive:true});
  const content='---\nname: identical-name\ndescription: Isolated fixture '+key+
    '\n---\n# Only '+key+'\n';
  const reference='Reference for '+key+' — never confuse workspaces';
  fs.writeFileSync(path.join(directory,'SKILL.md'),content,'utf8');
  fs.writeFileSync(path.join(directory,'references','GUIDE.md'),reference,'utf8');
  originals.set(key,{content,reference,dir:directory});
}
function parsePayload(raw){
  const data=raw.split(/\r?\n/).find(line=>line.startsWith('data:'));
  return JSON.parse(data?data.slice(5).trim():raw);
}
async function main(){
  for(let i=0;i<roots.length;i++)createSkill(roots[i],['A','B'][i]);
  const api={
    root(id){
      if(!['A','B'].includes(id)){throw Error('Unknown shell '+id);}
      return roots[id==='A'?0:1];
    },
    async list(){
      return ['A','B'].map((id,index)=>({
        shell_id:id,initial_cwd:roots[index],origin:'automatic',
        busy:false,queued:0,window_id:'win-'+id,machine_id:'machine-'+id
      }));
    },
    windows(){return [];}
  };
  server=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:false});
  await server.start();
  const endpoint='http://127.0.0.1:'+server.httpServer.address().port+'/mcp';
  async function rpc(method,params={},modern=false){
    const id=++nextId;
    const headers={'content-type':'application/json',
      accept:'application/json, text/event-stream'};
    if(modern){
      headers['MCP-Protocol-Version']='2026-07-28';
      headers['Mcp-Method']=method;
      if(method==='resources/read'||method==='tools/call'){
        headers['Mcp-Name']=method==='resources/read'?params.uri:params.name;
      }
    }
    const response=await fetch(endpoint,{method:'POST',headers,
      signal:AbortSignal.timeout(20000),
      body:JSON.stringify({jsonrpc:'2.0',id,method,
        params:modern?{...params,_meta:metadata}:params})});
    const body=parsePayload(await response.text());
    assert.equal(response.status,200,'HTTP '+method+': '+JSON.stringify(body.error));
    assert.equal(body.id,id,'HTTP requests must not exchange JSON-RPC IDs');
    assert.equal(body.error,undefined,method+': '+JSON.stringify(body.error));
    return body.result;
  }

  const tasks=[];
  const repetitions=24;
  for(let n=0;n<repetitions;n++){
    for(const id of ['A','B']){
      const uri='skill://workspace/'+id+'/agents/identical-name/SKILL.md';
      const refUri=uri.replace('/SKILL.md','/references/GUIDE.md');
      const expected=originals.get(id);
      tasks.push((async()=>{
        const result=await rpc('tools/call',{name:'read_skill_code',
          arguments:{shell_id:id,skill_path:'.agents/skills/identical-name'}});
        assert.equal(result.isError,false,result.content?.[0]?.text);
        const content=JSON.parse(result.content[0].text).content;
        assert.equal(content,expected.content);
      })());
      tasks.push((async()=>{
        const result=await rpc('resources/read',{uri:refUri},true);
        assert.equal(result.contents[0].text,expected.reference);
      })());
      tasks.push((async()=>{
        const result=await rpc('skills/get',{uri},true);
        const file=result.skill.resources.find(x=>x.uri===uri);
        assert.ok(file,'The SKILL.md resource must be present');
        assert.equal(file.digest,'sha256:'+
          crypto.createHash('sha256').update(expected.content).digest('hex'));
        assert.equal(result.skill.frontmatter.description,'Isolated fixture '+id);
      })());
    }
  }
  await Promise.all(tasks);
  assert.equal(tasks.length,repetitions*2*3);
  const list=await rpc('skills/list',{},true);
  assert.equal(list.skills.length,2);
  assert.equal(new Set(list.skills.map(s=>s.uri)).size,2);

  // A subsequent edit may change a manifest but must never contaminate the
  // other workspace's cached data or digest.
  const changed=originals.get('A').content.replace('Only A','Only A UPDATED');
  fs.writeFileSync(path.join(originals.get('A').dir,'SKILL.md'),changed,'utf8');
  const aUri='skill://workspace/A/agents/identical-name/SKILL.md';
  const bUri='skill://workspace/B/agents/identical-name/SKILL.md';
  const [a,b]=await Promise.all([
    rpc('skills/get',{uri:aUri},true),rpc('skills/get',{uri:bUri},true)
  ]);
  assert.equal(a.skill.resources.find(x=>x.uri===aUri).digest,'sha256:'+
    crypto.createHash('sha256').update(changed).digest('hex'));
  assert.equal(b.skill.resources.find(x=>x.uri===bUri).digest,'sha256:'+
    crypto.createHash('sha256').update(originals.get('B').content).digest('hex'));
  assert.equal((await rpc('resources/read',{uri:aUri},true)).contents[0].text,changed);
  assert.equal((await rpc('resources/read',{uri:bUri},false)).contents[0].text,
    originals.get('B').content);

  const bad=await rpc('tools/call',{name:'read_skill_code',
    arguments:{shell_id:'C',skill_path:'.agents/skills/identical-name'}});
  assert.equal(bad.isError,true,'An unknown shell must not fall back to an arbitrary workspace');
  assert.equal(server.isHealthy(),true,'Mixed traffic must not harm the listener');
  console.log('PASS: '+tasks.length+' mixed MCP v1/v2 parallel read requests, independent RPC IDs, same-named skills, exact content/digests, mutation refresh and missing-shell isolation');
}
main().catch(error=>{console.error(error);process.exitCode=1;})
.finally(async()=>{await server?.stop();for(const root of roots){
  fs.rmSync(root,{recursive:true,force:true});
}});
