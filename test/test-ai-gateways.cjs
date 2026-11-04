'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const {environment,rpc,tool}=require('./connection-fixture.cjs');
const {addLocalConnection}=require('../out/ai-connections.js');
const {performance}=require('node:perf_hooks');

(async()=>{
 const env=await environment(5);
 const storage=new Map(),secrets=new Map();
 const globalState={
   get:(key,defaultValue)=>storage.has(key)?storage.get(key):defaultValue,
   update:async(key,value)=>{storage.set(key,value);}
 };
 const context={globalState,secrets:{
   get:async k=>secrets.get(k),
   store:async(k,v)=>{secrets.set(k,v);},
   delete:async k=>{secrets.delete(k);}
 }};
 const vscode={workspace:{isTrusted:true}};
 const {AiGatewayManager}=proxyquire('../out/ai-gateway-manager.js',{vscode});
 let hub=true;
 const manager=new AiGatewayManager(context,()=>hub?env.router:undefined,
   ()=>hub,()=>({file:true,edit:true,shell:true}),()=>true,
   (port,router,tools,token,enabled)=>
     new env.MCPServer(port,'127.0.0.1',router,tools,undefined,
       {bearerToken:token,isEnabled:enabled}));
 const profiles=[];
 try{
  for(let i=0;i<5;i++){
   const profile=await addLocalConnection(globalState,'other','Remote client '+i);
   profiles.push(profile);
   const policy=await manager.provision(profile.id,'connection_'+i,i===0?'read':'shell');
   assert.equal(policy.running,false);
   assert.equal(policy.port,38100+i);
   assert.match(policy.endpoint,/^http:\/\/127\.0\.0\.1:381\d\d\/mcp$/);
  }
  assert.equal(secrets.size,5);
  assert.ok(!JSON.stringify(manager.statuses()).includes([...secrets.values()][0]),
    'Tokens MUST NOT appear in Webview state');
  const statuses=await Promise.all(profiles.map(p=>manager.start(p.id)));
  assert.equal(statuses.length,5);
  assert.ok(statuses.every(x=>x.running));
  const tokens=await Promise.all(profiles.map(p=>manager.secret(p.id)));
  assert.equal(new Set(tokens).size,5,'Each AI must have its own credential');
  assert.equal(new Set(statuses.map(s=>s.port)).size,5);
  const unauthorized=await fetch(statuses[0].endpoint,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})
  });
  assert.equal(unauthorized.status,401);
  assert.ok(!(await unauthorized.text()).includes(tokens[0]));
  const wrong=await fetch(statuses[0].endpoint,{
   method:'POST',headers:{'content-type':'application/json',
     authorization:'Bearer '+tokens[1]},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})
  });
  assert.equal(wrong.status,401,'Another AI credential cannot access this gateway');
  const auth=i=>({headers:{Authorization:'Bearer '+tokens[i]}});
  const before=performance.now();
  await Promise.all([1,2,3,4].map(async i=>{
   const result=await tool(statuses[i].port,'execute_shell_command_code',{
     shell_id:'connection_'+i,command:'delay:140:ai_'+i,timeout:5000},auth(i));
   assert.equal(result.exit_code,0);
   const parsed=JSON.parse(result.output);
   assert.equal(parsed.shell,'connection_'+i);
  }));
  const elapsed=performance.now()-before;
  const begins=env.issued.filter(x=>x.command.includes('ai_'));
  const ends=env.finished.filter(x=>x.command.includes('ai_'));
  assert.equal(begins.length,4);
  assert.equal(ends.length,4);
  assert.ok(Math.max(...begins.map(x=>x.at))<Math.min(...ends.map(x=>x.at)),
    'Independent AI gateways should execute separate shells concurrently');

  const cross=await rpc(statuses[1].port,'tools/call',{
    name:'execute_shell_command_code',
    arguments:{shell_id:'connection_2',command:'cross_ai_breakout'}
  },auth(1));
  assert.ok(cross.error||cross.result?.isError,'Cross-AI access must be denied by MCP server');
  assert.ok(!env.issued.some(x=>x.command==='cross_ai_breakout'));
  const noExec=await rpc(statuses[0].port,'tools/call',{
    name:'execute_shell_command_code',
    arguments:{shell_id:'connection_0',command:'read_should_not_execute'}
  },auth(0));
  assert.ok(noExec.error||noExec.result?.isError);
  assert.ok(!env.issued.some(x=>x.command==='read_should_not_execute'));
  const badRead=await rpc(statuses[0].port,'tools/call',{
    name:'list_files_code',arguments:{shell_id:'connection_4'}
  },auth(0));
  assert.ok(badRead.error||badRead.result?.isError,
    'Read-only profile must not read another terminal workspace');
  const forbiddenEdit=await rpc(statuses[0].port,'tools/call',{
    name:'create_file_code',arguments:{
      shell_id:'connection_0',path:'should-not-exist.txt',content:'unsafe'}
  },auth(0));
  assert.ok(forbiddenEdit.error||forbiddenEdit.result?.isError,
    'Read-only profile must not modify any file');
  const forgedControl=await fetch('http://127.0.0.1:'+statuses[0].port+'/_multishell/control',{
    method:'POST',headers:{'content-type':'application/json',
      authorization:'Bearer '+tokens[0]},body:JSON.stringify({op:'create'})
  });
  assert.equal(forgedControl.status,404,'Gateway never exposes the coordinator admin API');
  const badOrigin=await fetch(statuses[0].endpoint,{
    method:'POST',headers:{'content-type':'application/json',
      authorization:'Bearer '+tokens[0],origin:'https://evil.example'},
    body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/list',params:{}})
  });
  assert.equal(badOrigin.status,403,'Unexpected browser origins must be rejected');
  const overview=await tool(statuses[1].port,'list_shells_code',{},auth(1));
  assert.ok(JSON.stringify(overview).includes('connection_1'));
  assert.ok(!JSON.stringify(overview).includes('connection_0'));
  assert.ok(!JSON.stringify(overview).includes('connection_2'));

  // Rotating one AI revokes its old key without affecting any other gateway.
  const old=tokens[1];
  const replacement=await manager.rotate(profiles[1].id);
  assert.notEqual(old,replacement);
  assert.equal(manager.statuses()[1].running,false);
  assert.equal(manager.statuses()[2].running,true);
  await manager.start(profiles[1].id);
  const deniedOld=await fetch(statuses[1].endpoint,{
   method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+old},
   body:JSON.stringify({jsonrpc:'2.0',id:8,method:'tools/list',params:{}})
  });
  assert.equal(deniedOld.status,401);
  const newCheck=await rpc(statuses[1].port,'tools/list',{},
    {headers:{authorization:'Bearer '+replacement}});
  assert.ok(newCheck.result);
  await manager.stop(profiles[2].id);
  assert.equal(manager.statuses()[2].running,false);
  assert.equal(manager.statuses()[3].running,true);
  await manager.remove(profiles[2].id);
  assert.equal(secrets.has('multiShellAiGatewayKey:'+profiles[2].id),false);
  assert.equal(manager.configured(profiles[2].id),false);
  hub=false;
  const suspended=await fetch(statuses[0].endpoint,{
    method:'POST',headers:{'content-type':'application/json',
      authorization:'Bearer '+tokens[0]},
    body:JSON.stringify({jsonrpc:'2.0',id:15,method:'tools/list',params:{}})
  });
  assert.equal(suspended.status,503,'A lost hub must immediately deny new requests');
  await assert.rejects(manager.provision(profiles[0].id,'connection_0','full'),/hub/);
  await assert.rejects(manager.rotate(profiles[0].id),/hub/);
  await assert.rejects(manager.secret(profiles[0].id),/hub/);
  await manager.stopAll();
  assert.ok(manager.statuses().every(x=>!x.running));
  hub=true;
  await manager.setAutostart(profiles[4].id,true);
  await manager.startIfEnabled();
  assert.equal(manager.statuses().find(x=>x.profileId===profiles[4].id).running,true);
  assert.equal(manager.statuses().filter(x=>x.running).length,1,
    'Only explicitly enabled profiles may autostart');
  await manager.stopAll();
  await manager.setAutostart(profiles[4].id,false);
  console.log('PASS five simultaneous authenticated MCP gateways, unique credentials, independent scopes, concurrent work, rotation, revocation and hub-only control ('+Math.round(elapsed)+'ms)');
 }finally{
  await manager.stopAll();
  await env.stop();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});