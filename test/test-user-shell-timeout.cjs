'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();

const hooks={closed:new Set(),integration:new Set(),ended:new Set()};
const on=key=>callback=>{hooks[key].add(callback);return{dispose(){hooks[key].delete(callback);}}};
const emit=(key,data)=>{for(const cb of [...hooks[key]])cb(data);};
const terminals=new Map();
const commands=[];
const delays=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const vscode={
 workspace:{workspaceFolders:[]},
 window:{
  onDidCloseTerminal:on('closed'),
  onDidChangeTerminalShellIntegration:on('integration'),
  onDidEndTerminalShellExecution:on('ended'),
  createTerminal(options){
   const terminal={
    name:options.name,disposed:false,dispose(){
     if(!this.disposed){this.disposed=true;emit('closed',this);}
    },shellIntegration:{
     executeCommand(command){
      commands.push({name:options.name,command});
      const execution={async *read(){
       await wait(delays.get(command)??15);
       if(!terminal.disposed){emit('ended',{terminal,execution,exitCode:0});}
       yield 'OUTPUT_'+command;
      }};
      return execution;
     }
    }
   };
   terminals.set(options.name,terminal);
   return terminal;
  }
 }
};
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const expectError=(promise,re)=>assert.rejects(promise,re);

async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'user-shell-timeout-'));
 const dirs=['user','bot','automatic','userQueued'].map(x=>path.join(root,x));
 dirs.forEach(x=>fs.mkdirSync(x));
 const m=new ShellManager();
 try{
  assert.equal(m.create('manual',dirs[0],false,'user').origin,'user');
  assert.equal(m.create('assistant',dirs[1]).origin,'mcp');
  assert.equal(m.create('primary',dirs[2],false,'automatic').origin,'automatic');
  assert.equal(m.create('manual_queue',dirs[3],false,'user').origin,'user');
  delays.set('user_stuck',1400);
  const userCommand=m.execute('manual','user_stuck',1000);
  await expectError(userCommand,/timed out.*preserved/i);
  const state=m.list().find(x=>x.shell_id==='manual');
  assert.equal(state.origin,'user');
  assert.equal(state.busy,true,'user shell should remain busy after response timeout');
  assert.equal(state.timed_out_running,true,'user shell must advertise pending previous execution');
  assert.equal(terminals.get('MCP [manual]').disposed,false,'user terminal must not be disposed on timeout');
  const before=commands.length;
  await expectError(m.execute('manual','must_not_overlap',1000),/still running after its timeout/i);
  assert.equal(commands.length,before,'new commands must not be sent to timed-out user terminal');
  await wait(460);
  const after=m.list().find(x=>x.shell_id==='manual');
  assert.equal(after.busy,false,'manual shell must become available when the old command ends');
  assert.equal(after.timed_out_running,false);
  const resumed=await m.execute('manual','resumed',1100);
  assert.match(resumed.output,/OUTPUT_resumed/);
  assert.equal(resumed.exit_code,0);
  assert.equal(terminals.get('MCP [manual]').disposed,false,'user shell process must survive after recovery');

  // Requests that were queued before timeout must not overlap either.
  delays.set('queue_stuck',1400);
  const first=m.execute('manual_queue','queue_stuck',1000);
  const second=m.execute('manual_queue','queued_after',2000);
  await expectError(first,/preserved/i);
  await expectError(second,/Queued MCP command cancelled/i);
  assert.equal(m.list().find(s=>s.shell_id==='manual_queue').queued,0);
  assert.equal(m.list().find(s=>s.shell_id==='manual_queue').busy,true);
  assert.deepEqual(commands.filter(x=>x.name==='MCP [manual_queue]').map(x=>x.command),['queue_stuck']);
  await wait(460);
  assert.equal(m.list().find(s=>s.shell_id==='manual_queue').busy,false);
  const queueResult=await m.execute('manual_queue','explicit_restart',1100);
  assert.match(queueResult.output,/OUTPUT_explicit_restart/);
  assert.deepEqual(commands.filter(x=>x.name==='MCP [manual_queue]').map(x=>x.command),['queue_stuck','explicit_restart']);

  for(const [id,origin] of [['assistant','mcp'],['primary','automatic']]){
   const task='timeout_'+origin;
   delays.set(task,1350);
   await expectError(m.execute(id,task,1000),/timed out.*closed/i);
   assert.equal(terminals.get('MCP ['+id+']').disposed,true,origin+' terminal must be disposed');
   assert.equal(m.list().some(s=>s.shell_id===id),false,origin+' terminal must be removed');
  }
  // Closing a user terminal intentionally still closes it, even when it was previously protected.
  m.close('manual');
  assert.equal(terminals.get('MCP [manual]').disposed,true);
  console.log('PASS: user panel shell survives MCP timeout, blocks overlap, resumes when command finishes; queued calls cancelled on timeout; MCP and automatic shells close on timeout');
 }finally{
  m.dispose();
  fs.rmSync(root,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});