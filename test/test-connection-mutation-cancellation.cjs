'use strict';
const assert=require('node:assert/strict');
const {environment,tool,wait}=require('./connection-fixture.cjs');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
async function until(check){for(let i=0;i<100;i++){if(check())return;await wait(5);}throw Error('Condition timed out');}
(async()=>{
 const failures=[];
 for(const kind of ['create','close']){
  const env=await environment(1),entered=deferred(),release=deferred(),abort=new AbortController();
  try{
   if(kind==='create'){
    const create=env.router.create.bind(env.router);
    env.router.create=async(...args)=>{entered.resolve();await release.promise;return create(...args);};
   }else{
    env.vscode.window.showWarningMessage=async(_message,_options,accept)=>{
     entered.resolve();await release.promise;return accept;
    };
   }
   const name=kind==='create'?'create_shell_code':'close_shell_code';
   const args=kind==='create'?{shell_id:'cancelled_create',cwd:env.workers[0].workspace,allow_shared_directory:true}:{shell_id:'connection_0'};
   const pending=tool(env.port,name,args,{signal:abort.signal}).then(value=>({value}),error=>({error}));
   await entered.promise;abort.abort();assert.ok((await pending).error);
   await until(()=>env.hub.sessions.size===0);await wait(30);release.resolve();await wait(100);
   if(kind==='create')assert.equal(env.managers[0].list().some(shell=>shell.shell_id==='cancelled_create'),false,
    'A disconnected create request must not open an orphan terminal');
   else assert.equal(env.managers[0].list().some(shell=>shell.shell_id==='connection_0'),true,
    'A disconnected close request must not close a user terminal after a delayed approval');
  }catch(error){failures.push(kind+': '+error.message);}
  finally{release.resolve();await env.stop();}
 }
 assert.deepEqual(failures,[]);
 console.log('PASS: disconnected creation and delayed user-terminal closure cannot apply after cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
