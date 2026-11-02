'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const skills=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-snapshot-'));
const dir=path.join(root,'.agents/skills/mutable'),file=path.join(dir,'SKILL.md');
fs.mkdirSync(dir,{recursive:true});
const body=description=>'---\nname: mutable\ndescription: '+description+'\n---\n# Instructions\n';
fs.writeFileSync(file,body('Original'));
const {buildSkillEntry}=proxyquire('../out/tools/skills-extension.js',{'./agent-skills':{...skills,
 readWorkspaceSkill(...args){const original=skills.readWorkspaceSkill(...args);fs.writeFileSync(file,body('Replaced'));return original;}
}});
try{
 assert.throws(()=>buildSkillEntry(root,'fixture','.agents/skills/mutable'),/changed|snapshot/i,
  'Frontmatter and the SKILL.md digest must refer to the same content');
 console.log('PASS: changed SKILL.md cannot publish frontmatter from an earlier manifest snapshot');
}finally{fs.rmSync(root,{recursive:true,force:true});}
