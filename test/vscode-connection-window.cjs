'use strict';
const vscode=require('vscode'),fs=require('node:fs'),path=require('node:path');
const base=process.env.MULTISHELL_CONNECTION_ROOT,label=process.env.MULTISHELL_CONNECTION_WINDOW;
const port=Number(process.env.MULTISHELL_TEST_PORT);
if(!base||!['A','B'].includes(label)){throw Error('Launch through npm run test:windows');}
const stateFile=path.join(base,label+'-state.json'),commandFile=path.join(base,label+'-command.json');
let previous={};try{previous=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{}
const state={label,boot:(previous.boot||0)+1,lastCommand:previous.lastCommand||0,online:false,stage:'starting',version:vscode.version};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function discover(){
 const response=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',signal:AbortSignal.timeout(4000),
  headers:{'content-type':'application/json',accept:'application/json,text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_windows_code',arguments:{}}})});
 const text=await response.text();const row=text.split(/\r?\n/).find(line=>line.startsWith('data:'));
 const data=JSON.parse(row?row.slice(5):text);const windows=JSON.parse(data.result.content[0].text).windows;
 const target=path.join(base,'workspace-'+label).toLowerCase();
 const own=windows.filter(window=>path.resolve(window.workspace).toLowerCase()===target).at(-1);
 if(!own)throw Error('Own window was not registered');state.windowId=own.window_id;
}
exports.run=async()=>{
 state.initialTerminals=await Promise.all(vscode.window.terminals.map(async terminal=>({name:terminal.name,pid:await terminal.processId,options:{cwd:terminal.creationOptions.cwd,isTransient:terminal.creationOptions.isTransient}})));
 state.terminalEvents=[];
 const opened=vscode.window.onDidOpenTerminal(terminal=>{state.terminalEvents.push({event:'open',name:terminal.name});save();});
 const closed=vscode.window.onDidCloseTerminal(terminal=>{state.terminalEvents.push({event:'close',name:terminal.name});save();});
 save();const deadline=Date.now()+240000;
 try{
  const extension=vscode.extensions.getExtension('local-multishell.multi-shell-mcp-server');await extension.activate();
  try{await discover();state.online=true;}
  catch{await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');state.online=true;await discover();}
  state.stage='ready';save();
  while(Date.now()<deadline){
   let command;try{command=JSON.parse(fs.readFileSync(commandFile,'utf8'));}catch{}
   if(command&&command.id>state.lastCommand){
    state.lastCommand=command.id;state.stage='handling';save();
    if(command.op==='exit'){state.stage='exiting';save();break;}
    if(command.op==='stop'&&state.online){await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');state.online=false;}
    if(command.op==='start'&&!state.online){await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');state.online=true;await discover();}
    if(command.op==='reload'){
     state.stage='reloading';save();void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }else{state.stage='ready';}
   }
   state.terminals=await Promise.all(vscode.window.terminals.map(async terminal=>({name:terminal.name,pid:await terminal.processId})));
   save();await wait(100);
  }
 }catch(error){state.error=error.stack;save();throw error;}
 finally{
  opened.dispose();closed.dispose();
  if(state.online){await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');state.online=false;}
  state.stage='complete';save();
 }
};
