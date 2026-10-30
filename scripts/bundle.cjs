'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {build}=require('esbuild');
const root=path.resolve(__dirname,'..');
async function main(){
 const out=path.join(root,'dist');
 fs.mkdirSync(out,{recursive:true});
 await build({
   entryPoints:[path.join(root,'src/extension.ts')],
   outfile:path.join(out,'extension.js'),
   bundle:true,
   platform:'node',
   format:'cjs',
   target:'node20',
   external:['vscode'],
   packages:'bundle',
   sourcemap:false,
   minify:false,
   legalComments:'none',
   logLevel:'info'
 });
 const bundled=fs.readFileSync(path.join(out,'extension.js'),'utf8');
 for(const required of ['multi-shell-mcp.sessions','get_diagnostics_code','get_symbol_definition_code','execute_shell_command_code']){
   if(!bundled.includes(required))throw new Error('Bundled extension missing '+required);
 }
 console.log('BUNDLE_OK '+fs.statSync(path.join(out,'extension.js')).size+' bytes');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
