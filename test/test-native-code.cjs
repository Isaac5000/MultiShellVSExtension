'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runNative}=require('../out/tools/native-window-tools.js');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-windows-'));
 const project=path.join(dir,'project'),other=path.join(dir,'other');
 fs.mkdirSync(project);fs.mkdirSync(other);
 fs.writeFileSync(path.join(project,'hello.ts'),'const hello=1;');
 fs.writeFileSync(path.join(other,'private.ts'),'const secret=1;');
 const inside=path.join(project,'hello.ts'),outside=path.join(other,'private.ts');
 const uri=file=>({fsPath:file});
 const range={start:{line:3,character:5}};
 const diagnostic={range,severity:0,message:'Bad type',source:'ts'};
 const mock={
  Uri:{file:uri},
  Position:class{constructor(line,character){this.line=line;this.character=character;}},
  languages:{
   getDiagnostics:(u)=>u?[diagnostic]:[[uri(inside),[diagnostic]],[uri(outside),[diagnostic]]]
  },
  commands:{executeCommand:async(name,arg)=>{
   if(name==='vscode.executeWorkspaceSymbolProvider')
    return [{name:'hello',containerName:'root',kind:3,location:{uri:uri(inside),range}},
      {name:'secret',containerName:'root',kind:3,location:{uri:uri(outside),range}}];
   if(name==='vscode.executeDocumentSymbolProvider')
    return [{name:'file',kind:4,range,children:[{name:'hello',kind:3,range,children:[]}]}];
   if(name==='vscode.executeDefinitionProvider')
    return [{uri:uri(outside),range},{uri:uri(inside),range}];
   throw new Error('Unexpected VSCode command: '+name);
  }}
 };
 try {
  let results=await runNative(mock,project,'diagnostics',{});
  assert.equal(results.length,1);assert.equal(results[0].path,'hello.ts');
  results=await runNative(mock,project,'diagnostics',{file:'hello.ts'});
  assert.equal(results.length,1);
  results=await runNative(mock,project,'symbols',{query:'hello'});
  assert.equal(results.length,1);assert.equal(results[0].name,'hello');
  results=await runNative(mock,project,'document',{file:'hello.ts'});
  assert.deepEqual(results.map(r=>r.depth),[0,1]);
  results=await runNative(mock,project,'definition',{file:'hello.ts',line:1,column:1});
  assert.equal(results.length,1);assert.equal(results[0].path,'hello.ts');
  await assert.rejects(runNative(mock,project,'document',{file:'../other/private.ts'}),/escapes/);
  await assert.rejects(runNative(mock,project,'document',{file:outside}),/relative/);
  await assert.rejects(runNative(mock,project,'definition',{file:'hello.ts',line:0,column:1}),/positive/);
  try{
    fs.symlinkSync(outside,path.join(project,'link.ts'));
    await assert.rejects(runNative(mock,project,'document',{file:'link.ts'}),/Symbolic link escapes/);
  }catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
  console.log('PASS: owner-window native diagnostics, symbols, outline, definitions and sandbox');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
