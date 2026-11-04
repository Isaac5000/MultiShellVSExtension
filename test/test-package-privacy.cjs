'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ignore=fs.readFileSync(path.join(root,'.vscodeignore'),'utf8');
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
for(const [filename,contents] of [['.vscodeignore',ignore],['.gitignore',gitignore]]){
  for(const rule of ['.mcp.json','.mcp.json.multishell-backup-*',
    '*.multishell-backup-*','*.multishell-writing-*']){
    assert.ok(contents.split(/\r?\n/).includes(rule),
      filename+' must exclude user connector data matching '+rule);
  }
}
(async()=>{
const packageVersion=require('../package.json').version;
const vsix=path.join(root,'multi-shell-mcp-server-'+packageVersion+'.vsix');
if(fs.existsSync(vsix)){
  // VSIX is a ZIP file. Use the installed yauzl parser, not a shell command
  // that might misinterpret quoting or encoding.
  const yauzl=require('yauzl');
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
        }catch(e){zip.close();reject(e);return;}
        zip.readEntry();
      });
      zip.on('end',resolve);
      zip.on('error',reject);
      zip.readEntry();
    });
  });
}
console.log('PASS: VSIX and repository exclude local MCP settings, backups, lock files and transient connector data');
})().catch(error=>{console.error(error);process.exitCode=1;});