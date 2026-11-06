'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {listWorkspaceSkills,readWorkspaceSkill}=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-cache-isolation-'));
try{
 const dir=path.join(root,'.agents/skills/test-skill');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: test-skill\ndescription: Clean description\nmetadata:\n  team: release\n---\n# Body\n');
 const a=listWorkspaceSkills(root,{scope:'project'}).skills[0];
 a.name='injected';a.description='injected';
 const b=listWorkspaceSkills(root,{scope:'project'}).skills[0];
 assert.equal(b.name,'test-skill');
 assert.equal(b.description,'Clean description');
 const first=readWorkspaceSkill(root,'.agents/skills/test-skill');
 first.frontmatter.description='injected';
 first.frontmatter.metadata.team='injected';
 const second=readWorkspaceSkill(root,'.agents/skills/test-skill');
 assert.equal(second.frontmatter.description,'Clean description');
 assert.equal(second.frontmatter.metadata.team,'release');
 assert.equal(second.metadata.description,'Clean description');
 console.log('PASS cached skill metadata cannot be mutated through previously returned catalog or frontmatter');
}finally{fs.rmSync(root,{recursive:true,force:true});}
