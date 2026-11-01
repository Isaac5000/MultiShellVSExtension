'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runIsolatedCommand}=require('../out/tools/isolated-command.js');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-isolated-'));
 try{
  const windows=process.platform==='win32';
  const probe=windows?'Write-Output ISOLATED_OK; Write-Output ISOLATED_ERR':'printf ISOLATED_OK; printf ISOLATED_ERR';
  const result=await runIsolatedCommand('test_shell',root,probe,5000);
  assert.equal(result.exit_code,0);
  assert.match(result.output,/ISOLATED_OK/);
  assert.match(result.output,/ISOLATED_ERR/);
  assert.equal(result.output_incomplete,false);
  const environment=windows
   ?'Write-Output "$env:GIT_PAGER|$env:PAGER|$env:GIT_TERMINAL_PROMPT|$env:TERM"'
   :'printf "%s|%s|%s|%s" "$GIT_PAGER" "$PAGER" "$GIT_TERMINAL_PROMPT" "$TERM"';
  const env=await runIsolatedCommand('test_shell',root,environment,5000);
  assert.equal(env.exit_code,0);
  assert.match(env.output,/cat\|cat\|0\|dumb/,'No interactive Git pager or credential prompt');

  const cwd=await runIsolatedCommand('test_shell',root,windows?'(Get-Location).Path':'pwd',5000);
  assert.equal(cwd.exit_code,0);
  assert.ok(cwd.output.trim().toLowerCase().includes(path.basename(root).toLowerCase()));
  const oversized=await runIsolatedCommand('test_shell',root,
    `node -e "process.stdout.write('x'.repeat(1050000))"`,5000);
  assert.equal(oversized.exit_code,0);
  assert.equal(oversized.output.length,1000000);
  assert.equal(oversized.truncated,true);
  // Regression: the exact Git command which previously left the user's
  // integrated PowerShell terminal waiting at a pager prompt.
  const git=await runIsolatedCommand('test_shell',root,'git --version',5000);
  if(git.exit_code===0){
   assert.equal((await runIsolatedCommand('test_shell',root,'git init -q',5000)).exit_code,0);
   fs.writeFileSync(path.join(root,'tracked.txt'),'original\n');
   assert.equal((await runIsolatedCommand('test_shell',root,'git add tracked.txt',5000)).exit_code,0);
   fs.writeFileSync(path.join(root,'tracked.txt'),'line with trailing spaces   \n');
   const diff=await runIsolatedCommand('test_shell',root,'git diff --check',5000);
   assert.notEqual(diff.exit_code,0,'Whitespace error should still be detected');
   assert.match(diff.output,/trailing whitespace/i);
  }
  const sleeping=windows?'Start-Sleep -Seconds 20':'sleep 20';
  await assert.rejects(runIsolatedCommand('test_shell',root,sleeping,1000),/timed out/);
  const controller=new AbortController();
  const cancelled=runIsolatedCommand('test_shell',root,sleeping,5000,controller.signal);
  setTimeout(()=>controller.abort(),150);
  await assert.rejects(cancelled,/cancelled/);
  controller.abort();
  assert.throws(()=>runIsolatedCommand('test_shell',root,probe,1000,controller.signal),/cancelled before execution/);
  assert.throws(()=>runIsolatedCommand('test_shell',root,'   ',1000),/Empty/);
  assert.throws(()=>runIsolatedCommand('test_shell',root,probe,999),/timeout must/);
  await assert.rejects(runIsolatedCommand('test_shell',path.join(root,'missing'),probe,1000));
  console.log('PASS: isolated command output, cwd, pager suppression, bounded output, timeout, cancellation and invalid inputs');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});