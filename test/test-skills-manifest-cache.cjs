'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSkillEntry}=require('../out/tools/skills-extension.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-manifest-cache-'));
const dir=path.join(root,'.agents/skills/cached'),refs=path.join(dir,'references');
const selected='.agents/skills/cached';
const digest=name=>buildSkillEntry(root,'shell',selected).resources.find(x=>x.uri.endsWith('/'+name))?.digest;
let reads=0;const original=fs.readSync;
try{
 fs.mkdirSync(refs,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: cached\ndescription: Cache validation\n---\n# Hello\n');
 fs.writeFileSync(path.join(refs,'one.md'),'Hello one');
 const first=buildSkillEntry(root,'shell',selected);
 reads=0;
 fs.readSync=function(...args){reads++;return original.apply(this,args);};
 const second=buildSkillEntry(root,'shell',selected);
 assert.deepEqual(second,first);
 assert.equal(reads,0,'Repeated manifest reads should validate metadata without rehashing unchanged files');
 fs.readSync=original;
 fs.writeFileSync(path.join(refs,'one.md'),'Mutated content with different size');
 assert.notEqual(digest('one.md'),first.resources.find(x=>x.uri.endsWith('/one.md')).digest,
  'Changing a resource must immediately invalidate its SHA-256 manifest');
 fs.writeFileSync(path.join(refs,'new.md'),'New resource');
 assert.equal(buildSkillEntry(root,'shell',selected).resources.length,3,'New resource must appear immediately');
 fs.rmSync(path.join(refs,'new.md'));
 assert.equal(buildSkillEntry(root,'shell',selected).resources.length,2,'Removed resource must vanish immediately');
 if(process.platform!=='win32'){
  const outside=path.join(root,'outside.txt');fs.writeFileSync(outside,'secret');
  fs.symlinkSync(outside,path.join(refs,'escape.txt'));
  assert.throws(()=>buildSkillEntry(root,'shell',selected),/symlink/i);
 }
 console.log('PASS manifest cache: reuse unchanged hashes, invalidate modified/new/removed resources, reject symlinks');
}finally{fs.readSync=original;fs.rmSync(root,{recursive:true,force:true});}
