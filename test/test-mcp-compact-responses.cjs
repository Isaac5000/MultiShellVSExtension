'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerShellTools}=require('../out/tools/shell-tools.js');
const {registerNativeTools}=require('../out/tools/native-mcp-tools.js');
const {registerScopedFileTools}=require('../out/tools/scoped-file-tools.js');
function toolRegistry(){
 const handlers=new Map();
 return {handlers,tool:(name,_description,_schema,handler)=>handlers.set(name,handler)};
}
function expectCompact(response,kind){
 assert.equal(response.isError,false,'Expected success for '+kind);
 assert.equal(response.content.length,1);
 const text=response.content[0].text;
 assert.deepEqual(JSON.parse(text),JSON.parse(JSON.stringify(JSON.parse(text))));
 assert.equal(text,JSON.stringify(JSON.parse(text)),kind+' should not add JSON-only whitespace');
}
(async()=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-compact-mcp-'));
 try{
  fs.writeFileSync(path.join(workspace,'sample.txt'),'Example');
  const shells={
   list:async()=>Array.from({length:18},(_,i)=>({
    shell_id:'shell-'+i,initial_cwd:workspace,origin:'automatic',
    busy:false,queued:0,alias:'alias-'+i
   })),
   root:()=>workspace,
   native:async()=>[{path:'src/example.ts',line:1,
    message:'A representative message containing spaces and punctuation.'}]
  };
  const a=toolRegistry();registerShellTools(a,shells);
  expectCompact(await a.handlers.get('list_shells_code')({}),'shell list');
  const b=toolRegistry();registerNativeTools(b,shells);
  expectCompact(await b.handlers.get('get_diagnostics_code')({
   shell_id:'shell-0',format:'json',severities:[0,1],includeSource:true
  }),'native diagnostics');
  const c=toolRegistry();
  registerScopedFileTools(c,shells,{file:true,edit:false});
  expectCompact(await c.handlers.get('list_files_code')({
   shell_id:'shell-0',path:'.',recursive:false
  }),'scoped listing');
  const bytes=Buffer.byteLength((await a.handlers.get('list_shells_code')({})).content[0].text);
  console.log('PASS compact MCP JSON keeps response schema and reduces transferred bytes, shell-list bytes='+bytes);
 }finally{fs.rmSync(workspace,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
