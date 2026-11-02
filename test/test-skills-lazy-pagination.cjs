'use strict';
const assert=require('node:assert/strict');
const {registerSkillsExtension}=require('../out/tools/skills-extension.js');
const {skillUri}=require('../out/tools/agent-skills.js');
const skills=Array.from({length:45},(_,i)=>({name:'skill-'+String(i).padStart(3,'0'),
 description:'Fixture',skill_path:'.agents/skills/skill-'+String(i).padStart(3,'0'),source:'agents',scope:'project'}));
const handlers=new Map();let manifests=0,unavailable=false;
const shells={list:async()=>[{shell_id:'fixture'}],skillList:async()=>({skills,warnings:[]}),
 skillManifest:async(_id,selected)=>{
  manifests++;if(unavailable&&selected===skills[0].skill_path)throw Error('Unavailable skill');
  const info=skills.find(skill=>skill.skill_path===selected),uri=skillUri('fixture',info);
  return{uri,frontmatter:{name:info.name,description:info.description},resources:[{uri,digest:'sha256:'+'0'.repeat(64),size:0}]};
 }};
registerSkillsExtension({server:{registerCapabilities(){},setRequestHandler(name,_schema,handler){handlers.set(name,handler);}}},shells);
(async()=>{
 const list=handlers.get('skills/list');const first=await list({});
 assert.equal(first.skills.length,20);assert.equal(manifests,20,'Listing one page must not hash every skill');
 manifests=0;const second=await list({cursor:first.nextCursor});assert.equal(second.skills.length,20);assert.equal(manifests,20);
 manifests=0;const third=await list({cursor:second.nextCursor});assert.equal(third.skills.length,5);assert.equal(manifests,5);
 assert.equal(third.nextCursor,undefined);assert.equal(new Set([...first.skills,...second.skills,...third.skills].map(x=>x.uri)).size,45);
 manifests=0;await assert.rejects(list({cursor:'-1'}),/cursor/i);assert.equal(manifests,0,'Invalid cursors must not trigger file hashing');
 manifests=0;unavailable=true;const partial=await list({});assert.equal(partial.skills.length,19);assert.equal(manifests,20);
 assert.equal(partial.nextCursor,first.nextCursor,'Skipped skills must not duplicate or omit following pages');
 console.log('PASS: manifests are built only for the requested page; invalid cursors do no hashing; unavailable skills keep pagination bounded');
})().catch(error=>{console.error(error);process.exitCode=1;});
