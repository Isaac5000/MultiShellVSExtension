'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-growth-'));
const base=path.join(root,'.agents/skills/growing'),asset=path.join(base,'asset.txt');
fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(base,'SKILL.md'),'---\nname: growing\ndescription: Fixture\n---\n# Body\n');
let grew=false;const handles=new Map();
function grow(file){if(file===asset&&!grew){grew=true;fs.writeFileSync(asset,Buffer.alloc(16*1024*1024+128,65));}}
const guarded=proxyquire('../out/tools/agent-skills.js',{'node:fs':{...fs,
 statSync(file,...args){const result=fs.statSync(file,...args);grow(file);return result;},
 openSync(file,...args){const fd=fs.openSync(file,...args);handles.set(fd,file);return fd;},
 fstatSync(fd,...args){const result=fs.fstatSync(fd,...args);grow(handles.get(fd));return result;},
 closeSync(fd){handles.delete(fd);return fs.closeSync(fd);}
}});
try{
 fs.writeFileSync(asset,'small');
 assert.throws(()=>guarded.readWorkspaceSkillFile(root,'.agents/skills/growing','asset.txt'),/limit|changed/i,
  'A file growing after its size check must not bypass the read limit');
 assert.equal(grew,true,'The concurrent-file-change fixture must run');assert.equal(handles.size,0,'Read descriptors must close on error');
 console.log('PASS: skill reads reject files growing after validation and close their file descriptors');
}finally{fs.rmSync(root,{recursive:true,force:true});}
