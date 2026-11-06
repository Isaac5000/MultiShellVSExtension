'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {listWorkspaceSkills,readWorkspaceSkill}=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-catalog-path-index-'));
const base=path.join(root,'.agents/skills');
const original=fs.realpathSync;let realpaths=0;
try{
 for(let i=0;i<90;i++){
  const name='skill-'+String(i).padStart(3,'0');
  const dir=path.join(base,name);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: '+name+'\ndescription: Workflow '+i+'\n---\n# Contents\n');
 }
 const all=listWorkspaceSkills(root,{scope:'project',limit:100});
 assert.equal(all.skills.length,90);
 fs.realpathSync=function(...args){realpaths++;return original.apply(this,args);};
 const late=listWorkspaceSkills(root,{scope:'project',cursor:'70',limit:20});
 assert.equal(late.skills.length,20);
 assert.ok(realpaths<35,'Cached catalog must avoid per-skill realpath traversals, saw '+realpaths);
 fs.realpathSync=original;
 fs.rmSync(path.join(base,'skill-071'),{recursive:true});
 assert.deepEqual(listWorkspaceSkills(root,{scope:'project',query:'skill-071'}).skills,[]);
 fs.mkdirSync(path.join(base,'skill-071'));fs.writeFileSync(path.join(base,'skill-071','SKILL.md'),
  '---\nname: skill-071\ndescription: Reinstalled, different content\n---\n');
 assert.match(readWorkspaceSkill(root,'.agents/skills/skill-071').metadata.description,/Reinstalled/);
 const updated=listWorkspaceSkills(root,{scope:'project',query:'Reinstalled'});
 assert.deepEqual(updated.skills.map(x=>x.name),['skill-071']);
 console.log('PASS catalog path index bypasses repeated realpaths while detecting deletion, recreation and content updates');
}finally{fs.realpathSync=original;fs.rmSync(root,{recursive:true,force:true});}
