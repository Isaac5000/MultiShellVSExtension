'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {isActiveFactory,pruneConnectionProfiles,safeRemoveTestProfile,MIN_AGE_MS}=
 require('./test-profile-retention.cjs');
const EXPECTED=new Set(['tunnel-client.exe','cloudflared.exe','verified.json',
 'cloudflared-manifest.json','LICENSE','NOTICE',
 'tunnel-client-v0.0.19-windows-amd64-licenses.txt',
 'tunnel-client-v0.0.19-windows-amd64.spdx.json']);
const PATTERN=/^windows-amd64\.legacy-backup-\d{8}-\d{6}$/;
function sha(file){
 const hash=createHash('sha256');
 const descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const size=fs.fstatSync(descriptor);
  if(!size.isFile()||size.size>100*1024*1024){throw Error('Unexpected backup binary');}
  const buffer=Buffer.alloc(1024*1024);
  let count;
  while((count=fs.readSync(descriptor,buffer,0,buffer.length,null))>0){
   hash.update(buffer.subarray(0,count));
  }
  return hash.digest('hex');
 }finally{fs.closeSync(descriptor);}
}
function knownBackup(dir){
 try{
  const dirStat=fs.lstatSync(dir);
  if(!dirStat.isDirectory()||dirStat.isSymbolicLink()){return false;}
  const names=fs.readdirSync(dir);
  if(names.some(name=>!EXPECTED.has(name))){return false;}
  if(!['tunnel-client.exe','cloudflared.exe','verified.json'].every(n=>names.includes(n))){return false;}
  if(names.some(n=>{
   const stat=fs.lstatSync(path.join(dir,n));
   return !stat.isFile()||stat.isSymbolicLink();
  })){return false;}
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'verified.json'),'utf8'));
  if(meta.release!=='0.0.19'||
   !/^[a-f0-9]{64}$/i.test(meta.archiveSha256)||
   !/^[a-f0-9]{64}$/i.test(meta.executableSha256)||
   !/^[a-f0-9]{64}$/i.test(meta.companionSha256)){return false;}
  return sha(path.join(dir,'tunnel-client.exe')).toLowerCase()===meta.executableSha256.toLowerCase() &&
    sha(path.join(dir,'cloudflared.exe')).toLowerCase()===meta.companionSha256.toLowerCase();
 }catch{return false;}
}
function actualTunnelActivity(){
 if(process.platform!=='win32'){throw Error('Legacy Windows tunnel cleanup only supports Windows.');}
 const code=[
  "$ErrorActionPreference='Stop'",
  "$items=@(Get-CimInstance Win32_Process -Filter \"name='tunnel-client.exe' OR name='cloudflared.exe'\" |",
  "ForEach-Object { [pscustomobject]@{exe=$_.ExecutablePath;command=$_.CommandLine} })",
  "ConvertTo-Json -InputObject $items -Compress -Depth 3"
 ].join('; ').replace('|; ForEach-Object','| ForEach-Object');
 const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],
  {encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024}).trim();
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.some(row=>typeof row.exe!=='string'||typeof row.command!=='string')){
  throw Error('Cannot verify all active tunnel executable paths.');
 }
 return dir=>{
  const prefix=path.resolve(dir).toLowerCase()+'\\';
  return rows.some(row=>row.exe.toLowerCase().startsWith(prefix)||
   row.command.toLowerCase().includes(path.resolve(dir).toLowerCase()));
 };
}
function folderBytes(dir){
 let total=0;
 for(const dirent of fs.readdirSync(dir,{withFileTypes:true})){
  const target=path.join(dir,dirent.name);
  if(dirent.isFile()){total+=fs.statSync(target).size;}
 }
 return total;
}
function pruneLegacyBackups(root,opts={}){
 const summary={eligible:0,removed:0,bytes:0,skippedActive:0,skippedUnsafe:0,errors:[]};
 if(!fs.existsSync(root)){return summary;}
 if(path.basename(path.resolve(root))!=='v0.0.19'){summary.errors.push('Invalid legacy backup root');return summary;}
 let isInUse;
 try{isInUse=opts.isInUse||actualTunnelActivity();}
 catch(e){summary.errors.push(String(e));return summary;}
 let entries;
 try{entries=fs.readdirSync(root,{withFileTypes:true});}
 catch(e){summary.errors.push(String(e));return summary;}
 for(const entry of entries){
  if(!PATTERN.test(entry.name)){continue;}
  const dir=path.join(root,entry.name);
  try{
   if(!entry.isDirectory()||entry.isSymbolicLink()||!knownBackup(dir)){
    summary.skippedUnsafe++;continue;
   }
   if((opts.now||Date.now())-fs.statSync(dir).mtimeMs<MIN_AGE_MS){continue;}
   if(isInUse(dir)){summary.skippedActive++;continue;}
   const bytes=folderBytes(dir);
   summary.eligible++;summary.bytes+=bytes;
   if(!opts.dryRun){
    // Second inspection immediately before deletion to avoid stale scans.
    if(isInUse(dir)){summary.skippedActive++;continue;}
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:250});
    summary.removed++;
   }
  }catch(e){summary.errors.push(entry.name+': '+String(e));}
 }
 return summary;
}
function main(){
 const apply=process.argv.includes('--apply');
 if(process.argv.slice(2).some(x=>!['--apply','--dry-run'].includes(x))){
  throw Error('Usage: node scripts/storage-maintenance.cjs [--apply|--dry-run]');
 }
 const root=path.resolve(__dirname,'..'),base=path.join(root,'.vscode-test');
 const connection=pruneConnectionProfiles(path.join(base,'connection-windows'),{dryRun:!apply});
 let terminal='not present';
 const terminalRoot=path.join(base,'terminal-integration'),terminalDir=path.join(terminalRoot,'profile');
 if(fs.existsSync(terminalDir)){
  try{
   const age=Date.now()-fs.statSync(terminalDir).mtimeMs;
   if(age<MIN_AGE_MS){terminal='recent; retained';}
   else if(!apply){terminal='eligible for safe cleanup (dry-run)';}
   else{terminal=safeRemoveTestProfile(terminalRoot,terminalDir)
    ?'removed':'still active or unsafe; retained';}
  }catch(e){terminal='retained: '+String(e);}
 }
 const storage=process.env.APPDATA?
  path.join(process.env.APPDATA,'Code','User','globalStorage',
   'local-multishell.multi-shell-mcp-server','tunnel-client','v0.0.19'):
  path.join(os.homedir(),'.config','Code','User','globalStorage',
   'local-multishell.multi-shell-mcp-server','tunnel-client','v0.0.19');
 const legacy=pruneLegacyBackups(storage,{dryRun:!apply});
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',
  isolatedConnectionProfiles:connection,terminalProfile:terminal,legacyTunnelBackup:legacy,
  installedExtensions:'Not modified; VS Code owns extension installation and removal.'},null,2));
 if(connection.errors.length||legacy.errors.length){process.exitCode=1;}
}
if(require.main===module){try{main();}catch(e){console.error(e);process.exitCode=1;}}
module.exports={pruneLegacyBackups,knownBackup};
