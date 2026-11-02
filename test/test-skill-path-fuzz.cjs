'use strict';
/* Deterministic adversarial path/URI regression for MCP skill resources.
 * Only isolated temporary fixture files are read, never user skills. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {readWorkspaceSkillFile,parseSkillUri,skillUri}=require('../out/tools/agent-skills.js');
const {MCPServer}=proxyquire('../out/server.js',{
  vscode:{},
  './multi-window':{
    REGISTER_PATH:'/_multishell/register',
    CONTROL_PATH:'/_multishell/control',
    authenticated:()=>false
  },
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-skills-uri-boundaries-'));
const workspace=path.join(root,'workspace');
const directory=path.join(workspace,'.agents','skills','guarded');
const secret='EXTERNAL_SECRET_FIXTURE_DO_NOT_EXPOSE';
let server;
let requestId=0;
const metadata={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'uri-boundary-regression',version:'1'},
  'io.modelcontextprotocol/clientCapabilities':{}
};
const suspicious=[
  '../secret.txt','../../secret.txt','./SKILL.md','../guarded/SKILL.md',
  'references/../../secret.txt','references//GUIDE.md',
  '/secret.txt','C:/secret.txt','D:\\secret.txt','\\\\localhost\\share\\file',
  'references/..\\..\\secret.txt','references/%2e%2e/%2e%2e/secret.txt',
  'references/\u0000secret.txt',
  'references/\\secret.txt','references/.','references/..',
  'references/../SKILL.md','./references/GUIDE.md',''
];
function decode(text){
  const data=text.split(/\r?\n/).find(line=>line.startsWith('data:'));
  return JSON.parse(data?data.slice(5).trim():text);
}
async function main(){
  fs.mkdirSync(path.join(directory,'references'),{recursive:true});
  fs.writeFileSync(path.join(directory,'SKILL.md'),
    '---\nname: guarded\ndescription: Fixture read boundary\n---\n# guarded\n');
  fs.writeFileSync(path.join(directory,'references','GUIDE.md'),'Valid public fixture');
  fs.writeFileSync(path.join(workspace,'secret.txt'),secret);
  fs.writeFileSync(path.join(root,'secret.txt'),secret);
  const selected='.agents/skills/guarded';
  const valid=readWorkspaceSkillFile(workspace,selected,'references/GUIDE.md');
  assert.equal(valid.content,'Valid public fixture');
  for(const file of suspicious){
    assert.throws(()=>readWorkspaceSkillFile(workspace,selected,file),
      /path|traversal|relative|file|resource|segment|ENOENT|exists|directory/i,
      'Unsafe or nonexistent resource must not be read: '+JSON.stringify(file));
  }
  const seedStrings=[
    'invalid/','../','../../','./','/','C:/','D:\\','\\\\','references/..',
    'references/../','references/../../','references/..\\','references//',
    'references/%2e%2e/','references/\u0000'
  ];
  let seed=0x10293847;
  function random(){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return seed>>>0;
  }
  for(let i=0;i<180;i++){
    const file=seedStrings[random()%seedStrings.length]+
      ['secret.txt','SKILL.md','references/GUIDE.md'][random()%3];
    assert.throws(()=>readWorkspaceSkillFile(workspace,selected,file),
      undefined,'Adversarial reference must not open: '+JSON.stringify(file));
  }
  const uri=skillUri('owner',{name:'guarded',source:'agents'},'references/GUIDE.md');
  assert.equal(parseSkillUri(uri).file,'references/GUIDE.md');
  const uriAttacks=[
    'http://workspace/owner/agents/guarded/SKILL.md',
    'skill://outside/owner/agents/guarded/SKILL.md',
    'skill://workspace/owner/agents/guarded',
    'skill://workspace/owner/agents/guarded/references/%2Fsecret.txt',
    'skill://workspace/owner/agents/guarded/references/%5Csecret.txt',
    'skill://workspace/owner/agents/guarded/%00secret.txt',
    'skill://workspace/owner/agents/guarded/references/../../../../secret.txt',
    'skill://workspace/owner/agents/guarded/SKILL.md?extra=1',
    'skill://workspace/owner/agents/guarded/SKILL.md#fragment',
    'skill://workspace/owner/agents/%2Fguarded/SKILL.md',
    'skill://workspace/owner/agents/guarded/%GG',
    'skill://workspace//agents/guarded/SKILL.md'
  ];
  const api={
    root(id){if(id!=='owner')throw Error('Unknown shell');return workspace;},
    async list(){return [{shell_id:'owner',initial_cwd:workspace,
      origin:'automatic',busy:false,queued:0}];},
    windows(){return [];}
  };
  server=new MCPServer(0,'127.0.0.1',api,{file:true,edit:false,shell:false});
  await server.start();
  const endpoint='http://127.0.0.1:'+server.httpServer.address().port+'/mcp';
  async function rpc(method,params,modern){
    const id=++requestId;
    const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
    if(modern){
      headers['MCP-Protocol-Version']='2026-07-28';
      headers['Mcp-Method']=method;
      if(method==='resources/read')headers['Mcp-Name']=params.uri;
    }
    const response=await fetch(endpoint,{
      method:'POST',headers,signal:AbortSignal.timeout(15000),
      body:JSON.stringify({jsonrpc:'2.0',id,method,
        params:modern?{...params,_meta:metadata}:params})
    });
    const raw=await response.text();
    return decode(raw);
  }
  for(const modern of [false,true]){
    const good=await rpc('resources/read',{uri},modern);
    assert.equal(good.result.contents[0].text,'Valid public fixture');
    for(const invalid of uriAttacks){
      const answer=await rpc('resources/read',{uri:invalid},modern);
      assert.equal(JSON.stringify(answer).includes(secret),false,
        'Rejected response must not leak the outside secret');
      assert.ok(answer.error||answer.result?.isError,
        'MCP must reject invalid URI '+JSON.stringify(invalid));
    }
  }
  assert.equal(server.isHealthy(),true);
  console.log('PASS: 180 randomized path guards, '+suspicious.length+
    ' known traversal forms, '+uriAttacks.length*2+
    ' malformed MCP v1/v2 resource requests, valid reads and no external-data disclosure');
}
main().catch(error=>{console.error(error);process.exitCode=1;})
.finally(async()=>{await server?.stop();fs.rmSync(root,{recursive:true,force:true});});