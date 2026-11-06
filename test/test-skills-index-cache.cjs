'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {listWorkspaceSkills,readWorkspaceSkill,readWorkspaceSkillFile}=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-index-'));
const base=path.join(root,'.agents/skills');
const fileFor=name=>path.join(base,name,'SKILL.md');
const write=(name,desc)=>{const dir=path.join(base,name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(fileFor(name),'---\nname: '+name+'\ndescription: '+desc+'\n---\n# Example\n');};
let reads=0;
const original=fs.readSync;
(async()=>{
 try{
  for(let i=0;i<62;i++){write('skill-'+String(i).padStart(3,'0'),'Description '+i);}
  // Warm the catalog before verifying that later pages reuse its metadata.
  const initial=listWorkspaceSkills(root,{scope:'project',limit:100});
  assert.equal(initial.skills.length,62);
  reads=0;
  fs.readSync=function(...args){reads++;return original.apply(this,args);};
  const second=listWorkspaceSkills(root,{scope:'project',limit:20,cursor:'40'});
  assert.equal(second.skills.length,20);
  assert.equal(reads,0,'Metadata cache must not re-read unchanged SKILL.md on later pages');
  assert.equal(readWorkspaceSkill(root,'.agents/skills/skill-040').metadata.name,'skill-040');
  assert.equal(reads,0,'Exact skill loads may reuse unchanged metadata, after safe file validation');
  fs.readSync=original;
  write('skill-040','UPDATED description with different length');
  const changed=listWorkspaceSkills(root,{scope:'project',query:'UPDATED',limit:20});
  assert.deepEqual(changed.skills.map(x=>x.name),['skill-040'],'Modified frontmatter must invalidate immediately');
  write('skill-062','Newly added');
  assert.deepEqual(listWorkspaceSkills(root,{scope:'project',query:'Newly added'}).skills.map(x=>x.name),['skill-062']);
  fs.rmSync(path.join(base,'skill-041'),{recursive:true});
  assert.equal(listWorkspaceSkills(root,{scope:'project',query:'skill-041',nameOnly:true}).skills.length,0);
  fs.writeFileSync(path.join(base,'skill-040','example.txt'),'Reference');
  assert.equal(readWorkspaceSkillFile(root,'.agents/skills/skill-040','example.txt').content,'Reference');
  assert.throws(()=>readWorkspaceSkillFile(root,'.agents/skills/skill-040','../private.txt'),/path|traversal|relative/i);
  if(process.platform!=='win32'){
   fs.rmSync(fileFor('skill-040'));
   const outside=path.join(root,'outside.md');
   fs.writeFileSync(outside,'---\nname: skill-040\ndescription: secret\n---\n');
   fs.symlinkSync(outside,fileFor('skill-040'));
   assert.equal(listWorkspaceSkills(root,{scope:'project',query:'secret'}).skills.length,0);
   assert.throws(()=>readWorkspaceSkill(root,'.agents/skills/skill-040'),/symbolic/i);
  }
  console.log('PASS metadata cache: reuse reads, refresh edited/deleted/added skills immediately, scope and symlink protection');
 }finally{fs.readSync=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
