'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await wait(5);}throw Error('Condition timed out');}
function harness(inspect=async()=> 'unknown'){
 const hooks={closed:new Set(),started:new Set(),ended:new Set(),integration:new Set()};
 const on=kind=>fn=>{hooks[kind].add(fn);return{dispose(){hooks[kind].delete(fn);}};};
 const emit=(kind,event)=>{for(const fn of [...hooks[kind]])fn(event);};
 const terminals=[],issued=[],runs=new Map();
 const vscode={workspace:{workspaceFolders:[]},window:{
  terminals,onDidCloseTerminal:on('closed'),onDidStartTerminalShellExecution:on('started'),
  onDidEndTerminalShellExecution:on('ended'),onDidChangeTerminalShellIntegration:on('integration'),
  createTerminal(options){const terminal={name:options.name,creationOptions:options,
   processId:Promise.resolve(12345),state:{isInteractedWith:false},show(){},
   dispose(){emit('closed',terminal);}};terminals.push(terminal);return terminal;}
 }};
 function integrate(terminal){
  terminal.shellIntegration={executeCommand(command){
   issued.push(command);
   let push,ended=false;
   const pending=[];
   const execution={read(){return {[Symbol.asyncIterator](){return this;},
    next(){if(pending.length)return Promise.resolve({done:false,value:pending.shift()});
     if(ended)return Promise.resolve({done:true});return new Promise(resolve=>{push=resolve;});},
    return(){ended=true;return Promise.resolve({done:true});}};}};
   runs.set(command,{terminal,execution,chunk(value){if(push){const done=push;push=undefined;done({done:false,value});}else{pending.push(value);}},
    endRead(){ended=true;if(push){push({done:true});push=undefined;}}});
   emit('started',{terminal,execution});return execution;
  }};
  emit('integration',{terminal});
 }
 function complete(command,endRead=true){const r=runs.get(command);assert.ok(r);
  emit('ended',{terminal:r.terminal,execution:r.execution,exitCode:0});if(endRead)r.endRead();}
 const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
 const manager=new ShellManager(inspect);manager.create('audit_user',__dirname,true,'user');
 return{manager,terminal:terminals[0],integrate,emit,issued,runs,complete,ShellManager};
}
(async()=>{
 {
  const h=harness();
  try{
   const pending=h.manager.execute('audit_user','must_not_interrupt_manual',2000);
   const rejected=assert.rejects(pending,/outside its MCP queue/);
   await wait(10);const manual={};h.emit('started',{terminal:h.terminal,execution:manual});h.integrate(h.terminal);
   await rejected;assert.deepEqual(h.issued,[]);
   h.emit('ended',{terminal:h.terminal,execution:manual,exitCode:0});
  }finally{h.manager.dispose(true);}
 }
 {
  const h=harness();
  try{
   const ac=new AbortController();const pending=h.manager.execute('audit_user','cancelled_before_dispatch',2000,ac.signal);
   const rejected=assert.rejects(pending,/cancelled before execution/);
   await wait(10);ac.abort();await rejected;h.integrate(h.terminal);await wait(10);
   assert.deepEqual(h.issued,[]);assert.equal(h.manager.list()[0].busy,false);
  }finally{h.manager.dispose(true);}
 }
 {
  const h=harness();h.integrate(h.terminal);
  try{
   const first=h.manager.execute('audit_user','old_reader',2000);await until(()=>h.runs.has('old_reader'));
   h.complete('old_reader',false);assert.equal((await first).output_incomplete,true);
   const second=h.manager.execute('audit_user','silent_command',2000);await until(()=>h.runs.has('silent_command'));
   h.runs.get('old_reader').chunk('Password:');await wait(10);
   assert.equal(h.manager.list()[0].input_wait_hint,undefined);
   h.runs.get('old_reader').endRead();h.complete('silent_command');await second;
  }finally{h.manager.dispose(true);}
 }
 {
  const h=harness();h.integrate(h.terminal);
  try{
   const timedOut=h.manager.execute('audit_user','lost_end',1000);
   const rejected=assert.rejects(timedOut,/timed out/);
   await until(()=>h.runs.has('lost_end'));h.runs.get('lost_end').endRead();await rejected;
   const confirmed=h.manager.confirmRestoredUserShell('audit_user');
   assert.equal(confirmed.busy,false);assert.equal(confirmed.external_busy,false);
   const retry=h.manager.execute('audit_user','after_ack',1000);await until(()=>h.runs.has('after_ack'));
   h.complete('after_ack');assert.equal((await retry).exit_code,0);
  }finally{h.manager.dispose(true);}
 }
 {
  let readiness='busy';const h=harness(async()=>readiness);h.integrate(h.terminal);
  try{
   const missing=h.manager.execute('audit_user','auto_recover',2000);await until(()=>h.runs.has('auto_recover'));
   h.runs.get('auto_recover').endRead();await until(()=>h.manager.list()[0].execution_phase==='waiting_for_completion');
   assert.deepEqual(await h.manager.resumeProvenIdleTerminals(),[]);
   assert.equal(h.manager.list()[0].busy,true,'Busy foreground runspace must not be unlocked');
   readiness='idle';assert.deepEqual(await h.manager.resumeProvenIdleTerminals(),['audit_user']);
   await missing;assert.equal(h.manager.list()[0].busy,false);
   const retry=h.manager.execute('audit_user','automatic_retry',1000);await until(()=>h.runs.has('automatic_retry'));
   h.complete('automatic_retry');await retry;
  }finally{h.manager.dispose(true);}
 }
 {
  let readiness='busy';const h=harness(async()=>readiness);h.integrate(h.terminal);
  try{
   const timedOut=h.manager.execute('audit_user','auto_after_timeout',1000);
   const rejected=assert.rejects(timedOut,/timed out/);await until(()=>h.runs.has('auto_after_timeout'));await rejected;
   assert.deepEqual(await h.manager.resumeProvenIdleTerminals(),[]);assert.equal(h.manager.list()[0].timed_out_running,true);
   readiness='idle';assert.deepEqual(await h.manager.resumeProvenIdleTerminals(),['audit_user']);
   assert.equal(h.manager.list()[0].timed_out_running,false);assert.equal(h.manager.list()[0].busy,false);
   h.runs.get('auto_after_timeout').endRead();
  }finally{h.manager.dispose(true);}
 }
 {
  let resolveInspection;let inspections=0;
  const h=harness(()=>{inspections++;return new Promise(resolve=>{resolveInspection=resolve;});});
  h.manager.dispose(true);
  const restored=new h.ShellManager(()=>{inspections++;return new Promise(resolve=>{resolveInspection=resolve;});});
  try{
   restored.restoreUserTerminals(__dirname,[{shell_id:'audit_user',initial_cwd:__dirname}]);
   const checking=restored.resumeProvenIdleTerminals();const concurrent=restored.resumeProvenIdleTerminals();
   await until(()=>!!resolveInspection);
   const manual={};h.emit('started',{terminal:h.terminal,execution:manual});resolveInspection('idle');
   assert.deepEqual(await checking,[]);assert.deepEqual(await concurrent,[]);assert.equal(inspections,1);
   assert.equal(restored.list()[0].recovery_required,true,'A new start invalidates asynchronous idle proof');
   h.emit('ended',{terminal:h.terminal,execution:manual,exitCode:0});assert.equal(restored.list()[0].recovery_required,false);
  }finally{restored.dispose(true);}
 }
 {
  const h=harness(async()=> 'idle');h.integrate(h.terminal);
  try{
   const stale={};h.emit('started',{terminal:h.terminal,execution:stale});
   assert.equal(h.manager.list()[0].external_busy,true);
   assert.deepEqual(await h.manager.resumeProvenIdleTerminals(),['audit_user']);
   assert.equal(h.manager.list()[0].external_busy,false);
  }finally{h.manager.dispose(true);}
 }
 {
  const h=harness();h.manager.dispose(true);
  for(const readiness of ['busy','unknown']){
   const restored=new h.ShellManager(async()=>readiness);
   try{
    restored.setSavedIdleProofs({audit_user:{initial_cwd:__dirname,process_id:12345,saved_at:Date.now()}});
    restored.restoreUserTerminals(__dirname,[{shell_id:'audit_user',initial_cwd:__dirname}]);
    assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);
    assert.equal(restored.list()[0].recovery_required,true,'Busy or failed inspection must override an older idle snapshot');
   }finally{restored.dispose(true);}
  }
 }
 console.log('PASS: dispatch cancellation, manual-start race, stale-reader isolation, stale execution cleanup, automatic idle recovery, busy guard and inspection races');
})().catch(error=>{console.error(error);process.exitCode=1;});
