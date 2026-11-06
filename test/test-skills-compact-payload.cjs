'use strict';
const assert=require('node:assert/strict');
const {registerSkillTools}=require('../out/tools/agent-skills.js');
const tools=new Map();
const registry={tool:(name,_desc,_schema,fn)=>tools.set(name,fn),registerResource(){}};
const skill={name:'alpha',description:'Documented workflow',skill_path:'.agents/skills/alpha',source:'agents',scope:'project'};
const api={root:()=>'/test',skillList:async()=>({skills:[skill],warnings:[]})};
registerSkillTools(registry,api);
(async()=>{
 const names=await tools.get('list_skill_names_code')({shell_id:'fixture',scope:'project'});
 const data=names.content[0].text;
 assert.deepEqual(JSON.parse(data).names,['alpha']);
 assert.ok(!/\r?\n/.test(data),'Skills metadata replies should use compact JSON to reduce MCP payload size');
 const found=await tools.get('find_skills_code')({shell_id:'fixture',scope:'project'});
 assert.deepEqual(JSON.parse(found.content[0].text).skills[0].name,'alpha');
 assert.ok(!/\r?\n/.test(found.content[0].text),'Search results should avoid prettified JSON');
 console.log('PASS skills tools use compact protocol JSON without changing parsed metadata');
})().catch(e=>{console.error(e);process.exitCode=1;});
