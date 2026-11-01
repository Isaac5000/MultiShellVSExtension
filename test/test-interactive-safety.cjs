'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listeners={closed:new Set(),ended:new Set(),started:new Set()};
const on=kind=>listener=>{listeners[kind].add(listener);return {dispose(){listeners[kind].delete(listener);}};};
const emit=(kind,data)=>{for(const listener of [...listeners[kind]])listener(data);};
const scenarios=new Map();
const inputs=[];
const mock={
    workspace:{workspaceFolders:[]},
    window:{
        onDidCloseTerminal:on('closed'),
        onDidEndTerminalShellExecution:on('ended'),
        onDidStartTerminalShellExecution:on('started'),
        createTerminal(opts){
            const terminal={
                name:opts.name,creationOptions:opts,state:{isInteractedWith:false},
                dispose(){emit('closed',terminal);},
                show(){},
                sendText(key,newLine){
                    inputs.push({key,newLine,command:terminal.currentCommand});
                    terminal.resolveQuit?.();
                }
            };
            terminal.shellIntegration={
                executeCommand(command){
                    terminal.currentCommand=command;
                    const scenario=scenarios.get(command);
                    if(!scenario)throw Error('No test scenario for '+command);
                    let resolveQuit;
                    const quit=new Promise(resolve=>{resolveQuit=resolve;});
                    terminal.resolveQuit=resolveQuit;
                    const execution={
                        async *read(){
                            if(scenario.earlyAmbiguous){
                                emit('ended',{terminal,execution,exitCode:undefined});
                            }
                            for(const chunk of scenario.chunks){yield chunk;}
                            if(scenario.hangAfterCompletion){
                                if(scenario.beforeEndDelayMs){await delay(scenario.beforeEndDelayMs);}
                                emit('ended',{terminal,execution,exitCode:0});
                                await new Promise(()=>{});
                            }else{
                                if(scenario.waitForQuit){
                                    await Promise.race([
                                        quit,
                                        delay(1800).then(()=>{throw new Error('Missing q for '+command);})
                                    ]);
                                }else{
                                    await delay(scenario.delayMs??35);
                                }
                                emit('ended',{terminal,execution,exitCode:0});
                            }
                        }
                    };
                    emit('started',{terminal,execution});
                    return execution;
                }
            };
            return terminal;
        }
    }
};
const {ShellManager,recognizedInteractiveCommand,interactiveReadyForQuit}=
    proxyquire('../out/shell-manager.js',{vscode:mock});
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multi-shell-quit-guards-'));
 const manager=new ShellManager();
 try{
    const recognized=[
        'less file.txt','more README.md','top','htop','man ls',
        'btop','bpytop','nvtop','iftop','iotop','tig',
        'top -d 2','htop -d 5'
    ];
    const rejected=[
        'less --help','less --version','less -F file','less --quit-if-one-screen file',
        'more /?','more --help','top -b -n 1','top -bn1',
        'top --batch','top -n1','man -w ls','man -k ls','man --whatis ls',
        'man -P cat ls','man --pager=cat ls','man -aw ls',
        'iotop -b -n 1','iotop -bn1','tig --version','btop --help',
        'nvtop -h','less file | cat','man ls; echo done',
        'echo more','git diff --check','git log','git --no-pager log',
        'vim config','nano file','ssh host','docker stats --no-stream',
        'bat --paging=never file','top $(date)'
    ];
    for(const cmd of recognized)assert.ok(recognizedInteractiveCommand(cmd),
        'Expected allowlisted standalone screen command: '+cmd);
    for(const cmd of rejected)assert.equal(recognizedInteractiveCommand(cmd),undefined,
        'Non-interactive command must never be sent q: '+cmd);

    const screens=[
        ['more README.md',['first page\n-- Más',' --'],true],
        ['less file.txt',['first page\n(END)'],true],
        ['man ls',['manual content\n(END)'],true],
        ['top',['top - 21:35:01 up 5 days\nTasks: 87 total'],true],
        ['htop',['\x1b[?1049hCPU Mem Tasks'],true],
        ['btop',['\x1b[?1049hCPU'],true],
        ['bpytop',['\x1b[?1049hCPU'],true],
        ['nvtop',['\x1b[?1049hGPU'],true],
        ['iftop',['\x1b[?1049hTX RX'],true],
        ['iotop',['\x1b[?1049hTotal DISK READ'],true],
        ['tig',['\x1b[?1049hGit repository'],true],
        ['less /tmp/file',['ordinary first output, no prompt'],false],
        ['top -d 2',['not a top dashboard'],false],
        ['git diff --check',['-- Más --'],false],
        ['less --help',['(END)'],false],
        ['top -b -n 1',['top - 21:35:01\nTasks: 87 total'],false],
        ['man -w ls',['(END)'],false],
        ['less suspicious.txt',['(END)'],false]
    ];
    manager.create('simulation',dir,true,'user');
    let testCount=0;
    for(const [command,chunks,needsQuit] of screens){
        scenarios.set(command,{chunks,waitForQuit:needsQuit,delayMs:280,
            earlyAmbiguous:command==='less suspicious.txt'});
        const start=inputs.length;
        const result=await manager.execute('simulation',command,2300);
        assert.equal(result.exit_code,0,'Completion event must resolve '+command);
        const added=inputs.slice(start);
        assert.equal(added.length,needsQuit?1:0,'Unexpected keystroke for '+command);
        if(needsQuit)assert.deepEqual(added[0].key,'q');
        testCount++;
    }

    // Completion is definitive even if VS Code's output stream stays open.
    const hung='git diff --check with lingering output iterator';
    scenarios.set(hung,{chunks:['warning: LF will be replaced by CRLF\n'],
        hangAfterCompletion:true,beforeEndDelayMs:600});
    const first=Date.now();
    const result=await manager.execute('simulation',hung,1000);
    assert.equal(result.exit_code,0);
    assert.equal(result.output_incomplete,true);
    assert.equal(result.truncated,true);
    assert.ok(Date.now()-first>=1200&&Date.now()-first<2300,
        'Output iterator grace period should be bounded without user intervention');
    const follow='after stalled reader';
    scenarios.set(follow,{chunks:['after\n'],delayMs:20});
    assert.equal((await manager.execute('simulation',follow,2200)).exit_code,0);
    assert.equal(inputs.filter(x=>x.command===hung||x.command===follow).length,0);
    assert.equal(interactiveReadyForQuit('less','arbitrary first output'),false);
    assert.equal(interactiveReadyForQuit('more','-- Más --'),true);
    console.log('PASS: '+recognized.length+' allowed and '+rejected.length+
        ' rejected command patterns; '+testCount+' screen simulations; '+
        'no synthetic q on help/batch/plain output; bounded post-completion drain');
 }finally{
    manager.dispose(true);
    fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});