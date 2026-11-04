'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const assert=require('node:assert/strict');
const http=require('node:http');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function classes(){
 const hooks={closed:new Set(),started:new Set(),ended:new Set(),integration:new Set()};
 const observe=kind=>fn=>{hooks[kind].add(fn);return{dispose(){hooks[kind].delete(fn);}};};
 const emit=(kind,event)=>{for(const fn of [...hooks[kind]])fn(event);};
 const issued=[],finished=[],holds=new Map();
 const vscode={env:{language:'en'},workspace:{workspaceFolders:[]},window:{terminals:[],
  onDidCloseTerminal:observe('closed'),onDidStartTerminalShellExecution:observe('started'),
  onDidEndTerminalShellExecution:observe('ended'),onDidChangeTerminalShellIntegration:observe('integration'),
  createTerminal(options){
   const terminal={name:options.name,creationOptions:options,state:{isInteractedWith:false},closed:false,show(){},
    dispose(){if(!terminal.closed){terminal.closed=true;emit('closed',terminal);}}};
   terminal.shellIntegration={executeCommand(command){
    const shell=options.name.slice(5,-1);issued.push({shell,command,at:Date.now()});
    const execution={async *read(){
     const ms=Number(/^delay:(\d+):/.exec(command)?.[1]||1);
     if(command.startsWith('hold:')){
       await new Promise(resolve=>{holds.set(command.slice(5),resolve);});
     }else{await wait(ms);}
     if(!terminal.closed){emit('ended',{terminal,execution,exitCode:0});}
     finished.push({shell,command,at:Date.now()});
     yield JSON.stringify({shell,command});
    }};
    emit('started',{terminal,execution});return execution;
   }};
   this.terminals.push(terminal);return terminal;
  }
 }};
 const {ShellManager}=proxyquire('../out/shell-manager.js',{vscode});
 const mw=proxyquire('../out/multi-window.js',{'./shell-manager':{ShellManager},vscode});
 const logs=[];
 const {MCPServer}=proxyquire('../out/server.js',{'./multi-window':mw,
  './utils/logger':{logger:{info(){},warn(x){logs.push(String(x));},error(x){logs.push(String(x));}}}});
 return{ShellManager,...mw,MCPServer,issued,finished,holds,logs,hooks,vscode};
}
function parse(text){const row=text.split(/\r?\n/).find(x=>x.startsWith('data:'));return JSON.parse(row?row.slice(5):text);}
let requestId=0;
async function rpc(port,method,params={},options={}){
 const body=JSON.stringify({jsonrpc:'2.0',id:options.id??++requestId,method,params});
 if(options.agent){
  return new Promise((resolve,reject)=>{
   const request=http.request({hostname:'127.0.0.1',port,path:'/mcp',method:'POST',agent:options.agent,
    signal:options.signal||AbortSignal.timeout(12000),
    headers:{'content-type':'application/json',accept:'application/json,text/event-stream',...options.headers}},response=>{
    let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});
    response.on('error',reject);response.once('end',()=>{try{assert.equal(response.statusCode,200);resolve(parse(text));}catch(error){reject(error);}});
   });request.once('error',reject);request.end(body);
  });
 }
 const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
  method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream',...options.headers},
  signal:options.signal||AbortSignal.timeout(12000),
  body});
 const text=await response.text();assert.equal(response.status,200,method+': '+response.status+' '+text.slice(0,200));
 return parse(text);
}
async function tool(port,name,args,options){const value=await rpc(port,'tools/call',{name,arguments:args},options);
 assert.ok(!value.error,JSON.stringify(value.error));assert.ok(!value.result?.isError,value.result?.content?.[0]?.text);
 return JSON.parse(value.result.content[0].text);}
async function environment(count=3){
 const types=classes();const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-connection-'));
 const secret='7'.repeat(64),router=new types.WindowRouter(secret),workers=[],managers=[];
 let hub=new types.MCPServer(0,'127.0.0.1',router,{file:false,edit:false,shell:true},router);
 await hub.start();let port=hub.httpServer.address().port;
 for(let i=0;i<count;i++){
  const cwd=path.join(root,'window'+i);fs.mkdirSync(cwd);
  const manager=new types.ShellManager(async()=> 'unknown');
  manager.create('connection_'+i,cwd,true,'user');managers.push(manager);
  const worker=new types.WindowWorker(manager,secret,cwd);workers.push(worker);await worker.start();
  router.register({window_id:worker.id,workspace:cwd,worker_port:worker.port});await router.reconcile(worker.id);
 }
 return{...types,root,secret,router,workers,managers,get hub(){return hub;},get port(){return port;},
  async register(index){const worker=workers[index];router.register({window_id:worker.id,workspace:worker.workspace,worker_port:worker.port,aliases:Object.fromEntries(worker.aliases)});await router.reconcile(worker.id);},
  async restartHub(){await hub.stop();hub=new types.MCPServer(port,'127.0.0.1',router,{file:false,edit:false,shell:true},router);await hub.start();},
  releaseHold(name){const release=types.holds.get(name);if(release){types.holds.delete(name);release();return true;}return false;},
  async stop(){await hub.stop();await Promise.all(workers.map(worker=>worker.stop()));managers.forEach(manager=>manager.dispose(true));fs.rmSync(root,{recursive:true,force:true});}
 };
}
module.exports={classes,environment,rpc,tool,parse,wait};