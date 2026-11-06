'use strict';
/**
 * Read-only smoke test for the actually installed integrated VS Code VSIX.
 * Never starts/stops the tunnel, invokes shell execution or writes checkpoints.
 * Intended for manual runs on the machine hosting VS Code:
 *
 *   node test/manual-integrated-install.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
const {tunnelAsset,verifiedExecutable,TUNNEL_VERSION,hashFile}=
 require('../out/tunnel-release.js');

const packageJson=require('../package.json');
const version=packageJson.version;
const extensionId='local-multishell.multi-shell-mcp-server';
const extensionFolder=path.join(os.homedir(),'.vscode','extensions',
 extensionId+'-'+version);
function parse(result){
 assert.equal(result.isError,false,'MCP tool returned an error');
 const text=result.content?.find(c=>c.type==='text')?.text;
 assert.ok(text,'MCP result has no text payload');
 return JSON.parse(text);
}
async function health(name){
 const res=await fetch('http://127.0.0.1:8080/'+name,{
  signal:AbortSignal.timeout(2500),redirect:'error'});
 await res.body?.cancel();
 assert.equal(res.status,200,'Tunnel '+name+' must return HTTP 200');
}
(async()=>{
 const asset=tunnelAsset();
 const manifest=JSON.parse(fs.readFileSync(
  path.join(extensionFolder,'package.json'),'utf8'));
 assert.equal(manifest.version,version,'Installed VSIX version differs from source');
 const embedded=await verifiedExecutable(extensionFolder,asset);
 assert.ok(embedded,'Installed integrated native binaries failed SHA-256 validation');
 const companion=path.join(path.dirname(embedded),
  asset.platform==='win32'?'cloudflared.exe':'cloudflared');
 const hashes=JSON.parse(fs.readFileSync(
  path.join(path.dirname(embedded),'verified.json'),'utf8'));
 assert.equal(await hashFile(embedded),hashes.executableSha256);
 assert.equal(await hashFile(companion),hashes.companionSha256);
 const exe=spawnSync(embedded,['--version'],{
  encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:4096});
 assert.equal(exe.status,0,'Embedded native --version must exit cleanly');
 assert.ok(String(exe.stdout).startsWith(TUNNEL_VERSION),
  'Embedded native version differs from expected release');
 await Promise.all([health('readyz'),health('healthz')]);
 const storage=process.platform==='win32'
  ?path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'Code')
  :process.platform==='darwin'
   ?path.join(os.homedir(),'Library','Application Support','Code')
   :path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'Code');
 const tokenFile=path.join(storage,'User','globalStorage',extensionId,
  'multishell-local-token');
 const token=fs.readFileSync(tokenFile,'utf8').trim();
 assert.match(token,/^[a-f0-9]{64}$/i,'Invalid local MCP auth token format');
 const client=new Client({name:'integrated-vsix-readonly-smoke',version:'1.0.0'},
  {capabilities:{}});
 try{
  await client.connect(new StreamableHTTPClientTransport(
   new URL('http://127.0.0.1:3000/mcp'),
   {requestInit:{redirect:'error',
    headers:{'X-MultiShell-Local-Auth':token}}}));
  const names=(await client.listTools()).tools.map(t=>t.name);
  for(const tool of ['list_shells_code','list_skills_code','load_skill_code',
   'chat_handoff_list_code','chat_handoff_load_code']){
   assert.ok(names.includes(tool),'Expected MCP tool missing: '+tool);
  }
  const shells=parse(await client.callTool({
   name:'list_shells_code',arguments:{}})).shells;
  assert.ok(Array.isArray(shells));
  const project=shells.find(s=>typeof s.initial_cwd==='string'&&
   path.resolve(s.initial_cwd).toLowerCase()===
    path.resolve(process.cwd()).toLowerCase());
  assert.ok(project?.shell_id,'Project shell was not found on live server');
  const catalog=parse(await client.callTool({
   name:'list_skills_code',arguments:{
    shell_id:project.shell_id,scope:'project',query:'find-skills',limit:20
   }
  }));
  assert.ok(Array.isArray(catalog.skills));
  const find=catalog.skills.find(s=>s.name==='find-skills');
  assert.ok(find?.skill_path,'Project skill find-skills is not discoverable');
  const loaded=parse(await client.callTool({
   name:'load_skill_code',arguments:{
    shell_id:project.shell_id,skill:find.skill_path,scope:'project'
   }
  }));
  assert.match(String(loaded.content||JSON.stringify(loaded)),/# Find Skills/,
   'Unable to load installed find-skills via live MCP');
  const handoffs=parse(await client.callTool({
   name:'chat_handoff_list_code',
   arguments:{shell_id:project.shell_id}
  }));
  assert.ok(Array.isArray(handoffs.tasks));
  const legacy=await verifiedExecutable(path.join(storage,'User',
   'globalStorage',extensionId),asset);
  console.log(JSON.stringify({
   status:'PASS',
   version,platform:asset.platformTag,
   nativeTunnelVersion:TUNNEL_VERSION,
   embeddedVerified:true,companionVerified:true,
   legacyVerified:!!legacy,
   processOrigin:'not changed or restarted by this diagnostic',
   liveMcp:true,mcpTools:names.length,projectShellFound:true,
   projectSkillRead:true,checkpointsVisible:handoffs.tasks.length,
   healthz:200,readyz:200,
   sensitiveDataExposed:false
  }));
 }finally{await client.close();}
})().catch(e=>{
 console.error('Integrated VSIX live check failed:',e?.message||String(e));
 process.exitCode=1;
});
