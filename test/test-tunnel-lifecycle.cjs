'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const proxyquire=require('proxyquire').noCallThru();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-tunnel-life-'));
const state=new Map(),secrets=new Map(),events=[],cli=[],children=[];
const key='do-not-log-this-runtime-secret';
const context={
 globalStorageUri:{fsPath:root},
 globalState:{get(k,def){return state.has(k)?state.get(k):def;},
  async update(k,v){state.set(k,v);}},
 secrets:{async get(k){return secrets.get(k);},async store(k,v){secrets.set(k,v);}}
};
const net={
 connect(){
  const socket=new EventEmitter();
  socket.setTimeout=()=>{};
  socket.destroy=()=>{};
  process.nextTick(()=>socket.emit('error',Error('ECONNREFUSED')));
  return socket;
 }
};
const spawn=(exe,args,opts)=>{
 const child=new EventEmitter();
 child.pid=process.pid;
 child.killed=false;
 child.exitCode=null;
 child.signalCode=null;
 child.unref=()=>{};
 child.kill=()=>{
  child.killed=true;child.exitCode=0;
  process.nextTick(()=>child.emit('exit',0,null));
  return true;
 };
 children.push({child,exe,args,opts});
 process.nextTick(()=>child.emit('spawn'));
 return child;
};
const cliStub={
 TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://github.com/openai/tunnel-client/releases/tag/v0.0.19',
 tunnelAsset:()=>({platformTag:'windows-amd64'}),
 verifiedExecutable:async()=>path.join(root,'tunnel-client.exe'),
 installOfficialTunnel:async()=>path.join(root,'tunnel-client.exe'),
 validateProfileName:s=>s,
 validateTunnelId:s=>s,
 execChecked:async(_exe,args)=>{
  cli.push(args);
  if(args[0]==='init'){
   const dir=args[args.indexOf('--profile-dir')+1];
   const profile=args[args.indexOf('--profile')+1];
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(dir,profile+'.yaml'),[
    'control_plane:', '  base_url: "https://api.openai.com"', '  api_key: "env:CONTROL_PLANE_API_KEY"',
    'health:','  listen_addr: "127.0.0.1:8080"',
    'mcp:','  server_urls:',
    '    - url: "http://127.0.0.1:3000/mcp"'].join('\n'));
  }
  return '{}';
 }
};
const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
 vscode:{},net,child_process:{spawn},'./tunnel-release':cliStub
});
const originalFetch=global.fetch;
global.fetch=async()=>new Response('{}',{status:200});
(async()=>{
 let manager;
 try{
  manager=new TunnelManager(context,()=>3000,async()=>true,x=>events.push(x),()=> 'f'.repeat(64));
  await manager.configure('tunnel_0123456789abcdef0123456789abcdef',key);
  assert.equal((await manager.status()).configured,true);
  assert.equal(children.length,0);
  const start=await manager.start();
  assert.equal(start,'started');
  assert.equal(children.length,1);
  assert.equal(children[0].args[0],'run');
  assert.ok(children[0].args.includes('--profile-dir'));
  assert.equal(JSON.stringify(children[0].args).includes(key),false);
  assert.equal(children[0].opts.env.CONTROL_PLANE_API_KEY,key);
  assert.equal(children[0].opts.windowsHide,true);
  assert.equal(children[0].opts.detached,process.platform!=='win32');
  assert.equal(children[0].opts.env.MULTISHELL_MCP_LOCAL_AUTH,'f'.repeat(64));
  assert.equal(children[0].opts.env.MCP_EXTRA_HEADERS,
    'X-MultiShell-Local-Auth: env:MULTISHELL_MCP_LOCAL_AUTH');
  assert.equal(children[0].opts.env.MCP_DISCOVERY_EXTRA_HEADERS,
    'X-MultiShell-Local-Auth: env:MULTISHELL_MCP_LOCAL_AUTH');
  assert.equal(await manager.start(),'already-running');
  assert.equal(children.length,1);
  assert.equal((await manager.status()).owner,'extension');
  // Detached child still owns a lock, so another Extension Host must not
  // start a duplicate before the process genuinely exits.
  const {TunnelLaunchLock}=require('../out/tunnel-lock.js');
  const second=new TunnelLaunchLock(root,async()=>false);
  assert.equal(await second.acquire('vscode-local',3000),false);
  await manager.setAutostart(true);
  children[0].child.exitCode=1;
  children[0].child.emit('exit',1,null);
  await delay(80);
  assert.equal((await manager.status()).retryFailures,1);
  manager.nextAttempt=0;
  await manager.monitorTick();
  assert.equal(children.length,2,'Auto-recovery must respawn one new child');
  assert.equal((await manager.status()).owner,'extension');
  await manager.stop();
  assert.equal((await manager.status()).autostart,false);
  assert.equal((await manager.status()).owner,'none');
  assert.equal(children[1].child.killed,true);
  assert.equal(fs.existsSync(path.join(root,'tunnel-instance.lock')),false);
  assert.equal(JSON.stringify(events).includes(key),false);
  await assert.rejects(manager.stop(),/No extension-owned/);
  manager.dispose();
  console.log('PASS: verified real manager lifecycle, safe environment key, separate process, no duplicate, bounded automatic restart, manual stop and lock cleanup');
 }finally{
  manager?.dispose();
  global.fetch=originalFetch;
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});