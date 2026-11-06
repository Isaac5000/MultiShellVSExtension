'use strict';
const assert=require('node:assert/strict');
const {registerSkillTools,skillUri}=require('../out/tools/agent-skills.js');
const resources=new Map(),encodings=[];
const info={name:'alpha',description:'Example',skill_path:'.agents/skills/alpha',source:'agents',scope:'project'};
const api={
 root:()=>'/test',
 skillFile:async (_id,selected,file,encoding)=>{
  encodings.push({selected,file,encoding});
  return{content:encoding==='utf-8'?'Español: ñ':Buffer.from([0,128,255]).toString('base64'),encoding};
 }
};
registerSkillTools({tool(){},registerResource:(name,_resource,_options,fn)=>resources.set(name,fn)},api);
(async()=>{
 const handler=resources.get('agent-skill-file');
 const textUri=skillUri('one',info,'references/guide.md');
 const text=await handler(new URL(textUri),{skillFile:'unused'});
 assert.equal(text.contents[0].text,'Español: ñ');
 assert.equal(encodings[0].encoding,'utf-8',
  'MCP references should avoid an unnecessary base64 encode/transfer/decode');
 const binaryUri=skillUri('one',info,'assets/icon.png');
 const binary=await handler(new URL(binaryUri),{skillFile:'unused'});
 assert.equal(binary.contents[0].blob,Buffer.from([0,128,255]).toString('base64'));
 assert.equal(encodings[1].encoding,'base64','Binary resources must stay byte exact');
 console.log('PASS text skill resources avoid base64, binary keeps lossless base64');
})().catch(e=>{console.error(e);process.exitCode=1;});
