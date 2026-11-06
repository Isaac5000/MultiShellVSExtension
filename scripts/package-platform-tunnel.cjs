'use strict';
/**
 * Offline-capable, OS-specific VSIX builder.
 * Stages a pinned official Tunnel Client v0.0.19 archive next to a
 * platform-independent Node.js extension bundle. No runtime download or
 * duplicate globalStorage extraction is needed after installing this VSIX.
 *
 * Native tunnel files must remain native: TypeScript/Node.js orchestrates
 * them, not a reimplementation of OpenAI's tunnel protocol or cloudflared.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const targets=['win32-x64','win32-arm64','linux-x64','linux-arm64',
 'darwin-x64','darwin-arm64'];
function options(argv){
 const args={target:process.platform+'-'+process.arch,archive:undefined,list:false};
 for(const input of argv){
  if(input==='--list-targets'){args.list=true;continue;}
  if(input.startsWith('--target=')){args.target=input.slice(9);continue;}
  if(input.startsWith('--archive=')){args.archive=path.resolve(input.slice(10));continue;}
  throw Error('Unsupported parameter: '+input);
 }
 if(!args.list&&!targets.includes(args.target)){
  throw Error('Unsupported tunnel platform: '+args.target);
 }
 return args;
}
function sourceAsset(target){
 const [platform,arch]=target.split('-');
 const {tunnelAsset}=require('../out/tunnel-release.js');
 return tunnelAsset(platform,arch);
}
async function downloadedArchive(asset){
 const cache=path.join(root,'.vscode-test','official-tunnel-archives');
 await fs.promises.mkdir(cache,{recursive:true});
 const cached=path.join(cache,asset.filename);
 const {hashFile}=require('../out/tunnel-release.js');
 if(fs.existsSync(cached)){
  if(await hashFile(cached)===asset.sha256){return cached;}
  // Never silently replace a suspicious archive.
  throw Error('Cached official tunnel archive does not match pinned SHA-256.');
 }
 const stage=cached+'.downloading-'+process.pid;
 try{
  const res=await fetch(asset.url,{signal:AbortSignal.timeout(180000),
   redirect:'follow'});
  if(!res.ok||!res.body)throw Error('Official tunnel download failed: HTTP '+res.status);
  let size=0;
  const limit=125*1024*1024;
  const meter=new TransformStream({
   transform(chunk,controller){
    size+=chunk.byteLength;
    if(size>limit)throw Error('Official tunnel archive exceeds 125 MiB');
    controller.enqueue(chunk);
   }
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(meter)),
   fs.createWriteStream(stage,{flags:'wx',mode:0o600}));
  if(await hashFile(stage)!==asset.sha256){
   throw Error('Pinned tunnel archive SHA-256 mismatch. Nothing packaged.');
  }
  await fs.promises.rename(stage,cached);
  return cached;
 }finally{await fs.promises.rm(stage,{force:true}).catch(()=>{});}
}
async function stageOfficialTunnel({archive,destination,asset,checkVersion=true}){
 const {hashFile,execChecked,TUNNEL_VERSION}=require('../out/tunnel-release.js');
 const {extractTunnelZip}=require('../out/tunnel-archive.js');
 if(await hashFile(archive)!==asset.sha256){
  throw Error('Pinned tunnel archive SHA-256 mismatch. Nothing packaged.');
 }
 await fs.promises.mkdir(destination,{recursive:true});
 const companion=asset.platform==='win32'?'cloudflared.exe':'cloudflared';
 await extractTunnelZip(archive,destination,asset.platformTag,asset.binary,companion);
 const exe=path.join(destination,asset.binary);
 const cloud=path.join(destination,companion);
 if(asset.platform!=='win32'){
  await Promise.all([fs.promises.chmod(exe,0o755),fs.promises.chmod(cloud,0o755)]);
 }
 if(checkVersion&&asset.platform===process.platform&&asset.arch===process.arch){
  const reported=await execChecked(exe,['--version'],destination,12000);
  if(!reported.startsWith(TUNNEL_VERSION)){
   throw Error('Bundled official tunnel reports another version.');
  }
 }
 const marker={
  release:TUNNEL_VERSION,
  filename:asset.filename,
  archiveSha256:asset.sha256,
  executableSha256:await hashFile(exe),
  companionSha256:await hashFile(cloud)
 };
 await fs.promises.writeFile(path.join(destination,'verified.json'),
  JSON.stringify(marker,null,2),{flag:'wx',mode:0o600});
 return marker;
}
async function main(){
 const args=options(process.argv.slice(2));
 if(args.list){console.log(targets.join('\n'));return;}
 const asset=sourceAsset(args.target);
 const bundle=path.join(root,'dist','extension.js');
 if(!fs.existsSync(bundle)){
  throw Error('Build the Node.js extension first using npm run bundle.');
 }
 const pkg=require('../package.json');
 const archive=args.archive??await downloadedArchive(asset);
 const scratch=path.join(root,'.vscode-test');
 fs.mkdirSync(scratch,{recursive:true});
 const stage=fs.mkdtempSync(path.join(scratch,'platform-vsix-'));
 try{
  // Allowlist only runtime and documentation assets, never user data,
  // .agents, .git, node_modules, cached archives or tunnel profiles.
  for(const filename of ['package.json','package.nls.json','package.nls.es.json',
   'README.md','CHANGELOG.md','LICENSE']){
   fs.copyFileSync(path.join(root,filename),path.join(stage,filename));
  }
  // This staging folder is already built. Suppress vsce's automatic
  // prepublish hook, which otherwise tries to recompile absent source files.
  const manifestFile=path.join(stage,'package.json');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  delete manifest.scripts;
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n','utf8');
  for(const dirname of ['dist','media','docs']){
   fs.cpSync(path.join(root,dirname),path.join(stage,dirname),{
    recursive:true,filter:source=>!source.endsWith('.map')
   });
  }
  const destination=path.join(stage,'tunnel-client',
   'v'+require('../out/tunnel-release.js').TUNNEL_VERSION,asset.platformTag);
  await stageOfficialTunnel({archive,destination,asset});
  const out=path.join(root,'multi-shell-mcp-server-'+pkg.version+'-'+args.target+'.vsix');
  const cli=path.join(root,'node_modules','@vscode','vsce','vsce');
  const command=[cli,'package','--allow-missing-repository',
   '--no-rewrite-relative-links','--no-dependencies',
   '--target',args.target,'--out',out];
  const run=spawnSync(process.execPath,command,{cwd:stage,encoding:'utf8',
   timeout:180000,maxBuffer:2*1024*1024,windowsHide:true});
  if(run.error||run.status!==0){
   throw Error('Platform-specific VSIX package failed: '+
    (run.error?.message||String(run.stderr||run.stdout||'').slice(-1400)));
  }
  const {hashFile}=require('../out/tunnel-release.js');
  console.log(JSON.stringify({
   target:args.target,archive:asset.filename,
   sha256:await hashFile(out),vsix:out,bytes:fs.statSync(out).size,
   embeddedTunnel:true,downloadRequiredAtRuntime:false
  }));
 }finally{
  fs.rmSync(stage,{recursive:true,force:true,maxRetries:8,retryDelay:150});
 }
}
if(require.main===module){
 main().catch(e=>{console.error(e?.message||String(e));process.exitCode=1;});
}
module.exports={options,targets,sourceAsset,stageOfficialTunnel};