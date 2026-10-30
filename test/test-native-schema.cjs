'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runNative}=require('../out/tools/native-window-tools.js');
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'native-schema-'));
 const file=path.join(tmp,'file.ts');
 fs.writeFileSync(file,'const alpha = 1;\nalpha;\n');
 const uri={fsPath:file};
 const range={start:{line:0,character:6}};
 const mock={
  Uri:{file:p=>({fsPath:p})},
  Position:class{constructor(line,column){this.line=line;this.character=column;}},
  workspace:{openTextDocument:async()=>({lineCount:2,lineAt:()=>({text:'const alpha = 1;'})})},
  languages:{getDiagnostics:()=>[[uri,[
   {range,severity:0,message:'error',source:'test'},
   {range,severity:2,message:'info',source:'test'}
  ]]]},
  commands:{executeCommand:async(cmd,_uri,position)=>{
   if(cmd==='vscode.executeDocumentSymbolProvider')
    return [{name:'parent',kind:1,range,children:[{name:'child',kind:2,range,children:[]}]}];
   if(cmd==='vscode.executeDefinitionProvider'){
    assert.equal(position.character,6,'symbol should determine column');
    return [{uri,range}];
   }
   if(cmd==='vscode.executeHoverProvider')return [{contents:[{value:'const alpha: number'}]}];
   throw new Error(cmd);
  }}
 };
 try {
  const result=await runNative(mock,tmp,'diagnostics',{severities:[2],format:'json',includeSource:false});
  assert.equal(result.length,1);assert.equal(result[0].severity,2);assert.ok(!('source' in result[0]));
  const asText=await runNative(mock,tmp,'diagnostics',{severities:[0],format:'text'});
  assert.match(asText,/error/);assert.doesNotMatch(asText,/info/);
  const doc=await runNative(mock,tmp,'document',{file:'file.ts',maxDepth:0});
  assert.deepEqual(doc.map(x=>x.name),['parent']);
  const def=await runNative(mock,tmp,'definition',{file:'file.ts',line:1,symbol:'alpha'});
  assert.equal(def.symbol,'alpha');assert.equal(def.locations.length,1);
  assert.match(def.hover[0],/number/);
  await assert.rejects(runNative(mock,tmp,'definition',{file:'file.ts',line:1,symbol:'missing'}),/not present/);
  console.log('PASS: native legacy-compatible params (symbol, maxDepth, severities, format, source)');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
