'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {resolveTestShell}=require('./test-shell-resolver.cjs');
const root=path.resolve(__dirname,'..');
const base=path.join(root,'.vscode-test','terminal-integration');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function main(){
 const windows=process.platform==='win32';
 const code=process.env.VSCODE_EXECUTABLE||(windows
  ?path.join(process.env.LOCALAPPDATA||'','Programs','Microsoft VS Code','Code.exe'):'code');
 const shell=resolveTestShell();
 if(windows&&!fs.existsSync(code)){throw Error('Set VSCODE_EXECUTABLE to the VS Code executable.');}
 for(const folder of ['test-workspace/a','test-workspace/b','profile/User','extensions']){
  fs.mkdirSync(path.join(base,folder),{recursive:true});
 }
 // The isolated VS Code profile must use exactly the credential supplied to
 // its test RPC client. Never place this token in reports or console output.
 const tokenFile=path.join(base,'profile','User','globalStorage','local-multishell.multi-shell-mcp-server','multishell-local-token');
 fs.mkdirSync(path.dirname(tokenFile),{recursive:true});
 fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{flag:'w',mode:0o600});
 const port=await freePort();
 const platformKey=windows?'windows':process.platform==='darwin'?'osx':'linux';
 const settings={
  'multi-shell-mcp.port':port,'multi-shell-mcp.defaultEnabled':false,
  ['terminal.integrated.defaultProfile.'+platformKey]:'AuditPwsh',
  ['terminal.integrated.profiles.'+platformKey]:{AuditPwsh:{path:shell,args:[]}},
  ['terminal.integrated.automationProfile.'+platformKey]:{path:shell,args:[]},
  'terminal.integrated.enablePersistentSessions':false,'security.workspace.trust.enabled':false,
  'extensions.autoUpdate':false,'telemetry.telemetryLevel':'off','update.mode':'none','workbench.startupEditor':'none'
 };
 fs.writeFileSync(path.join(base,'profile/User/settings.json'),JSON.stringify(settings,null,2));
 const reportFile=path.join(base,'extension-host-results.json');
 fs.writeFileSync(reportFile,JSON.stringify({stage:'launching'}));
 const stdout=fs.openSync(path.join(base,'host-stdout.log'),'w');
 const stderr=fs.openSync(path.join(base,'host-stderr.log'),'w');
 const child=spawn(code,['--user-data-dir',path.join(base,'profile'),'--extensions-dir',path.join(base,'extensions'),
  '--extensionDevelopmentPath',root,'--extensionTestsPath',path.join(root,'test/vscode-terminal-integration.cjs'),
  '--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes',
  '--new-window',path.join(base,'test-workspace')],{
   windowsHide:true,stdio:['ignore',stdout,stderr],
   env:{...process.env,MULTISHELL_TEST_ROOT:base,MULTISHELL_TEST_PORT:String(port),MULTISHELL_TEST_TOKEN_FILE:tokenFile}
  });
 let launchError;child.once('error',error=>{launchError=error;});
 fs.closeSync(stdout);fs.closeSync(stderr);
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  if(launchError){throw launchError;}
  let report;try{report=JSON.parse(fs.readFileSync(reportFile,'utf8'));}catch{}
  if(report?.stage==='complete'){
   for(const check of report.checks||[]){console.log((check.passed?'PASS ':'FAIL ')+check.name+' ('+check.ms+' ms)');}
   const failures=(report.checks||[]).filter(check=>!check.passed);
   if(report.fatal||failures.length){throw Error(report.fatal||failures.map(check=>check.error).join('\n'));}
   console.log('PASS: '+report.checks.length+' real VS Code checks; report '+reportFile);return;
  }
  await wait(500);
 }
 throw Error('VS Code test host did not complete within 180 seconds. See '+reportFile);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
