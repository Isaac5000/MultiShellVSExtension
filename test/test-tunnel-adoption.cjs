'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const realSpawn=require('node:child_process').spawn;
const proxyquire=require('proxyquire').noCallThru();
const {processIsAlive}=require('../out/tunnel-lock.js');
const {sameTunnelProcess}=require('../out/tunnel-process.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-tunnel-adopt-'));
let childProcess;
const state=new Map(),secrets=new Map();
const context={
 globalStorageUri:{fsPath:root},
 globalState:{get:(key,def)=>state.has(key)?state.get(key):def,
  update:async(key,value)=>{state.set(key,value);}},
 secrets:{get:async key=>secrets.get(key),store:async(key,value)=>secrets.set(key,value)}
};
const net={
 connect(){
  const sock=new EventEmitter();
  sock.setTimeout=()=>{};sock.destroy=()=>{};
  process.nextTick(()=>sock.emit('error',Error('ECONNREFUSED')));
  return sock;
 }
};
const fingerprint=pid=>({pid,started:'verified-start-'+pid,
 executable:'C:/verified/tunnel-client.exe',commandHash:'hash-'+pid});
const release={
 TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://github.com/openai/tunnel-client/releases',
 tunnelAsset:()=>({platformTag:'windows-amd64'}),
 verifiedExecutable:async()=>path.join(root,'tunnel-client.exe'),
 installOfficialTunnel:async()=>path.join(root,'tunnel-client.exe'),
 validateTunnelId:id=>id,validateProfileName:n=>n,
 execChecked:async(_exe,args)=>{
  if(args[0]==='init'){
   const folder=args[args.indexOf('--profile-dir')+1];
   const name=args[args.indexOf('--profile')+1];
   fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.join(folder,name+'.yaml'),[
    'control_plane:', '  base_url: "https://api.openai.com"',
    '  api_key: "env:CONTROL_PLANE_API_KEY"',
    'health:', '  listen_addr: "127.0.0.1:8080"',
    'mcp:','  server_urls:','    - url: "http://127.0.0.1:3000/mcp"'].join('\n'));
  }
 }
};
const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
 vscode:{},net,
 child_process:{spawn:()=>{
  childProcess=realSpawn(process.execPath,['-e','setInterval(()=>{},1000)'],
   {windowsHide:true,detached:true,stdio:'ignore'});
  return childProcess;
 }},
 './tunnel-release':release,
 './tunnel-process':{
  readTunnelProcessIdentity:async pid=>processIsAlive(pid)?fingerprint(pid):undefined,
  sameTunnelProcess
 }
});
const origFetch=global.fetch;
global.fetch=async()=>new Response('{}',{status:200});
(async()=>{
 let first,second;
 try{
  first=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  await first.configure('tunnel_0123456789abcdef0123456789abcdef','dummy-key');
  assert.equal(await first.start(),'started');
  assert.equal(await first.adoptDetached(),false);
  await assert.rejects(first.assertPortChangeSafe(3000,4201),/Disconnect/);
  const pid=childProcess.pid;
  assert.equal(processIsAlive(pid),true);
  first.dispose();
  second=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  assert.equal(await second.adoptDetached(),true);
  const status=await second.status();
  assert.equal(status.owner,'adopted');
  assert.equal(status.childRunning,true);
  assert.equal(await second.start(),'already-running');
  const file=path.join(root,'tunnel-instance.lock');
  const before=JSON.parse(fs.readFileSync(file,'utf8'));
  fs.writeFileSync(file,JSON.stringify({...before,
   childIdentity:{...before.childIdentity,started:'PID-WAS-REUSED'}}));
  await assert.rejects(second.stop(),/identity could not be verified/);
  assert.equal(processIsAlive(pid),true,'Wrong identity cannot terminate a process');
  fs.writeFileSync(file,JSON.stringify(before));
  await second.stop();
  assert.equal(processIsAlive(pid),false);
  assert.equal(fs.existsSync(file),false);
  assert.equal((await second.status()).owner,'none');
  assert.equal(await second.syncPort(3000,4201),'updated');
  const changed=fs.readFileSync(path.join(root,'tunnel-profiles','vscode-local.yaml'),'utf8');
  assert.match(changed,/127\.0\.0\.1:4201\/mcp/);
  console.log('PASS: safe reattachment across reload, PID identity enforcement, managed stop and profile port synchronization');
 }finally{
  first?.dispose();second?.dispose();
  if(childProcess&&processIsAlive(childProcess.pid)){childProcess.kill();}
  global.fetch=origFetch;
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
