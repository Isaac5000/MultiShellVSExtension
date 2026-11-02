'use strict';
const assert=require('node:assert/strict');
const {registerSkillTools,skillUri}=require('../out/tools/agent-skills.js');
const {registerSkillsExtension}=require('../out/tools/skills-extension.js');
const active=[
 {shell_id:'main_a',window_id:'window_a',machine_id:'machine_a',initial_cwd:'/project'},
 {shell_id:'aux_a',window_id:'window_a',machine_id:'machine_a',initial_cwd:'/project'},
 {shell_id:'other_a',window_id:'window_a',machine_id:'machine_a',initial_cwd:'/other'},
 {shell_id:'main_b',window_id:'window_b',machine_id:'machine_b',initial_cwd:'/project'}
];
const info={name:'shared',description:'Fixture',skill_path:'.agents/skills/shared',source:'agents',scope:'project'};
const calls=[],handlers=new Map(),resources=new Map();
const api={list:async()=>active,skillList:async id=>{calls.push(id);return{skills:[info],warnings:[]};},
 skillManifest:async id=>({uri:skillUri(id,info),frontmatter:{name:info.name,description:info.description},resources:[]})};
registerSkillsExtension({server:{registerCapabilities(){},setRequestHandler(name,_schema,handler){handlers.set(name,handler);}}},api);
registerSkillTools({tool(){},registerResource(name,_uri,_details,handler){resources.set(name,handler);}},api);
(async()=>{
 const index=await resources.get('agent-skills-index')(new URL('skill://index.json'));
 assert.deepEqual(calls,['main_a','other_a','main_b'],'Only matching roots in the same window may share discovery');
 assert.equal(JSON.parse(index.contents[0].text).skills.length,3);
 calls.length=0;const page=await handlers.get('skills/list')({});
 assert.deepEqual(calls,['main_a','other_a','main_b']);assert.equal(page.skills.length,3);
 assert.ok(page.skills.some(skill=>skill.uri.includes('/main_b/')),'Another window with the same path must remain separate');
 console.log('PASS: duplicate terminal roots share discovery while distinct roots, windows and machines remain separate');
})().catch(error=>{console.error(error);process.exitCode=1;});
