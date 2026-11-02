'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readWorkspaceSkillFile,readWorkspaceSkill}=require('../out/tools/agent-skills.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-containment-'));
const project=path.join(root,'project'),home=path.join(root,'home');
const options={homeDir:home,includeGlobal:true};
function make(relative,name){const dir=path.join(home,relative);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: '+name+'\ndescription: Test fixture\n---\n# Safe\n');return dir;}
try{
 fs.mkdirSync(project);const skill=make('.agents/skills/selected','selected');
 const privateDir=path.join(home,'private');fs.mkdirSync(privateDir);fs.writeFileSync(path.join(privateDir,'credentials.txt'),'fixture-only-secret');
 fs.symlinkSync(privateDir,path.join(skill,'references'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>readWorkspaceSkillFile(project,'@global/agents/selected','references/credentials.txt','utf-8',options),
  /symbolic|authorized root|skill directory/i,'Global approval must not grant reads of unrelated files in the home');
 const target=make('.codex/skills/linked','linked');fs.writeFileSync(path.join(target,'guide.md'),'Inside installed skill');
 fs.symlinkSync(target,path.join(home,'.agents/skills/linked'),process.platform==='win32'?'junction':'dir');
 assert.equal(readWorkspaceSkill(project,'@global/agents/linked',options).metadata.name,'linked');
 assert.equal(readWorkspaceSkillFile(project,'@global/agents/linked','guide.md','utf-8',options).content,'Inside installed skill');
 console.log('PASS: global install links remain supported; internal links cannot expose unrelated home files');
}finally{fs.rmSync(root,{recursive:true,force:true});}
