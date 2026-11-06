'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-tunnel-manager-'));
const executable=path.join(root,'fake','tunnel-client.exe');
const state=new Map(),secrets=new Map(),events=[],calls=[];
const context={
 extensionUri:{fsPath:path.join(root,'installed-extension')},
 globalStorageUri:{fsPath:root},
 globalState:{get(key,defaultValue){return state.has(key)?state.get(key):defaultValue;},
  async update(key,value){state.set(key,value);}},
 secrets:{async get(key){return secrets.get(key);},async store(key,value){secrets.set(key,value);}}
};
const {TunnelManager}=proxyquire('../out/tunnel-manager.js',{
 vscode:{},
 './tunnel-release':{
  TUNNEL_VERSION:'0.0.19',TUNNEL_RELEASE_URL:'https://github.com/openai/tunnel-client/releases/tag/v0.0.19',
  tunnelAsset:()=>({platformTag:'windows-amd64'}),
  verifiedExecutable:async()=>executable,
  installOfficialTunnel:async()=>executable,
  validateProfileName:s=>s,
  validateTunnelId:s=>{if(!s.startsWith('tunnel_'))throw Error('Invalid Tunnel ID');return s;},
  execChecked:async(_bin,args)=>{
   calls.push(args);
   if(args[0]==='init'){
    const dir=args[args.indexOf('--profile-dir')+1],name=args[args.indexOf('--profile')+1];
    await fs.promises.mkdir(dir,{recursive:true});
    await fs.promises.writeFile(path.join(dir,name+'.yaml'),'mcp_server_url: http://127.0.0.1:3000/mcp\n');
   }
   return 'ok';
  }
 }
});
(async()=>{
 const manager=new TunnelManager(context,()=>3000,async()=>false,message=>events.push(message));
 try{
  assert.ok(await manager.install());
  assert.equal((await manager.status()).autostart,false);
  await assert.rejects(manager.configure('invalid','key'),/Invalid Tunnel ID/);
  assert.equal(secrets.size,0,'Invalid Tunnel ID must not save credentials');
  await manager.configure('tunnel_0123456789abcdef0123456789abcdef','test-credential-value');
  assert.equal(secrets.size,1);
  assert.equal((await manager.status()).configured,true);
  assert.equal(calls.length,1);
  assert.ok(calls[0].includes('--sample'));
  assert.ok(calls[0].includes('sample_mcp_remote_no_auth'));
  assert.ok(calls[0].includes('http://127.0.0.1:3000/mcp'));
  assert.equal(JSON.stringify(calls).includes('test-credential-value'),false,
   'Never pass credential as CLI argument');
  await assert.rejects(manager.configure('tunnel_0123456789abcdef0123456789abcdef','key2'),/already exists/);
  assert.equal(secrets.size,1,'Existing profile never overwrites saved secret');
  await assert.rejects(manager.start(),/Only the active MultiShell MCP hub/);
  await assert.rejects(manager.stop(),/No extension-owned tunnel/);
  await manager.setAutostart(true);
  assert.equal((await manager.status()).autostart,true);
  await manager.startIfEnabled();
  assert.equal(events.filter(v=>v.includes('started')).length,0,
   'A secondary VS Code window must not launch the shared tunnel');
  manager.dispose();
  await assert.rejects(manager.start(),/disposed/);
  console.log('PASS: tunnel configuration is explicit, validated, secure, non-destructive, hub-only, opt-in and rejects duplicate profiles');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});