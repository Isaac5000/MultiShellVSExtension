'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {Client}=require('@modelcontextprotocol/client');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
const {environment,rpc,tool,wait}=require('./connection-fixture.cjs');
(async()=>{
 const env=await environment();const clients=[];
 try{
  // Actual SDK clients exercise initialize, notifications, protocol negotiation,
  // parallel JSON-RPC IDs and repeated connection teardown, not only raw fetch.
  for(let round=0;round<8;round++){
   const batch=await Promise.all(Array.from({length:5},async(_,index)=>{
    const client=new Client({name:'connection-'+round+'-'+index,version:'1'},{capabilities:{}});
    clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+env.port+'/mcp')));
    const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='execute_shell_command_code'));
    const calls=await Promise.all(Array.from({length:4},(_,n)=>client.callTool({name:'execute_shell_command_code',
     arguments:{shell_id:'connection_'+(index%3),command:'sdk_'+round+'_'+index+'_'+n,timeout:5000}})));
    calls.forEach(value=>assert.equal(value.isError,false));await client.close();return calls.length;
   }));
   assert.equal(batch.reduce((sum,n)=>sum+n,0),20);
  }
  const sameIds=await Promise.all(Array.from({length:60},(_,index)=>tool(env.port,'execute_shell_command_code',
   {shell_id:'connection_'+(index%3),command:'collision_'+index,timeout:5000},{id:1})));
  sameIds.forEach((value,index)=>assert.equal(JSON.parse(value.output).command,'collision_'+index));
  const badBodies=[['{',400],['null',400],['[]',400],['42',400],['"text"',400],
   ['{"jsonrpc":"2.0","method":8,"id":1}',400],
   ['{"jsonrpc":"2.0","method":"unknown_method","id":1}',200]];
  for(const [body,status] of badBodies){
   const response=await fetch('http://127.0.0.1:'+env.port+'/mcp',{method:'POST',signal:AbortSignal.timeout(3000),
    headers:{'content-type':'application/json',accept:'application/json,text/event-stream'},body});
   assert.equal(response.status,status,body);
   const raw=await response.text();assert.doesNotMatch(raw,/<html|SyntaxError:|node_modules/i);
   // SDK v2 rejects empty JSON-RPC batches as malformed requests.
   if(status===202){assert.equal(raw,'');}
   else{
    assert.match(response.headers.get('content-type'),/application\/json|text\/event-stream/);
    const row=raw.split(/\r?\n/).find(line=>line.startsWith('data:'));
    const failure=JSON.parse(row?row.slice(5):raw);assert.ok(failure.error,'Malformed requests must return an error');
    if(status===200)assert.equal(failure.error.code,-32601);
   }
   assert.equal((await rpc(env.port,'ping')).result!==undefined,true,'A malformed client must not poison later requests');
  }
  for(const method of ['GET','DELETE']){
   const response=await fetch('http://127.0.0.1:'+env.port+'/mcp',{method,signal:AbortSignal.timeout(3000)});
   assert.equal(response.status,405);await response.text();
  }
  for(const [headers,status] of [
   [{accept:'text/plain'},406], [{'mcp-protocol-version':'1900-01-01'},400], [{origin:'https://untrusted.example'},403]
  ]){
   const response=await fetch('http://127.0.0.1:'+env.port+'/mcp',{method:'POST',signal:AbortSignal.timeout(3000),
    headers:{'content-type':'application/json',accept:'application/json,text/event-stream',...headers},
    body:JSON.stringify({jsonrpc:'2.0',method:'tools/list',id:1})});
   assert.equal(response.status,status);await response.text();
  }
  const oversized=await fetch('http://127.0.0.1:'+env.port+'/mcp',{method:'POST',signal:AbortSignal.timeout(4000),
   headers:{'content-type':'application/json',accept:'application/json,text/event-stream'},body:JSON.stringify({padding:'x'.repeat(2100000)})});
  assert.equal(oversized.status,413);await oversized.text();
  // Abandoned partial uploads must not hold shutdown or leak MCP sessions.
  const partial=http.request({hostname:'127.0.0.1',port:env.port,path:'/mcp',method:'POST',
   headers:{'content-type':'application/json','content-length':100000}});
  partial.on('error',()=>{});partial.write('{');await wait(30);partial.destroy();await wait(50);
  for(let i=0;i<30&&env.hub.sessions.size;i++)await wait(10);
  assert.equal(env.hub.sessions.size,0,'No request transport may survive response/abort cleanup');
  assert.equal(env.issued.length,220);
  console.log('PASS: 40 official SDK connections, 220 commands, colliding request IDs, malformed input, headers, size limits, partial uploads and transport cleanup');
 }finally{await Promise.all(clients.map(client=>client.close().catch(()=>{})));await env.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});