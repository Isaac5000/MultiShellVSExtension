'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {listWorkspaceSkills,readWorkspaceSkill,readWorkspaceSkillFile}=
  require('../out/tools/agent-skills.js');
function write(root,relative,data){
 const file=path.join(root,relative);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,data);
 return file;
}
function skill(name,description){return '---\nname: '+name+'\ndescription: >-\n  '+description+'\n---\n\n# '+name+'\n\nOpen [guide](references/guide.md).\n';}
const a=fs.mkdtempSync(path.join(os.tmpdir(),'multi-skills-a-'));
const b=fs.mkdtempSync(path.join(os.tmpdir(),'multi-skills-b-'));
try{
 const hello=write(a,'.agents/skills/hello-world/SKILL.md',
   skill('hello-world','Run a careful project-specific workflow.'));
 write(a,'.agents/skills/hello-world/references/guide.md','Reference guide ✓');
 write(a,'.agents/skills/hello-world/scripts/do-not-run.js','globalThis.pwned=true');
 const binary=Buffer.from([0,255,1,2,3]);
 write(a,'.agents/skills/hello-world/assets/demo.png',binary);
 write(a,'.github/skills/review-code/SKILL.md',skill('review-code','Review code changes'));
 write(a,'.claude/skills/repair-build/SKILL.md',skill('repair-build','Repair builds'));
 write(b,'.agents/skills/other/SKILL.md',skill('other','Other isolated workspace'));
 write(a,'.agents/skills/bad-skill/SKILL.md',skill('wrong-name','Mismatch'));
 write(a,'.agents/skills/invalid-frontmatter/SKILL.md',
   '---\nname: invalid-frontmatter\ndescription: one\ndescription: two\n---\nBody\n');
 assert.equal(listWorkspaceSkills(a).skills.length,3);
 const found=listWorkspaceSkills(a);
 assert.ok(found.warnings.length>=2);
 assert.deepEqual(found.skills.map(s=>s.name),['hello-world','review-code','repair-build']);
 assert.equal(listWorkspaceSkills(b).skills.length,1);
 const loaded=readWorkspaceSkill(a,'.agents/skills/hello-world');
 assert.equal(loaded.metadata.name,'hello-world');
 assert.match(loaded.metadata.description,/careful/);
 assert.match(loaded.content,/guide/);
 assert.equal(readWorkspaceSkillFile(a,'.agents/skills/hello-world',
   'references/guide.md').content,'Reference guide ✓');
 assert.equal(readWorkspaceSkillFile(a,'.agents/skills/hello-world',
   'assets/demo.png','base64').content,binary.toString('base64'));
 assert.equal(globalThis.pwned,undefined);
 assert.match(readWorkspaceSkillFile(a,'.agents/skills/hello-world',
   'scripts/do-not-run.js').content,/globalThis/);
 for(const target of ['../../other','../hello-world','/etc/passwd','C:/secret',
   'references/../../SKILL.md','references//guide.md']){
  assert.throws(()=>readWorkspaceSkillFile(a,'.agents/skills/hello-world',target),
   /path|relative|traversal|segment/i,target);
 }
 for(const target of ['.agents/skills/../other','.agents/skills/other/file',
  '.agents/skills/unknown','.agents/skills/bad-skill']){
  assert.throws(()=>readWorkspaceSkill(a,target),undefined,target);
 }
 assert.throws(()=>readWorkspaceSkillFile(a,'.agents/skills/hello-world',
   'references/missing.md'),/ENOENT/);
 if(process.platform!=='win32'){
  const absolute=path.join(a,'.agents/skills/hello-world/references/escape.md');
  fs.symlinkSync(path.join(b,'.agents/skills/other/SKILL.md'),absolute);
  assert.throws(()=>readWorkspaceSkillFile(a,'.agents/skills/hello-world',
    'references/escape.md'),/Symbolic links/);
 }
 write(a,'.agents/skills/oversized/SKILL.md',Buffer.alloc(150000,65));
 const last=listWorkspaceSkills(a);
 assert.ok(last.warnings.some(w=>w.includes('oversized')));
 assert.equal(fs.existsSync(hello),true);
 const repository=path.resolve(__dirname,'..');
 const own=readWorkspaceSkill(repository,'.agents/skills/multishell-mcp');
 assert.equal(own.metadata.name,'multishell-mcp');
 assert.match(own.content,/list_skills_code/);
 assert.match(readWorkspaceSkillFile(repository,
   '.agents/skills/multishell-mcp','references/tool-guide.md').content,/skill:\/\/index.json/);
 console.log('PASS: Agent Skills YAML frontmatter, three discovery paths, progressive reads, sandbox, symlink guard, duplicates and size caps');
}finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});}