'use strict';
const fs=require('node:fs');
const path=require('node:path');
const yazl=require('yazl');
const root=path.resolve(__dirname,'..');
const base=path.join(root,'plugins','multishell-mcp');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'plugin.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(manifest.version!==pkg.version)throw Error('Plugin version differs from VSIX version');
const out=path.join(root,'multi-shell-mcp-plugin-'+pkg.version+'.zip');
const zip=new yazl.ZipFile();
let count=0;
function visit(directory,prefix){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const real=path.join(directory,entry.name);
  const relative=prefix+'/'+entry.name;
  if(entry.isSymbolicLink())throw Error('Plugin must not contain symlinks: '+relative);
  if(entry.isDirectory())visit(real,relative);
  else if(entry.isFile()){
   zip.addFile(real,relative,{compress:true});
   count++;
  }else throw Error('Unsupported plugin entry: '+relative);
 }
}
visit(base,'multishell-mcp');
const stream=fs.createWriteStream(out,{flags:'w'});
zip.outputStream.pipe(stream);
zip.end();
stream.once('finish',()=>console.log('PLUGIN_ZIP_OK '+out+' '+count+' files '+fs.statSync(out).size+' bytes'));
stream.once('error',e=>{console.error(e);process.exitCode=1;});
zip.outputStream.once('error',e=>{console.error(e);process.exitCode=1;});
