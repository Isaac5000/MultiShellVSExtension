'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {getPreferredPaths,setPreferredPath,safePreferredPaths,MAX_PREFERRED_SKILLS,
 PROJECT_PREFERRED_SKILLS,GLOBAL_PREFERRED_SKILLS}=require('../out/tools/skill-preferences.js');
const {listWorkspaceSkills,readWorkspaceSkill}=require('../out/tools/agent-skills.js');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-preferred-skills-'));
const a=path.join(root,'project-A'),b=path.join(root,'project-B'),home=path.join(root,'home');
const memory=()=>{const values=new Map();return {
  get:(k,defaultValue)=>values.has(k)?values.get(k):defaultValue,
  update:async(k,v)=>{values.set(k,v);},
  values
};};
const projectA=memory(),projectB=memory(),global=memory();
function skill(dir,name,source='.agents/skills'){
 const folder=path.join(dir,...source.split('/'),name);
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'SKILL.md'),
  '---\nname: '+name+'\ndescription: An explicit task helper\n---\n\n# '+name+'\n');
}
(async()=>{
 try{
  for(let i=0;i<65;i++){skill(a,'step-'+String(i).padStart(3,'0'));}
  skill(a,'step-000','.github/skills');
  skill(b,'only-b');
  skill(home,'personal', '.agents/skills');
  const last='.agents/skills/step-064',duplicate='.github/skills/step-000';
  assert.deepEqual(getPreferredPaths(projectA,global,false),[]);
  const original=listWorkspaceSkills(a,{limit:5}).skills;
  assert.equal(original[0].skill_path,'.agents/skills/step-000');

  await setPreferredPath(projectA,last,'project',true);
  await setPreferredPath(projectA,duplicate,'project',true);
  await setPreferredPath(global,'@global/agents/personal','global',true);
  assert.deepEqual(getPreferredPaths(projectA,global,false),[last,duplicate]);
  const prefs=getPreferredPaths(projectA,global,true);
  assert.deepEqual(prefs,[last,duplicate,'@global/agents/personal']);
  assert.deepEqual(getPreferredPaths(projectB,global,false),[],
   'Another project may not inherit project preferences');

  const page=listWorkspaceSkills(a,{preferredPaths:prefs,limit:2});
  assert.deepEqual(page.skills.map(s=>s.skill_path),[last,duplicate]);
  assert.deepEqual(page.skills.map(s=>s.preferred),[true,true]);
  assert.equal(page.next_cursor,'2');
  const page2=listWorkspaceSkills(a,{preferredPaths:prefs,cursor:'2',limit:2});
  assert.ok(page2.skills.every(s=>s.preferred===false));
  assert.notDeepEqual(page2.skills[0]?.skill_path,last);
  const globalView=listWorkspaceSkills(a,{preferredPaths:prefs,includeGlobal:true,homeDir:home,limit:3});
  assert.equal(globalView.skills[2].skill_path,'@global/agents/personal');
  assert.equal(globalView.skills[2].preferred,true);
  const privateView=listWorkspaceSkills(a,{preferredPaths:prefs,includeGlobal:false,homeDir:home,limit:3});
  assert.ok(privateView.skills.every(s=>s.scope==='project'),
   'A preferred global skill never overrides the existing permission');
  assert.throws(()=>readWorkspaceSkill(a,'@global/agents/personal',{homeDir:home}),
   /Global Codex skills are disabled/);

  await assert.rejects(setPreferredPath(projectA,'@global/agents/personal','project',true),
   /scope/i);
  await assert.rejects(setPreferredPath(global,'../private','global',true));
  assert.deepEqual(safePreferredPaths([null,'../private',last,last,duplicate],'project'),
   [last,duplicate]);
  await setPreferredPath(projectA,last,'project',false);
  assert.equal(getPreferredPaths(projectA,global,false).includes(last),false);
  const cap=memory();
  for(let i=0;i<MAX_PREFERRED_SKILLS;i++){
   await setPreferredPath(cap,'.agents/skills/step-'+String(i).padStart(3,'0'),'project',true);
  }
  await assert.rejects(setPreferredPath(cap,last,'project',true),/24/);
  assert.equal(cap.get(PROJECT_PREFERRED_SKILLS,[]).length,24);
  assert.equal(global.get(GLOBAL_PREFERRED_SKILLS,[]).length,1);
  assert.deepEqual(projectB.get(PROJECT_PREFERRED_SKILLS,[]),[]);
  assert.equal(fs.existsSync(path.join(b,'.agents','skills','step-064')),false);
  console.log('PASS preferred skills: isolated per-project/global Mementos, permission gating, bounded storage, exact paths and cross-page metadata-first ordering');
 }finally{fs.rmSync(root,{force:true,recursive:true,maxRetries:8,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
