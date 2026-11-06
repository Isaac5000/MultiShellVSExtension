'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ignore=fs.readFileSync(path.join(root,'.vscodeignore'),'utf8');
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
assert.ok(ignore.split(/\r?\n/).includes('skills-lock.json'),
 'Skills CLI project lockfile is development metadata and must not ship inside VSIX');
for(const [filename,contents] of [['.vscodeignore',ignore],['.gitignore',gitignore]]){
 for(const rule of ['.mcp.json','.mcp.json.multishell-backup-*',
  '*.multishell-backup-*','*.multishell-writing-*',
  '**/*.sqlite','**/*.sqlite-wal','**/*.sqlite-shm',
  '**/*.db','**/*.db-wal','**/*.db-shm']){
  assert.ok(contents.split(/\r?\n/).includes(rule),
   filename+' must exclude user connector/agent data matching '+rule);
 }
}
(async()=>{
 const version=require('../package.json').version;
 const vsix=path.join(root,'multi-shell-mcp-server-'+version+'-'+
  process.platform+'-'+process.arch+'.vsix');
 if(fs.existsSync(vsix)){
  const yauzl=require('yauzl');
  const included=new Set();
  await new Promise((resolve,reject)=>{
   yauzl.open(vsix,{lazyEntries:true},(error,zip)=>{
    if(error){reject(error);return;}
    zip.on('entry',entry=>{
     const name=entry.fileName.replace(/\\/g,'/');
     try{
      assert.ok(!/(?:^|\/)\.mcp\.json(?:$|\.|\/)/.test(name),
       'VSIX leaked a local MCP connector file: '+name);
      assert.ok(!/multishell-(?:backup|writing)|multishell\.lock/.test(name),
       'VSIX leaked an AI configuration backup: '+name);
      assert.ok(!/\.(?:sqlite|db)(?:-(?:wal|shm))?$/i.test(name),
       'VSIX leaked local agent memory: '+name);
      included.add(name);
     }catch(e){zip.close();reject(e);return;}
     zip.readEntry();
    });
    zip.on('end',resolve);zip.on('error',reject);zip.readEntry();
   });
  });
  for(const required of [
   'extension/dist/extension.js',
   'extension/media/panel.js'
  ]){
   assert.ok(included.has(required),'Missing core extension file: '+required);
  }
  assert.ok(![...included].some(name=>name.startsWith('extension/persistent-agent/')),
   'Standalone agent simulators must not be shipped');
  assert.ok(!included.has('extension/dist/mcp-sdk-client.cjs'),
   'Standalone MCP client bundle must not be shipped');
  assert.ok(![...included].some(name=>name.endsWith('openai-adapter.cjs')),
   'Metered inference adapter must not be shipped');
  assert.ok(!included.has('extension/skills-lock.json'),
   'Local development skill lockfile must not ship inside VSIX');
 }
 console.log('PASS: VSIX includes core MCP only, no independent agents, paid inference or private state');
})().catch(error=>{console.error(error);process.exitCode=1;});