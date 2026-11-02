'use strict';
const assert=require('node:assert/strict'),proxyquire=require('proxyquire').noCallThru();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function scenario(integrated){
 const hooks={closed:new Set(),started:new Set(),ended:new Set(),integration:new Set()};
 const on=kind=>fn=>{hooks[kind].add(fn);return{dispose(){hooks[kind].delete(fn);}};};
 let disposed=0,issued=0;
 const terminal={name:'MCP [preserved]',creationOptions:{cwd:__dirname},state:{isInteractedWith:false},dispose(){disposed++;}};
 if(integrated)terminal.shellIntegration={executeCommand(){issued++;return{read(){return{
  [Symbol.asyncIterator](){return this;},next(){return new Promise(()=>{});},return(){return Promise.resolve({done:true});}
 };}};}};
 const vscode={workspace:{workspaceFolders:[]},window:{terminals:[],createTerminal(){return terminal;},
  onDidCloseTerminal:on('closed'),onDidStartTerminalShellExecution:on('started'),
  onDidEndTerminalShellExecution:on('ended'),onDidChangeTerminalShellIntegration:on('integration')}};
 const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});const manager=new ShellManager();
 manager.create('preserved',__dirname,true,'user');
 const active=manager.execute('preserved','active',1000).then(value=>({value}),error=>({error}));
 await wait(10);const queued=manager.execute('preserved','queued',1000).then(value=>({value}),error=>({error}));
 await wait(10);manager.dispose(true);
 try{
  const outcome=await Promise.race([Promise.all([active,queued]),wait(100).then(()=>null)]);
  assert.ok(outcome,'Disposal must settle old requests immediately instead of retaining them until timeout');
  assert.ok(outcome.every(result=>result.error),'Disposed requests must not claim success');
  assert.equal(disposed,0,'Disposing the manager must preserve the physical terminal');
  assert.equal(issued,integrated?1:0,'Queued commands must never be dispatched on disposal');
  for(const [kind,listeners] of Object.entries(hooks))assert.equal(listeners.size,0,'Leaked '+kind+' listener');
 }finally{for(const fn of [...hooks.closed])fn(terminal);await Promise.all([active,queued]);}
}
(async()=>{await scenario(false);await scenario(true);console.log('PASS: manager disposal detaches pending work/listeners while preserving the terminal process');})()
 .catch(error=>{console.error(error);process.exitCode=1;});
