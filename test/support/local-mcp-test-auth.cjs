'use strict';
const fs=require('node:fs'),path=require('node:path');
/** Private fixture credential for isolated real VS Code integration profiles.
 * Never export or log this value, or store it inside project fixtures. */
function localMcpHeaders(file=process.env.MULTISHELL_TEST_TOKEN_FILE){
 if(typeof file!=='string'||!path.isAbsolute(file)){
  throw new Error('Missing isolated MCP test token file path.');
 }
 let key;
 try{key=fs.readFileSync(file,'utf8').trim();}
 catch{throw new Error('Missing isolated MCP test token file.');}
 if(!/^[a-f0-9]{64}$/.test(key)){
  throw new Error('Invalid isolated MCP test token file.');
 }
 return {'x-multishell-local-auth':key};
}
module.exports={localMcpHeaders};
