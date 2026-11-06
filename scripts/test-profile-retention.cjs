'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const MIN_AGE_MS=10*60*1000;
const MAX_FAILED_AGE_MS=14*24*60*60*1000;
const PATTERN=/^profiles-[0-9]{14,20}$/;
const FIXED_TEST_PROFILES=new Set(['installer-profile','profile-A','profile-B']);

/** Use OS process command lines to protect ALL VS Code test profiles.
 * If inspection fails, refuse deletion rather than guessing which directory
 * belongs to a live process. Never act on VS Code's normal user profile.
 */
function activeCodeCommands(){
 let raw;
 if(process.platform==='win32'){
  const script=[
   "$ErrorActionPreference='Stop'",
   "$rows=@(Get-CimInstance Win32_Process -Filter \"name='Code.exe'\" |",
   " ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;cmd=$_.CommandLine} })",
   "ConvertTo-Json -InputObject $rows -Compress -Depth 3"
  ].join('; ').replace('|;  ForEach-Object','| ForEach-Object');
  raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
   {encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:2*1024*1024}).trim();
  const values=JSON.parse(raw);
  if(!Array.isArray(values)){throw Error('Unexpected Windows process inspection result.');}
  if(values.some(v=>typeof v.cmd!=='string')){
   throw Error('Cannot verify all running VS Code process command lines.');
  }
  return values.map(v=>v.cmd);
 }
 raw=execFileSync('ps',['-A','-o','args='],
  {encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
 return raw.split(/\r?\n/).filter(s=>/\b(?:code|Code|electron)\b/.test(s));
}
function isActiveFactory(){
 const commands=activeCodeCommands().map(s=>process.platform==='win32'
  ?s.replaceAll('/','\\').toLowerCase():s);
 return profile=>{
  const target=process.platform==='win32'
   ?path.resolve(profile).replaceAll('/','\\').toLowerCase()
   :path.resolve(profile);
  return commands.some(command=>command.includes(target));
 };
}
function validTarget(base,target){
 if(typeof base!=='string'||typeof target!=='string'){return false;}
 const parent=path.resolve(base),resolved=path.resolve(target);
 if(path.dirname(resolved)!==parent){return false;}
 const name=path.basename(resolved);
 if(!PATTERN.test(name) &&
  !(name==='profile'&&path.basename(parent)==='terminal-integration') &&
  !(FIXED_TEST_PROFILES.has(name)&&path.basename(parent)==='connection-windows')){
  return false;
 }
 try{
  const parentStat=fs.lstatSync(parent);
  if(!parentStat.isDirectory()||parentStat.isSymbolicLink()){return false;}
  const stat=fs.lstatSync(resolved);
  if(!stat.isDirectory()||stat.isSymbolicLink()){return false;}
 }catch{return false;}
 return true;
}
function safeRemoveTestProfile(base,target,isActive=isActiveFactory()){
 if(!validTarget(base,target)){return false;}
 if(isActive(target)){return false;}
 fs.rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 return true;
}
/** Prune only our own timestamped test run folders, never unrelated files.
 * Failure diagnostics: retain the newest failed run, at most fourteen days.
 * Avoid newly created profiles even if no process is attached *yet*.
 */
function pruneConnectionProfiles(base,opts={}){
 const summary={eligible:0,removed:0,skippedActive:0,skippedRecent:0,
  retainedFailed:0,errors:[]};
 if(!fs.existsSync(base)){return summary;}
 const now=opts.now??Date.now();
 let isActive;
 try{isActive=opts.isActive??isActiveFactory();}
 catch(e){summary.errors.push(String(e));return summary;}
 let candidates;
 try{
  candidates=fs.readdirSync(base,{withFileTypes:true})
   .filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&
    (PATTERN.test(d.name)||FIXED_TEST_PROFILES.has(d.name)))
   .map(d=>path.join(base,d.name)).sort();
 }catch(e){summary.errors.push(String(e));return summary;}
 const failed=candidates.filter(dir=>PATTERN.test(path.basename(dir))&&
  fs.existsSync(path.join(dir,'.test-failed')));
 const latestFailed=failed.at(-1);
 for(const dir of candidates){
  try{
   if(!validTarget(base,dir)){continue;}
   const age=now-fs.statSync(dir).mtimeMs;
   if(age<MIN_AGE_MS){summary.skippedRecent++;continue;}
   if(isActive(dir)){summary.skippedActive++;continue;}
   if(dir===latestFailed&&age<MAX_FAILED_AGE_MS){
    summary.retainedFailed++;continue;
   }
   summary.eligible++;
   if(!opts.dryRun&&safeRemoveTestProfile(base,dir,isActive)){summary.removed++;}
  }catch(e){summary.errors.push(path.basename(dir)+': '+String(e));}
 }
 return summary;
}
module.exports={isActiveFactory,safeRemoveTestProfile,pruneConnectionProfiles,
 MIN_AGE_MS,MAX_FAILED_AGE_MS};
