'use strict';
/**
 * Read-only diagnostic of the *installed* MCP server contract.
 * It does not claim to introspect private ChatGPT web APIs.
 * Never sends ChatGPT messages, writes files, or prints credentials.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
const home=process.platform==='win32'
 ?path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'Code')
 :process.platform==='darwin'
  ?path.join(os.homedir(),'Library','Application Support','Code')
  :path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'Code');
const tokenFile=path.join(home,'User','globalStorage',
 'local-multishell.multi-shell-mcp-server','multishell-local-token');
function jsonFromTool(result){
 assert.equal(result.isError,false,'MCP tool returned an error');
 assert.ok(Array.isArray(result.content));
 const first=result.content.find(x=>x.type==='text');
 assert.ok(first&&typeof first.text==='string','Missing text content');
 return JSON.parse(first.text);
}
(async()=>{
 const token=fs.readFileSync(tokenFile,'utf8').trim();
 assert.match(token,/^[a-f0-9]{64}$/i);
 const client=new Client({name:'multishell-chatgpt-host-boundary-check',version:'1.0.0'},
  {capabilities:{}});
 try{
  await client.connect(new StreamableHTTPClientTransport(
   new URL('http://127.0.0.1:3000/mcp'),
   {requestInit:{redirect:'error',headers:{'X-MultiShell-Local-Auth':token}}}));
  const tools=(await client.listTools()).tools.map(x=>x.name);
  const expected=['list_shells_code','chat_handoff_list_code',
   'chat_handoff_save_code','chat_handoff_load_code'];
  for(const name of expected){
   assert.ok(tools.includes(name),'Installed extension lacks '+name);
  }
  const chatCreation=tools.filter(n=>/^(chatgpt|conversation|chat)_.*(create|new|send|resume)/i.test(n));
  assert.deepEqual(chatCreation,[],'Unreviewed ChatGPT-host mutation surface found');
  const listed=jsonFromTool(await client.callTool({
   name:'list_shells_code',arguments:{}
  }));
  assert.ok(Array.isArray(listed.shells));
  const shell=listed.shells.find(s=>
   typeof s.initial_cwd==='string'&&
   path.basename(s.initial_cwd).toLowerCase()==='multi-shell-vscode_extension');
  assert.ok(shell&&shell.shell_id,'Project shell must be explicitly identified');
  const handoffs=jsonFromTool(await client.callTool({
   name:'chat_handoff_list_code',arguments:{shell_id:shell.shell_id}
  }));
  assert.ok(Array.isArray(handoffs.tasks));
  // Optional explicit handoff identifier; a missing checkpoint does not
  // mean the server has broken tool support on a fresh installation.
  const requestedId=process.argv[2];
  const known=requestedId?
   handoffs.tasks.find(t=>t.handoffId===requestedId):handoffs.tasks[0];
  if(requestedId)assert.ok(known,'Requested checkpoint not found');
  let roundTrip=false;
  if(known){
   const recovered=jsonFromTool(await client.callTool({
    name:'chat_handoff_load_code',
    arguments:{shell_id:shell.shell_id,handoff_id:known.handoffId}
   }));
   assert.equal(recovered.found,true);
   assert.equal(recovered.checkpoint.handoffId,known.handoffId);
   roundTrip=true;
  }
  const caps=client.getServerCapabilities?.()||{};
  console.log(JSON.stringify({
   status:'PASS',
   installedLocalMcp:true,toolCount:tools.length,
   listedContinuationTools:tools.filter(n=>n.startsWith('chat_handoff_')),
   hostChatCreationToolExposed:false,
   checkpointRoundTrip:roundTrip,handoffId:known?.handoffId||null,
   revision:known?.revision||null,
   declaredServerCapabilities:Object.keys(caps).sort(),
   limitation:'Local MCP listing cannot prove the absence of non-MCP host UI capabilities'
  }));
 }finally{await client.close();}
})().catch(e=>{
 console.error('Boundary diagnostic failed:',String(e?.message||e));
 process.exitCode=1;
});