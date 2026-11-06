'use strict';
/**
 * Non-network, isolated functional check of the INSTALLED embedded tunnel
 * CLI. It exercises only "init" using an explicitly chosen temporary
 * --profile-dir and a synthetic tunnel ID. Never calls "start".
 *
 *   node test/manual-integrated-native-init.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verifiedExecutable,tunnelAsset}=require('../out/tunnel-release.js');
(async()=>{
 const pkg=require('../package.json');
 const asset=tunnelAsset();
 const installed=path.join(os.homedir(),'.vscode','extensions',
  'local-multishell.multi-shell-mcp-server-'+pkg.version);
 const exe=await verifiedExecutable(installed,asset);
 assert.ok(exe,'Installed embedded tunnel is missing or not verified');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-native-init-'));
 const profile='isolated-integration-check';
 const file=path.join(temporary,profile+'.yaml');
 try{
  const args=['init','--sample','sample_mcp_remote_no_auth',
   '--profile',profile,'--profile-dir',temporary,
   '--tunnel-id','tunnel_0123456789abcdef0123456789abcdef',
   '--mcp-server-url','http://127.0.0.1:3000/mcp',
   '--health-listen-addr','127.0.0.1:9181'];
  const run=spawnSync(exe,args,{
   cwd:path.dirname(exe),stdio:['ignore','pipe','pipe'],
   encoding:'utf8',windowsHide:true,timeout:15000,
   maxBuffer:128*1024
  });
  if(run.error)throw run.error;
  assert.equal(run.status,0,
   'Official native tunnel init failed (no production profile touched)');
  assert.ok(fs.statSync(file).isFile(),'init did not write the temporary YAML');
  const text=fs.readFileSync(file,'utf8');
  assert.ok(text.includes('127.0.0.1:3000/mcp'),
   'MCP endpoint missing from temporary profile');
  assert.ok(text.includes('9181'),
   'Requested isolated health port missing from temporary profile');
  console.log(JSON.stringify({
   status:'PASS',nativeInit:true,temporaryProfileCreated:true,
   isolatedDirectory:true,realCredentialsUsed:false,
   tunnelStarted:false,productionProfileTouched:false
  }));
 }finally{
  fs.rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
})().catch(e=>{
 console.error('Native integrated init verification failed:',e?.message||String(e));
 process.exitCode=1;
});
