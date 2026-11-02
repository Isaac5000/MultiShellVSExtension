'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
 'vscode':{},
 './multi-window':{REGISTER_PATH:'/_multishell/register',
   CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
 './utils/logger':{logger:{info(){},warn(){},error(e){console.error(e);}}}
});
function skill(name){return '---\nname: '+name+'\ndescription: Workspace testing\n---\n# Sample\n';}
function parseResponse(text){
 const payload=text.includes('data:')?text.split(/\r?\n/).find(x=>x.startsWith('data:')).slice(5):text;
 return JSON.parse(payload);
}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-name-tools-'));
 const folder=path.join(root,'.agents','skills','local-a');
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'SKILL.md'),skill('local-a'));
 const shells={
  root(id){if(id!=='selected')throw Error('Unknown shell: '+id);return root;},
  list(){return [{shell_id:'selected',initial_cwd:root,origin:'automatic',
    busy:false,queued:0,recovery_required:false,timed_out_running:false}];},
  windows(){return [];}
 };
 const tests=[{file:true,edit:false,shell:true,globalSkills:false},
  {file:true,edit:false,shell:true,globalSkills:true},
  {file:false,edit:true,shell:true,globalSkills:true}];
 try{
  for(const config of tests){
   const server=new MCPServer(0,'127.0.0.1',shells,config);
   try{
    await server.start();
    let id=0;
    const rpc=async (name,args)=>{
     const response=await fetch('http://127.0.0.1:'+server.httpServer.address().port+'/mcp',{
      method:'POST',headers:{'content-type':'application/json',
        accept:'application/json, text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',
        params:{name,arguments:args}})
     });
     assert.equal(response.status,200);
     const data=parseResponse(await response.text());
     // SDK v2 rejects calls to disabled/unregistered tools as JSON-RPC errors;
     // v1 returned an isError tool result. Both outcomes deny access.
     return data.result??{isError:Boolean(data.error),protocolError:data.error};
    };
    const names=await rpc('list_skill_names_code',{shell_id:'selected',scope:'all'});
    if(config.file){
     assert.equal(names.isError,false);
     const value=JSON.parse(names.content[0].text);
     assert.equal(value.global_enabled,config.globalSkills);
     assert.ok(value.names.includes('local-a'));
     assert.ok(value.entries.some(x=>x.scope==='project'&&x.skill_path==='.agents/skills/local-a'));
     assert.deepEqual([...value.names].sort(),value.names);
     assert.ok((await rpc('list_skill_names_code',{
      shell_id:'missing',scope:'all'})).isError);
     const gated=await rpc('read_skill_code',{
      shell_id:'selected',skill_path:'@global/agents/not-real'});
     assert.ok(gated.isError);
     if(!config.globalSkills){
      assert.match(gated.content[0].text,/Global Codex skills are disabled/);
      const onlyGlobal=JSON.parse((await rpc('list_skill_names_code',
       {shell_id:'selected',scope:'global'})).content[0].text);
      assert.deepEqual(onlyGlobal.names,[]);
     }
     const filtered=JSON.parse((await rpc('list_skill_names_code',
      {shell_id:'selected',scope:'project',query:'local'})).content[0].text);
     assert.deepEqual(filtered.names,['local-a']);

     const command=await rpc('execute_shell_command_code',{
      command:'skills selected project',cwd:'@mcp'});
     assert.deepEqual(JSON.parse(command.content[0].text).names,['local-a']);
     const withoutId=await rpc('execute_shell_command_code',{
      command:'skills',cwd:'@mcp'});
     assert.equal(withoutId.isError,true);
    }else{
     assert.equal(names.isError,true,'No skill data when file reads are disabled');
     assert.equal((await rpc('execute_shell_command_code',{
      command:'skills selected',cwd:'@mcp'})).isError,true);
    }
   }finally{await server.stop();}
  }
  console.log('PASS: quick skill names through MCP and legacy @mcp, no implicit shell, global opt-in, file-permission guard and filters');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});