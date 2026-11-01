'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-idle-proof-'));
const nested=path.join(dir,'test');
fs.mkdirSync(nested);
const slug=path.basename(dir).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
const mainId='main-'+slug+'-a1b2c3d4';
const observers={started:new Set(),ended:new Set(),closed:new Set()};
const on=kind=>callback=>{observers[kind].add(callback);return{dispose(){observers[kind].delete(callback);}}};
const fire=(kind,event)=>{for(const f of [...observers[kind]])f(event);};
const makeTerminal=(id,cwd,pid)=>({
  name:'MCP ['+id+']',
  creationOptions:{cwd},
  processId:Promise.resolve(pid),
  state:{isInteractedWith:false},
  disposed:false,
  show(){},
  dispose(){this.disposed=true;vscode.window.terminals=vscode.window.terminals.filter(t=>t!==this);fire('closed',this);}
});
const vscode={workspace:{workspaceFolders:[{uri:{fsPath:dir}}]},window:{
  terminals:[],
  onDidStartTerminalShellExecution:on('started'),
  onDidEndTerminalShellExecution:on('ended'),
  onDidCloseTerminal:on('closed'),
  createTerminal({name,cwd}){
    const id=name.slice(5,-1);
    const terminal=makeTerminal(id,cwd,processId++);
    this.terminals.push(terminal);
    return terminal;
  }
}};
let processId=18000;
const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
const get=(m,id)=>m.list().find(t=>t.shell_id===id);
async function main(){
 let m=new ShellManager(),restored;
 try{
  const pm=m.create(mainId,dir,true,'automatic');
  const pu=m.create('remembered',nested,true,'user');
  let stateChangeCount=0;
  m.setIdleStateListener(()=>{stateChangeCount++;});
  assert.equal(pm.recovery_required,false);
  assert.equal(pu.recovery_required,false);
  const proof=await m.snapshotSafeIdleProofs();
  assert.equal(proof[mainId].process_id,18000);
  assert.equal(proof.remembered.process_id,18001);
  assert.ok(Math.abs(Date.now()-proof[mainId].saved_at)<5_000,
    'Idle evidence must be fresh and bounded to this reload');
  // Evidence is withheld for a command with a known start but no end.
  const pending={};
  const userTerminal=vscode.window.terminals.find(t=>t.name==='MCP [remembered]');
  fire('started',{terminal:userTerminal,execution:pending});
  assert.equal((await m.snapshotSafeIdleProofs()).remembered,undefined);
  fire('ended',{terminal:userTerminal,execution:pending,exitCode:0});
  assert.equal((await m.snapshotSafeIdleProofs()).remembered.process_id,18001);
  assert.ok(stateChangeCount>=2,
    'Shell start/end events must trigger persistence notifications');
  m.dispose(true);
  restored=new ShellManager();
  restored.setSavedIdleProofs(proof);
  assert.equal(restored.restoreMainTerminals(dir,mainId),mainId);
  assert.equal(restored.restoreUserTerminals(dir,[{shell_id:'remembered',initial_cwd:nested}]).length,1);
  assert.equal(get(restored,mainId).recovery_required,true);
  assert.equal(get(restored,'remembered').recovery_required,true);
  assert.deepEqual(new Set(await restored.resumeProvenIdleTerminals()),new Set([mainId,'remembered']));
  assert.equal(get(restored,mainId).recovery_required,false);
  assert.equal(get(restored,'remembered').recovery_required,false);
  assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);

  // Stale or invalid idle evidence must not automatically unlock a terminal.
  const oldProof={...proof[mainId],saved_at:Date.now()-300_000};
  const staleManager=new ShellManager();
  staleManager.setSavedIdleProofs({[mainId]:oldProof});
  staleManager.restoreMainTerminals(dir,mainId);
  assert.deepEqual(await staleManager.resumeProvenIdleTerminals(),[]);
  assert.equal(get(staleManager,mainId).recovery_required,true);
  staleManager.dispose(true);

  // Never trust a matching name/path if the underlying process was replaced.
  const different=makeTerminal('other',nested,55000);
  vscode.window.terminals.push(different);
  restored.setSavedIdleProofs({other:{initial_cwd:nested,process_id:54000}});
  assert.equal(restored.restoreUserTerminals(dir,[{shell_id:'other',initial_cwd:nested}]).length,1);
  assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);
  assert.equal(get(restored,'other').recovery_required,true);

  // A new command start invalidates the idle proof before the PID resolves.
  const running=makeTerminal('running',nested,56000);
  vscode.window.terminals.push(running);
  restored.setSavedIdleProofs({running:{initial_cwd:nested,process_id:56000}});
  restored.restoreUserTerminals(dir,[{shell_id:'running',initial_cwd:nested}]);
  const active={};
  fire('started',{terminal:running,execution:active});
  assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);
  assert.equal(get(restored,'running').recovery_required,true);

  // A different cwd must not be treated as evidence for this workspace.
  restored.setSavedIdleProofs({running:{initial_cwd:dir,process_id:56000}});
  fire('ended',{terminal:running,execution:active,exitCode:undefined});
  assert.deepEqual(await restored.resumeProvenIdleTerminals(),[]);
  assert.equal(get(restored,'running').recovery_required,true);
  console.log('PASS: persisted idle proofs reattach same PID and cwd; changed PID, uncertain activity, or mismatched cwd remain protected');
 }finally{
  m.dispose(true);
  restored?.dispose(true);
  for(const group of Object.values(observers))assert.equal(group.size,0);
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});