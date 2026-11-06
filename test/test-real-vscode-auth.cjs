'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {localMcpHeaders}=require('./support/local-mcp-test-auth.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-test-auth-'));
try{
 const key=randomBytes(32).toString('hex');
 const file=path.join(temp,'multishell-local-token');
 fs.writeFileSync(file,key,{mode:0o600});
 const headers=localMcpHeaders(file);
 assert.equal(headers['x-multishell-local-auth'],key);
 assert.deepEqual(Object.keys(headers),['x-multishell-local-auth']);
 assert.throws(()=>localMcpHeaders(path.join(temp,'absent')),/token|credential|missing/i);
 fs.writeFileSync(file,'not-a-valid-key');
 assert.throws(()=>localMcpHeaders(file),/invalid|token|credential/i);
 console.log('PASS isolated VSCode test auth loads private token and refuses missing or invalid credentials');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
