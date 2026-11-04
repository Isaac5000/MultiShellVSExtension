import * as fs from 'fs';
import * as path from 'path';
import {createHash} from 'crypto';
import {execFile} from 'child_process';
import {promisify} from 'util';

const exec=promisify(execFile);

/** Persistent identity: PID alone can refer to an unrelated process after a reload. */
export interface TunnelProcessIdentity {
    pid:number;
    started:string;
    executable:string;
    commandHash:string;
}

function samePath(a:string,b:string,platform:string):boolean{
    const clean=(value:string)=>path.normalize(value).replace(/[\\/]+$/,'');
    return platform==='win32'?clean(a).toLowerCase()===clean(b).toLowerCase():
        clean(a)===clean(b);
}
async function inspectProcess(pid:number,platform:string):
Promise<{started:string;executable:string;command:string}|undefined>{
    if(!Number.isSafeInteger(pid)||pid<=0){return undefined;}
    try{
        if(platform==='linux'){
            const base='/proc/'+pid;
            const [stat,exe,cmd,boot]=await Promise.all([
                fs.promises.readFile(base+'/stat','utf8'),
                fs.promises.realpath(base+'/exe'),
                fs.promises.readFile(base+'/cmdline','utf8'),
                fs.promises.readFile('/proc/sys/kernel/random/boot_id','utf8')
            ]);
            const tail=stat.slice(stat.lastIndexOf(')')+1).trim().split(/\s+/);
            const start=tail[19]; // /proc/<pid>/stat field 22 (starttime).
            if(!start||!cmd){return undefined;}
            return {started:boot.trim()+':'+start,executable:exe,command:cmd};
        }
        if(platform==='win32'){
            // PID is coerced to an integer; never interpolate user input into
            // a PowerShell command. No environment or credentials are queried.
            const script='$p=Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+
                '" -ErrorAction Stop; if($null -ne $p){@{started=[string]$p.CreationDate.ToUniversalTime().Ticks;'+
                'executable=[string]$p.ExecutablePath;command=[string]$p.CommandLine}'+
                '| ConvertTo-Json -Compress}';
            const {stdout}=await exec('powershell.exe',
                ['-NoProfile','-NonInteractive','-Command',script],
                {windowsHide:true,timeout:5000,maxBuffer:65536});
            if(!stdout.trim()){return undefined;}
            const result=JSON.parse(stdout) as {started?:string;executable?:string;command?:string};
            if(!result.started||!result.executable||!result.command){return undefined;}
            return {started:result.started,executable:result.executable,command:result.command};
        }
        if(platform==='darwin'){
            const {stdout}=await exec('/bin/ps',
                ['-ww','-p',String(pid),'-o','lstart=','-o','command='],
                {timeout:4000,maxBuffer:65536});
            const line=stdout.trim();
            // Standard ps lstart format: "Mon Nov  3 17:01:02 2026".
            const match=/^(\w{3}\s+\w{3}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/s.exec(line);
            if(!match){return undefined;}
            const command=match[2].trim();
            const executable=command.startsWith('"')?
                command.slice(1,command.indexOf('"',1)):command.split(/\s+/)[0];
            if(!path.isAbsolute(executable)){return undefined;}
            return {started:match[1].replace(/\s+/g,' '),executable,command};
        }
    }catch{/* Missing access, tooling or metadata: fail closed. */}
    return undefined;
}

/** Read-only process attestation. Will not adopt if start time, executable,
 * run invocation or profile options cannot be verified. */
export async function readTunnelProcessIdentity(pid:number,expectedExe:string,
    platform=process.platform):Promise<TunnelProcessIdentity|undefined>{
    try{
        const details=await inspectProcess(pid,platform);
        if(!details){return undefined;}
        const expected=await fs.promises.realpath(expectedExe);
        const actual=await fs.promises.realpath(details.executable);
        if(!samePath(actual,expected,platform)){return undefined;}
        if(platform==='linux'){
            const args=details.command.split('\0');
            if(!args.includes('run')||
                !(args.includes('--profile')||args.includes('--profile-file'))){return undefined;}
        }else{
            if(!/\brun\b/.test(details.command)||
                !/--profile(?:-file)?(?:\s|=)/.test(details.command)){return undefined;}
        }
        return {
            pid,started:details.started,executable:actual,
            commandHash:createHash('sha256').update(details.command).digest('hex')
        };
    }catch{return undefined;}
}
export function sameTunnelProcess(a:TunnelProcessIdentity|undefined,
    b:TunnelProcessIdentity|undefined):boolean{
    return !!a&&!!b&&a.pid===b.pid&&a.started===b.started&&
        a.executable===b.executable&&a.commandHash===b.commandHash;
}
