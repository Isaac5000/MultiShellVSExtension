'use strict';
const assert=require('node:assert/strict'),net=require('node:net');
const {environment,tool,wait}=require('./connection-fixture.cjs');
(async()=>{
 const env=await environment(1),sockets=[];
 function unfinished(port,headers,body=''){
  return new Promise((resolve,reject)=>{
   const begin=Date.now(),socket=net.createConnection({host:'127.0.0.1',port});sockets.push(socket);
   let response='';const timer=setTimeout(()=>{socket.destroy();reject(Error('Incomplete HTTP upload did not expire'));},18000);
   socket.on('connect',()=>socket.write(headers+body));socket.on('data',chunk=>{response+=chunk;});
   socket.on('error',reject);socket.on('close',()=>{clearTimeout(timer);try{
    assert.match(response,/^HTTP\/1\.1 408 /);assert.ok(Date.now()-begin<18000);resolve();
   }catch(error){reject(error);}});
  });
 }
 try{
  const server=env.hub.httpServer;
  assert.ok(server.headersTimeout<=10000&&server.requestTimeout<=15000,
   'Incomplete HTTP clients must not retain connections for the default five minutes');
  const incomplete=[];
  for(const port of [env.port,env.workers[0].port]){
   incomplete.push(unfinished(port,'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n'));
   incomplete.push(unfinished(port,'POST '+(port===env.port?'/mcp':'/_multishell/action')+
    ' HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 10000\r\n'+
    'x-multishell-token: '+env.secret+'\r\n\r\n','{'));
  }
  // Receiving an HTTP request has a deadline. Waiting for its command result
  // must remain independent: this silent command outlives the upload limit.
  const long=tool(env.port,'execute_shell_command_code',{
   shell_id:'connection_0',command:'delay:17000:long_valid_command',timeout:22000
  },{signal:AbortSignal.timeout(24000)});
  const all=Promise.all([...incomplete,long]);
  await wait(100);assert.equal((await tool(env.port,'list_windows_code',{})).windows.length,1);
  const results=await all;assert.equal(results.at(-1).exit_code,0);
  assert.equal(env.hub.sessions.size,0);assert.equal(env.workers[0].requests.size,0);
  console.log('PASS: incomplete headers/bodies expire on hub and worker; a valid 17-second command survives');
 }finally{for(const socket of sockets)socket.destroy();await env.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
