'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter,once}=require('node:events');
const {spawn}=require('node:child_process');
const proxyquire=require('proxyquire').noCallThru();
const {processIsAlive}=require('../out/tunnel-lock.js');
const {sameTunnelProcess}=require('../out/tunnel-process.js');
const ID='tunnel_0123456789abcdef0123456789abcdef';
const fingerprint=pid=>({pid,started:'test-start-'+pid,
 executable:'C:/test/tunnel-client.exe',commandHash:'sha-'+pid});

async function scenario(mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-tunnel-reload-race-'));
 const state=new Map(),secrets=new Map();
 const context={
  extensionUri:{fsPath:path.join(root,'installed-extension')},
  globalStorageUri:{fsPath:root},
  globalState:{get:(key,def)=>state.has(key)?state.get(key):def,
   update:async(key,value)=>{state.set(key,value);}},
  secrets:{get:async key=>secrets.get(key),
   store:async(key,value)=>{secrets.set(key,value);}}
 };
 let healthBusy=false,liveTunnel,oldOwner,first,second;
 const net={
  connect(){
   const socket=new EventEmitter();
   socket.setTimeout=()=>{};socket.destroy=()=>{};
   process.nextTick(()=>socket.emit(healthBusy?'connect':'error',
    ...(healthBusy?[]:[Error('ECONNREFUSED')])));
   return socket;
  }
 };
 const exe=path.join(root,'tunnel-client.exe');
 const managerModule=proxyquire('../out/tunnel-manager.js',{
  vscode:{},net,
  child_process:{spawn:()=>{
   liveTunnel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
    {windowsHide:true,stdio:'ignore'});
   return liveTunnel;
  }},
  './tunnel-release':{
   TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://example.invalid',
   tunnelAsset:()=>({platformTag:'windows-amd64'}),
   verifiedExecutable:async()=>exe,
   installOfficialTunnel:async()=>exe,
   validateTunnelId:x=>x,validateProfileName:x=>x,
   execChecked:async(_exe,args)=>{
    if(args[0]==='init'){
     const folder=args[args.indexOf('--profile-dir')+1];
     const name=args[args.indexOf('--profile')+1];
     fs.mkdirSync(folder,{recursive:true});
     fs.writeFileSync(path.join(folder,name+'.yaml'),[
      'control_plane:', '  base_url: "https://api.openai.com"',
      '  api_key: "env:CONTROL_PLANE_API_KEY"',
      'health:','  listen_addr: "127.0.0.1:8080"',
      'mcp:', '  server_urls:', '    - url: "http://127.0.0.1:3000/mcp"'].join('\n'));
    }
   }
  },
  './tunnel-process':{
   readTunnelProcessIdentity:async pid=>processIsAlive(pid)?fingerprint(pid):undefined,
   sameTunnelProcess
  }
 });
 const {TunnelManager}=managerModule;
 const oldFetch=global.fetch;
 global.fetch=async()=>new Response('{}',{status:200});
 try{
  first=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  await first.configure(ID,'synthetic-key');
  assert.equal(await first.start(),'started');
  assert.ok(processIsAlive(liveTunnel.pid));
  first.dispose(); // Simulates extension host unloading without killing tunnel
  healthBusy=true;
  oldOwner=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
   {windowsHide:true,stdio:'ignore'});
  const lock=path.join(root,'tunnel-instance.lock');
  const saved=JSON.parse(fs.readFileSync(lock,'utf8'));
  fs.writeFileSync(lock,JSON.stringify({...saved,ownerPid:oldOwner.pid}));
  second=new TunnelManager(context,()=>3000,async()=>true,()=>{});
  assert.equal(await second.adoptDetached(),false,
   'A live previous host must not lose tunnel ownership prematurely');
  if(mode==='manual'){
   assert.equal(await second.start(),'occupied',
    'Do not interfere with a tunnel while its previous host remains alive');
  }else{
   await second.setAutostart(true);
   await second.startIfEnabled();
  }
  assert.ok(processIsAlive(liveTunnel.pid),'Existing tunnel must remain running');
  const ownerEnded=once(oldOwner,'exit');
  oldOwner.kill();await ownerEnded;
  if(mode==='foreign'){
   const savedLock=JSON.parse(fs.readFileSync(lock,'utf8'));
   fs.writeFileSync(lock,JSON.stringify({...savedLock,profile:'not-our-profile'}));
   assert.equal(await second.start(),'occupied');
   assert.ok(processIsAlive(liveTunnel.pid),
    'A mismatched or external process must not be terminated or adopted');
   console.log('PASS tunnel reload foreign: unrelated listener remains untouched');
   return;
  }
  if(mode==='manual'){
   assert.equal(await second.start(),'already-running');
  }else{
   await second.monitorTick(); // Stand-in for the periodic 10-second tick
  }
  assert.equal((await second.status()).owner,'adopted',
   'A verified tunnel must become manageable after the prior host exits');
  assert.ok(processIsAlive(liveTunnel.pid),'Adoption must not restart or kill tunnel');
  // Changing the stored fingerprint must fail closed, even on a healthy port.
  const record=JSON.parse(fs.readFileSync(lock,'utf8'));
  fs.writeFileSync(lock,JSON.stringify({...record,
   childIdentity:{...record.childIdentity,started:'wrong-process'}}));
  await assert.rejects(second.stop(),/identity could not be verified/);
  assert.ok(processIsAlive(liveTunnel.pid));
  console.log('PASS tunnel reload '+mode+': no duplicate launch, safe delayed ownership, fingerprint validation');
 }finally{
  global.fetch=oldFetch;
  first?.dispose();second?.dispose();
  if(oldOwner&&processIsAlive(oldOwner.pid)){oldOwner.kill();}
  if(liveTunnel&&processIsAlive(liveTunnel.pid)){liveTunnel.kill();}
  fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
}
(async()=>{await scenario('manual');await scenario('autostart');await scenario('foreign');})()
 .catch(error=>{console.error(error);process.exitCode=1;});