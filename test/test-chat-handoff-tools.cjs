'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerChatHandoffTools}=require('../out/tools/chat-handoff-tools.js');
const {ChatHandoffStore}=require('../out/chat-handoff-store.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ms-chat-handoff-mcp-'));
const project=path.join(root,'project');fs.mkdirSync(project);
const shell='main-verified-project';
const registered=new Map();
const registry={tool(name,_description,_schema,handler){
 registered.set(name,handler);
}};
const shells={async list(){return [
 {shell_id:shell,initial_cwd:project,machine_id:'machine-fingerprint',
  origin:'automatic',busy:false,recovery_required:false,timed_out_running:false,queued:0},
 {shell_id:'other',initial_cwd:path.join(root,'different'),machine_id:'machine-fingerprint',
  origin:'automatic',busy:false,recovery_required:false,timed_out_running:false,queued:0}
];}};
function parse(result){assert.ok(result.content?.[0]?.text);return {
 isError:Boolean(result.isError),...JSON.parse(result.content[0].text)
};}
(async()=>{
 try{
  const store=new ChatHandoffStore(path.join(root,'state'));
  registerChatHandoffTools(registry,shells,true,store);
  assert.deepEqual([...registered.keys()].sort(),[
   'chat_handoff_list_code','chat_handoff_load_code','chat_handoff_save_code']);
  const save=registered.get('chat_handoff_save_code');
  const load=registered.get('chat_handoff_load_code');
  const list=registered.get('chat_handoff_list_code');
  const input={
   shell_id:shell,objective:'Continue original ChatGPT project',
   verification:'Check actual project tests',
   summary:'Only planning performed',completed:['Inspected source'],
   remaining:['Run checks'],artifacts:[],risks:['Do not replay uncertain commands'],
   next_action:'Inspect status before edits',status:'working'
  };
  const newEntry=parse(await save(input));
  assert.equal(newEntry.saved,true);
  assert.equal(newEntry.revision,1);
  assert.match(newEntry.nextChatPrompt,/Abre manualmente otro chat/);
  assert.match(newEntry.nextChatPrompt,/chat_handoff_load_code/);
  assert.match(newEntry.nextChatPrompt,/list_shells_code/);
  assert.doesNotMatch(newEntry.nextChatPrompt,/shell_id=main-verified-project/);
  assert.match(newEntry.nextChatPrompt,/No uses APIs de pago/);
  const latest=parse(await load({shell_id:shell}));
  assert.equal(latest.found,true);
  assert.equal(latest.checkpoint.objective,input.objective);
  const update=parse(await save({...input,handoff_id:newEntry.handoffId,
   expected_revision:newEntry.revision,summary:'Read tests'}));
  assert.equal(update.revision,2);
  const stale=parse(await save({...input,handoff_id:newEntry.handoffId,
   expected_revision:1,summary:'Outdated'}));
  assert.equal(stale.isError,true);
  assert.match(stale.error,/Stale/);
  const wrong=parse(await load({shell_id:'other',handoff_id:newEntry.handoffId}));
  assert.equal(wrong.isError,true);
  const forbidden=parse(await load({shell_id:'unknown'}));
  assert.equal(forbidden.isError,true);
  const tasks=parse(await list({shell_id:shell}));
  assert.equal(tasks.tasks.length,1);
  assert.equal(tasks.tasks[0].handoffId,newEntry.handoffId);
  assert.equal(parse(await load({shell_id:shell})).found,true);
  const second=parse(await save({...input,
   objective:'Unrelated task',summary:'Different objective'}));
  assert.equal(second.saved,true);
  const ambiguous=parse(await load({shell_id:shell}));
  assert.equal(ambiguous.found,false);
  assert.equal(ambiguous.ambiguous,true);
  assert.equal(ambiguous.candidates.length,2);
  const explicit=parse(await load({shell_id:shell,handoff_id:newEntry.handoffId}));
  assert.equal(explicit.found,true);
  assert.equal(explicit.checkpoint.summary,'Read tests');
  const readOnly=new Map();
  registerChatHandoffTools({tool(name,_desc,_schema,fn){readOnly.set(name,fn);}},
   shells,false,store);
  assert.deepEqual([...readOnly.keys()].sort(),[
   'chat_handoff_list_code','chat_handoff_load_code']);
  assert.equal(store.list({shellId:shell,workspace:project,
   machineId:'machine-fingerprint'}).length,2);
  console.log('PASS chat MCP tools: exact shell, task discovery, ambiguous selection refusal, revision conflict, read-only gate and no remote deletion');
 }finally{
  fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});