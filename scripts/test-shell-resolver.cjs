'use strict';
const {spawnSync}=require('node:child_process');
/**
 * Resolve PowerShell 7 by testing whether the executable actually launches.
 * Windows Store aliases in WindowsApps are valid CreateProcess targets even
 * though Node's fs.existsSync() may return false for those reparse points.
 */
function resolveTestShell({platform=process.platform,override=process.env.MULTISHELL_TEST_SHELL,
    spawnSync:spawn=spawnSync}={}){
 const windows=platform==='win32';
 let candidates;
 if(override){candidates=[override];}
 else{
  const where=spawn(windows?'where.exe':'which',[windows?'pwsh.exe':'pwsh'],
   {encoding:'utf8',windowsHide:true,timeout:5000});
  candidates=String(where.stdout||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
 }
 for(const candidate of candidates){
  const probe=spawn(candidate,['--version'],{
   encoding:'utf8',windowsHide:true,timeout:5000
  });
  if(probe.status===0&&/^PowerShell\s+7(?:\.|\s|$)/i.test(String(probe.stdout||'').trim())){
   return candidate;
  }
 }
 throw new Error('PowerShell 7 is required for VS Code integration tests. Install pwsh or set MULTISHELL_TEST_SHELL to a working executable.');
}
module.exports={resolveTestShell};
