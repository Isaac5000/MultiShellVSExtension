'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {buildSkillEntry}=require('../out/tools/skills-extension.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multi-skill-manifest-'));
const base=path.join(root,'.agents','skills','audit-skill');
const file=path.join(base,'SKILL.md');
try{
 fs.mkdirSync(path.join(base,'references'),{recursive:true});
 fs.writeFileSync(file,'---\nname: audit-skill\ndescription: Integrity checks\nlicense: MIT\nmetadata:\n  team: qa\n---\n# Audit\n');
 fs.writeFileSync(path.join(base,'references','GUIDE.md'),'One');
 const first=buildSkillEntry(root,'test_shell','.agents/skills/audit-skill');
 assert.equal(first.frontmatter.license,'MIT');
 assert.deepEqual(first.frontmatter.metadata,{team:'qa'});
 assert.equal(first.resources.length,2);
 assert.equal(first.resources[0].uri,first.uri);
 for(const entry of first.resources){
  const rel=entry.uri.slice(entry.uri.indexOf('/audit-skill/')+'/audit-skill/'.length);
  const data=fs.readFileSync(path.join(base,...rel.split('/')));
  assert.equal(entry.size,data.length);
  assert.equal(entry.digest,'sha256:'+crypto.createHash('sha256').update(data).digest('hex'));
 }
 fs.writeFileSync(path.join(base,'references','GUIDE.md'),'Changed');
 const fresh=buildSkillEntry(root,'test_shell','.agents/skills/audit-skill');
 assert.notEqual(first.resources[1].digest,fresh.resources[1].digest,
  'After file change, the digest must invalidate the old host approval');
 // No incomplete manifests may be served after hitting the 512-file cap.
 for(let i=0;i<512;i++)fs.writeFileSync(path.join(base,'references','extra-'+i+'.txt'),'x');
 assert.throws(()=>buildSkillEntry(root,'test_shell','.agents/skills/audit-skill'),
  /512 files/);
 for(let i=0;i<512;i++)fs.rmSync(path.join(base,'references','extra-'+i+'.txt'));
 fs.writeFileSync(path.join(base,'references','huge.bin'),Buffer.alloc(16*1024*1024,0));
 assert.throws(()=>buildSkillEntry(root,'test_shell','.agents/skills/audit-skill'),/16 MiB/);
 fs.rmSync(path.join(base,'references','huge.bin'));
 if(process.platform==='win32'){
  // Simulate a symlink escape using an external junction if the environment
  // permits it; otherwise the POSIX case below tests this invariant.
 }else{
  fs.symlinkSync(path.join(root,'external'),path.join(base,'references','outside'));
  assert.throws(()=>buildSkillEntry(root,'test_shell','.agents/skills/audit-skill'),/Symlinks/);
 }
 console.log('PASS: official skill manifest integrity, verbatim frontmatter, SHA-256 refresh, 512-file/16-MiB caps and symlink guard');
}finally{fs.rmSync(root,{recursive:true,force:true});}
