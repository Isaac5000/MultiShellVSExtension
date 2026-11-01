'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const listeners={closed:new Set(),ended:new Set(),integration:new Set()};
const on=kind=>cb=>{listeners[kind].add(cb);return{dispose(){listeners[kind].delete(cb);}}};
const fire=(kind,payload)=>{for(const cb of [...listeners[kind]])cb(payload);};
const userInput=[];
const physical=[];
const mock={
 workspace:{workspaceFolders:[]},
 window:{
   onDidCloseTerminal:on('closed'),
   onDidEndTerminalShellExecution:on('ended'),
   onDidChangeTerminalShellIntegration:on('integration'),
   createTerminal(opts){
     const terminal={
       name:opts.name,creationOptions:opts,
       dispose(){fire('closed',terminal)},
       sendText(value,addNewLine){userInput.push({terminal:opts.name,value,addNewLine});}
     };
     terminal.shellIntegration={executeCommand(command){
       const execution={
         async *read(){
           const screen=command.startsWith('less')?'FILE CONTENT\\n(END)':
             command.startsWith('more')?'FILE CONTENT\\n-- Más --':
             command.startsWith('top')?'top - 21:17:01 up 2 days\\nTasks: 75 total':
             command.startsWith('htop')?'\\x1b[?1049hCPU  MEM F10 Quit':
             'interactive screen for '+command;
           yield screen;
           await new Promise(resolve=>setTimeout(resolve,300));
           fire('ended',{terminal,execution,exitCode:0});
           yield 'closed';
         }
       };
       return execution;
     }};
     physical.push(terminal);
     return terminal;
   }
 }
};
const {ShellManager,recognizedInteractiveCommand}=proxyquire('../out/shell-manager.js',{vscode:mock});
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-interactive-'));
 const manager=new ShellManager();
 try{
   for(const ok of ['less file.txt','more README.md','top','htop -d 5','man ls','/usr/bin/less /tmp/file']){
     assert.ok(recognizedInteractiveCommand(ok),'Known q-to-quit command: '+ok);
   }
   for(const unsafe of ['less file | cat','less foo; rm foo','vim file','nano file','git log','top && echo hello',
      'echo less','less $(echo foo)','less `date`','sleep 10']){
     assert.equal(recognizedInteractiveCommand(unsafe),undefined,
       'Do not inject keys into unknown or compound shell commands: '+unsafe);
   }
   manager.create('interactive',root,true,'user');
   const run=cmd=>manager.execute('interactive',cmd,2500);
   let r=await run('less file.txt');
   assert.equal(r.exit_code,0);
   assert.deepEqual(userInput.map(x=>x.value),['q']);
   assert.equal(userInput[0].addNewLine,false);
   assert.equal(manager.list()[0].auto_exit_interactive,true);

   manager.setWindowInteractiveAutoExit(false);
   assert.equal(manager.list()[0].auto_exit_interactive,false);
   r=await run('more file.txt');
   assert.equal(r.exit_code,0);
   assert.equal(userInput.length,1,'Window OFF must suppress q');

   manager.setShellInteractiveAutoExit('interactive',true);
   assert.equal(manager.list()[0].auto_exit_override,true);
   r=await run('top');
   assert.equal(r.exit_code,0);
   assert.equal(userInput.length,2,'Terminal override ON wins over window OFF');

   manager.setShellInteractiveAutoExit('interactive',false);
   r=await run('htop');
   assert.equal(r.exit_code,0);
   assert.equal(userInput.length,2,'Terminal override OFF wins over window');
   manager.setShellInteractiveAutoExit('interactive',undefined);
   assert.equal(manager.list()[0].auto_exit_override,undefined);
   assert.equal(manager.list()[0].auto_exit_interactive,false);
   manager.setWindowInteractiveAutoExit(true);
   r=await run('less file | cat');
   assert.equal(r.exit_code,0);
   assert.equal(userInput.length,2,'Compound command must not get injected keys');
   assert.deepEqual(manager.getInteractiveOverrides(),{});
   console.log('PASS: known interactive q-exit commands, dangerous command exclusion, window switch and terminal overrides');
 }finally{manager.dispose(true);fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});