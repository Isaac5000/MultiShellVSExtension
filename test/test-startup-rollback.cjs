'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
class FakeManager{
  constructor(){this.items=new Map();this.fail=false;}
  create(id,cwd,_allow,origin){
    const value={shell_id:id,initial_cwd:cwd,origin:origin||'mcp',busy:false,queued:0};
    this.items.set(id,value);
    return value;
  }
  list(){
    if(this.fail)throw new Error('registration rejected');
    return [...this.items.values()];
  }
  restoreUserTerminals(){return [];}
  dispose(){this.items.clear();}
}
const {MultiWindowController}=proxyquire('../out/multi-window.js',{
  './shell-manager':{ShellManager:FakeManager}
});
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-rollback-'));
  let created=0,stopped=0;
  let controller;
  const hub=async()=>{
    created++;
    controller.localShells.fail=true;
    return {async stop(){stopped++;}};
  };
  controller=new MultiWindowController(0,'b'.repeat(64),dir,hub);
  try{
    await assert.rejects(controller.start(),/registration rejected/i);
    assert.equal(created,1);
    assert.equal(stopped,1,'Hub must close immediately if registration fails after binding');
    assert.equal(controller.worker.port,0,'Worker must also be stopped on startup failure');
    console.log('PASS: startup registration failure closes newly created MCP hub and worker');
  }finally{
    await controller.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
