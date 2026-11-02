'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildSkillEntry}=require('../out/tools/skills-extension.js');
const {listWorkspaceSkills,readWorkspaceSkill,readWorkspaceSkillFile,skillUri,parseSkillUri,resolveSkillDirectory}=
  require('../out/tools/agent-skills.js');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-project-skills-'));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-home-skills-'));
function write(root,file,content){
 const destination=path.join(root,...file.split('/'));
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,content);
 return destination;
}
function skill(name,description){return '---\nname: '+name+'\ndescription: '+description+'\n---\n\n# '+name+'\n';}
try{
 write(project,'.agents/skills/shared/SKILL.md',skill('shared','Workspace instructions'));
 write(project,'.github/skills/only-project/SKILL.md',skill('only-project','Project only'));
 write(home,'.agents/skills/shared/SKILL.md',skill('shared','Global instructions'));
 write(home,'.agents/skills/deploy/SKILL.md',skill('deploy','Deploy globally'));
 write(home,'.codex/skills/graphify/SKILL.md',skill('graphify','Global graph support'));
 write(home,'.codex/skills/.system/skill-creator/SKILL.md',skill('skill-creator','System skill'));
 write(home,'.agents/skills/deploy/references/guidance.md','Shared reference');
 const disabled={homeDir:home};
 const defaultList=listWorkspaceSkills(project,disabled);
 assert.deepEqual(defaultList.skills.map(s=>s.name),['shared','only-project']);
 assert.throws(()=>readWorkspaceSkill(project,'@global/agents/deploy',disabled),/disabled/);
 assert.throws(()=>readWorkspaceSkillFile(project,'@global/agents/deploy','SKILL.md','utf-8',disabled),/disabled/);
 assert.throws(()=>resolveSkillDirectory(project,'@global/agents/deploy',disabled),/disabled/);
 const enabled={homeDir:home,includeGlobal:true};
 const all=listWorkspaceSkills(project,enabled);
 assert.equal(all.skills.length,6);
 assert.deepEqual(all.skills.filter(s=>s.scope==='global').map(s=>s.name),
  ['deploy','shared','graphify','skill-creator']);
 assert.deepEqual(listWorkspaceSkills(project,{...enabled,scope:'project'}).skills.map(s=>s.name),
  ['shared','only-project']);
 assert.deepEqual(listWorkspaceSkills(project,{...enabled,scope:'global'}).skills.map(s=>s.name),
  ['deploy','shared','graphify','skill-creator']);
 assert.equal(all.skills.filter(s=>s.name==='shared').length,2);
 assert.deepEqual(all.skills.filter(s=>s.name==='shared').map(s=>s.skill_path),
  ['.agents/skills/shared','@global/agents/shared']);
 const globalSkill=readWorkspaceSkill(project,'@global/agents/deploy',enabled);
 assert.equal(globalSkill.metadata.scope,'global');
 assert.equal(globalSkill.frontmatter.name,'deploy');
 const manifest=buildSkillEntry(project,'chosen_shell','@global/agents/deploy',enabled);
 assert.equal(manifest.frontmatter.name,'deploy');
 assert.equal(manifest.resources.length,2);
 assert.ok(manifest.resources.some(x=>x.uri.endsWith('/references/guidance.md')));
 assert.throws(()=>buildSkillEntry(project,'chosen_shell','@global/agents/deploy',disabled),
  /Global Codex skills are disabled/);
 assert.equal(readWorkspaceSkillFile(project,'@global/agents/deploy',
  'references/guidance.md','utf-8',enabled).content,'Shared reference');
 const uri=skillUri('shell',globalSkill.metadata);
 assert.equal(parseSkillUri(uri).selected,'@global/agents/deploy');
 assert.match(uri,/global-agents\/deploy\/SKILL\.md$/);
 for(const unsafe of ['../secret','/etc/passwd','C:/anything','references/../../SKILL.md']){
  assert.throws(()=>readWorkspaceSkillFile(project,'@global/agents/deploy',unsafe,'utf-8',enabled),
   /relative|traversal|segment/i);
 }
 // Symlinks inside the home can be used if and only if every target remains
 // contained within the home directory; external links must not be exposed.
 const inside=path.join(home,'.agents','skills','link-inside');
 const target=write(home,'.codex/skills/link-inside/SKILL.md',skill('link-inside','Internal symlink'));
 try {
  fs.symlinkSync(path.dirname(target),inside,process.platform==='win32'?'junction':'dir');
  const present=listWorkspaceSkills(project,enabled);
  assert.ok(present.skills.some(s=>s.name==='link-inside'&&s.scope==='global'));
 } catch(error){
  if(error.code!=='EPERM'&&error.code!=='ENOSYS'){throw error;}
 }
 const outer=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-foreign-skills-'));
 try{
  const external=path.join(home,'.agents','skills','escape');
  const outsider=write(outer,'escape/SKILL.md',skill('escape','Not permitted'));
  try{
   fs.symlinkSync(path.dirname(outsider),external,process.platform==='win32'?'junction':'dir');
   assert.throws(()=>readWorkspaceSkill(project,'@global/agents/escape',enabled),/leaves its authorized root/);
   assert.ok(listWorkspaceSkills(project,enabled).warnings.some(x=>x.includes('escape')));
  }catch(error){if(error.code!=='EPERM'&&error.code!=='ENOSYS'){throw error;}}
 }finally{fs.rmSync(outer,{force:true,recursive:true});}
 console.log('PASS: three global Codex directories, opt-in, exact names and duplicate paths, scope filters, files, contained symlinks and traversal rejection');
} finally {
 fs.rmSync(project,{recursive:true,force:true});
 fs.rmSync(home,{recursive:true,force:true});
}