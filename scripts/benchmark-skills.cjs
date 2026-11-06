'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {listWorkspaceSkills}=require('../out/tools/agent-skills.js');
const {buildSkillEntry,registerSkillsExtension}=require('../out/tools/skills-extension.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-skill-speed-'));
const base=path.join(root,'.agents','skills');
const count=180;
const median=arr=>[...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
const times=async(fn,n=3)=>{const values=[];for(let i=0;i<n;i++){const t=performance.now();await fn();values.push(Number((performance.now()-t).toFixed(1)));}return {median_ms:median(values),samples_ms:values};};
(async()=>{try{
 for(let i=0;i<count;i++){
  const name='skill-'+String(i).padStart(3,'0');
  const dir=path.join(base,name);
  fs.mkdirSync(path.join(dir,'references'),{recursive:true});
  fs.writeFileSync(path.join(dir,'SKILL.md'),`---\nname: ${name}\ndescription: A workflow for project compilation and validation with staged examples\n---\n# Instructions\n${'Documentation examples here. '.repeat(45)}\n`);
  fs.writeFileSync(path.join(dir,'references','detail.md'),'Testing guidance. '.repeat(500));
 }
 const opts={scope:'project',limit:20};
 const first=await times(()=>listWorkspaceSkills(root,{...opts}),4);
 const names=await times(()=>listWorkspaceSkills(root,{...opts,nameOnly:true}),4);
 const late=await times(()=>listWorkspaceSkills(root,{...opts,cursor:'160'}),4);
 const one=await times(()=>buildSkillEntry(root,'fixture','.agents/skills/skill-000'),4);
 const handlers=new Map();
 const shells={list:async()=>[{shell_id:'fixture',initial_cwd:root}],root:()=>root,
  skillList:async(_id,_scope,_global,opt)=>listWorkspaceSkills(root,opt),
  skillManifest:async(id,selected)=>buildSkillEntry(root,id,selected)};
 registerSkillsExtension({server:{registerCapabilities(){},setRequestHandler(n,_s,handler){handlers.set(n,handler);}}},shells);
 const pages=await times(async()=>{
  for(let i=0;i<count;i+=20){
   const p=await handlers.get('skills/list')({cursor:i?String(i):undefined});
   if(p.skills.length!==20)throw Error('Unexpected page size '+p.skills.length);
  }
 },3);
 console.log(JSON.stringify({skills:count,files:360,first,names,late,manifest:one,native_pages:pages},null,2));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});