import { spawn, ChildProcess } from 'node:child_process';
import type { ShellExecutionResult } from '../shell-manager';

const MAX_OUTPUT=1_000_000;
const MAX_TIMEOUT=3_600_000;

/** Run non-interactive work outside the integrated terminal's shell integration.
 * This intentionally does not share terminal variables, aliases or shell history.
 * A selected shell ID supplies only the owning window and canonical cwd.
 */
export function runIsolatedCommand(shellId:string,cwd:string,command:string,timeoutMs=120000,signal?:AbortSignal):Promise<ShellExecutionResult>{
    if(!command.trim()){throw new Error('Empty isolated command.');}
    if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>MAX_TIMEOUT){
        throw new Error('timeout must be an integer 1000..3600000 ms.');
    }
    if(signal?.aborted){throw new Error('Isolated command cancelled before execution.');}
    const windows=process.platform==='win32';
    const executable=windows?'powershell.exe':'/bin/sh';
    const args=windows?['-NoLogo','-NoProfile','-NonInteractive','-Command',command]:['-c',command];
    // Never request a pager or an interactive Git authentication prompt.
    // TERM=dumb discourages screen-mode programs, while stdio=pipe/ignore
    // keeps the isolated process independent of the user's VS Code terminal.
    const env={...process.env,GIT_PAGER:'cat',PAGER:'cat',GIT_TERMINAL_PROMPT:'0',TERM:'dumb'};
    return new Promise<ShellExecutionResult>((resolve,reject)=>{
        let child:ChildProcess;
        try{
            child=spawn(executable,args,{cwd,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:!windows,env});
        }catch(error){reject(error);return;}
        let output='',truncated=false,settled=false;
        let stopReason:string|undefined;
        let killFallback:ReturnType<typeof setTimeout>|undefined;
        const append=(chunk:Buffer|string)=>{
            const text=String(chunk);
            const room=MAX_OUTPUT-output.length;
            if(room>0){output+=text.slice(0,room);}
            if(text.length>room){truncated=true;}
        };
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data',append);
        child.stderr?.on('data',append);
        const cleanup=()=>{
            clearTimeout(timer);
            if(killFallback){clearTimeout(killFallback);}
            signal?.removeEventListener('abort',abort);
        };
        const settle=(error?:Error,code?:number|null)=>{
            if(settled){return;}
            settled=true;
            cleanup();
            if(error){reject(error);}
            else{
                resolve({shell_id:shellId,command,output,exit_code:code??undefined,
                    truncated,output_incomplete:false});
            }
        };
        const killTree=()=>{
            if(!child.pid){return;}
            if(windows){
                try{
                    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],
                        {windowsHide:true,stdio:'ignore'});
                    killer.on('error',()=>{try{child.kill('SIGKILL');}catch{}});
                    killer.unref();
                }catch{try{child.kill('SIGKILL');}catch{}}
            }else{
                try{process.kill(-child.pid,'SIGKILL');}
                catch{try{child.kill('SIGKILL');}catch{}}
            }
        };
        const stop=(reason:string)=>{
            if(stopReason||settled){return;}
            stopReason=reason;
            killTree();
            killFallback=setTimeout(()=>{
                try{child.kill('SIGKILL');}catch{}
                child.stdout?.destroy();
                child.stderr?.destroy();
                settle(new Error(reason+' Process termination could not be confirmed.'));
            },3000);
        };
        const abort=()=>stop('Isolated command cancelled.');
        const timer=setTimeout(()=>stop('Isolated command timed out after '+timeoutMs+' ms.'),timeoutMs);
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted){abort();}
        child.once('error',error=>settle(error));
        child.once('close',code=>settle(stopReason?new Error(stopReason):undefined,code));
    });
}