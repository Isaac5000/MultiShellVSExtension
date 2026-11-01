'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-main-owner-'));
const selected=path.join(tmp,'a','project'),foreign=path.join(tmp,'b','project');
fs.mkdirSync(selected,{recursive:true});fs.mkdirSync(foreign,{recursive:true});
const id='main-project-abcdef12',name='MCP ['+id+']';
let terminals=[];
const vscode={
 window:{
  get terminals(){return terminals;},
  onDidCloseTerminal:()=>({dispose(){}})
 },
 workspace:{workspaceFolders:[{uri:{fsPath:selected}}]}
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
function check(expected,preferred){
 const m=new ShellManager();
 try {
  const restored=m.restoreMainTerminals(selected,preferred);
  assert.equal(restored,expected);
  assert.equal(m.list().length,expected?1:0);
 }finally{m.dispose(true);}
}
try {
 terminals=[{name,creationOptions:{cwd:foreign}}];
 check(undefined,id);
 terminals=[{name,creationOptions:{cwd:selected}}];
 check(id);
 terminals=[{name}];
 check(undefined);
 check(id,id);
 terminals=[{name,creationOptions:{cwd:selected}},{name,creationOptions:{cwd:selected}}];
 check(undefined,id);
 console.log('PASS: restored main shell rejects foreign cwd, ambiguous missing identity, and duplicate physical terminals while preserving known identity');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
