const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const proxyquire = require('proxyquire').noCallThru();
const hooks = { closed: new Set(), integration: new Set(), ended: new Set() };
const observe = key => fn => { hooks[key].add(fn); return { dispose(){ hooks[key].delete(fn); } }; };
const fire = (key, data) => { for (const fn of [...hooks[key]]) fn(data); };
const mock = {
 workspace: {workspaceFolders: []},
 window: {
   onDidCloseTerminal: observe('closed'),
   onDidChangeTerminalShellIntegration: observe('integration'),
   onDidEndTerminalShellExecution: observe('ended'),
   createTerminal(options) {
     const terminal = {
       name:options.name, cwd:options.cwd,
       dispose(){fire('closed',terminal);},
       shellIntegration: {executeCommand(command) {
         const execution = {async *read(){
            await new Promise(r=>setTimeout(r,75));
            fire('ended',{terminal,execution,exitCode:0});
            yield options.name+':'+command;
         }};
         return execution;
       }}
     };
     return terminal;
   }
 }
};
const { ShellManager } = proxyquire('../out/shell-manager.js',{vscode:mock});
const scoped = proxyquire('../out/tools/scoped-file-tools.js',{vscode:mock});
const { MCPServer } = proxyquire('../out/server.js',{
  vscode:mock,
  './tools/scoped-file-tools':scoped,
  './multi-window': {REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
  './utils/logger':{logger:{info(){},warn(){},error(...args){console.error("SERVER ERROR",...args)}}}
});
function parse(body) {
 if (body.startsWith('data:')) return JSON.parse(body.substring(5).trim());
 if (body.includes('\ndata:')) return JSON.parse(body.split('\n').find(x=>x.startsWith('data:')).slice(5).trim());
 return JSON.parse(body);
}
async function main(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-http-test-'));
 const a=path.join(folder,'a'),b=path.join(folder,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 const shells=new ShellManager();
 const server=new MCPServer(0,'127.0.0.1',shells,{file:true,edit:true,shell:true});
 try{
   await server.start();
   const port=server.httpServer.address().port;
   const rpc=async(method,params={})=>{
      const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
         method:'POST',
         headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
         body:JSON.stringify({jsonrpc:'2.0',id:Math.floor(Math.random()*1e8),method,params})
      });
      const body=await response.text();
      assert.equal(response.status,200,method+' failed '+response.status+': '+body);
      return parse(body);
   };
   const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'local-smoke',version:'1'}});
   assert.ok(init.result?.serverInfo,'initialize should return server information');
   const tools=await rpc('tools/list');
   const names=tools.result.tools.map(t=>t.name);
   assert.ok(names.includes('create_shell_code')&&names.includes('execute_shell_command_code'));
   assert.equal(names.length,17,'Expected five shell, eight scoped file and four native VSCode tools');
   const call=async(name,args)=> {
      const r=await rpc('tools/call',{name,arguments:args});
      assert.ok(r.result?.content,'tool result missing '+name);
      try {return JSON.parse(r.result.content[0].text);} catch {return r.result.content[0].text;}
   };
   assert.ok((await call('create_shell_code',{shell_id:'alpha',cwd:a})).created);
   assert.ok((await call('create_shell_code',{shell_id:'beta',cwd:b})).created);
   const [ra,rb]=await Promise.all([
      call('execute_shell_command_code',{shell_id:'alpha',command:'hello-alpha'}),
      call('execute_shell_command_code',{shell_id:'beta',command:'hello-beta'})]);
   assert.match(ra.output,/hello-alpha/);
   assert.match(rb.output,/hello-beta/);
   const write=await call('create_file_code',{shell_id:'alpha',path:'hello.txt',content:'data-alpha'});
   assert.ok(write.created);
   const wrong=await call('read_file_code',{shell_id:'beta',path:'../a/hello.txt'});
   assert.match(wrong.error,/escapes/);
   const read=await call('read_file_code',{shell_id:'alpha',path:'hello.txt'});
   assert.equal(read,'data-alpha');
   console.log('PASS MCP HTTP initialize / tools/list / 2 parallel shell calls / shell-bound file edits and traversal denial (port '+port+')');
 }finally { await server.stop(); shells.dispose(); fs.rmSync(folder,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
