import {randomUUID} from 'crypto';
import type {ShellExecutionResult} from './shell-manager';
import {runIsolatedCommand} from './tools/isolated-command';

export type BackgroundJobState='running'|'cancelling'|'completed'|'cancelled'|'failed';
export interface BackgroundJobSnapshot {
    job_id:string;
    shell_id:string;
    mode:'isolated';
    status:BackgroundJobState;
    command_label:string;
    started_at:number;
    finished_at?:number;
    elapsed_ms:number;
    timeout_ms:number;
    last_output_at?:number;
    output_tail:string;
    truncated:boolean;
    exit_code?:number;
    error?:string;
    input_hint?:string;
}
export type BackgroundExecutor=(shell:string,cwd:string,command:string,
    timeout:number,signal:AbortSignal,onOutput:(chunk:string)=>void)=>Promise<ShellExecutionResult>;
interface RecordJob{
    id:string;
    shellId:string;
    controller:AbortController;
    status:BackgroundJobState;
    startedAt:number;
    finishedAt?:number;
    lastOutputAt?:number;
    timeout:number;
    label:string;
    outputTail:string;
    truncated:boolean;
    exitCode?:number;
    error?:string;
    hint?:string;
    settled:Promise<void>;
}
const RETENTION_MS=30*60*1000;
const MAX_ACTIVE=12;
const MAX_STORED=96;
const MAX_TAIL=16384;

/** Jobs are owned by the VS Code window running the isolated process.
 * A hub replacement does not restart them. There is deliberately no
 * auto-retry or automatic input to a process that might still be running.
 */
export class BackgroundJobManager{
    private readonly jobs=new Map<string,RecordJob>();
    private readonly revokedJobs=new Set<Promise<void>>();
    private stopping=false;
    constructor(private readonly executor:BackgroundExecutor=runIsolatedCommand,
        private readonly detectHint:(text:string)=>string|undefined=()=>undefined){}
    private prune():void{
        const now=Date.now();
        for(const [id,job] of this.jobs){
            if(job.finishedAt&&now-job.finishedAt>RETENTION_MS){this.jobs.delete(id);}
        }
        if(this.jobs.size<MAX_STORED){return;}
        for(const [id,job] of this.jobs){
            if(this.jobs.size<MAX_STORED){break;}
            if(job.finishedAt){this.jobs.delete(id);}
        }
    }
    private snapshot(job:RecordJob,maxChars=4096):BackgroundJobSnapshot{
        const size=Number.isInteger(maxChars)?Math.min(Math.max(maxChars,1),MAX_TAIL):4096;
        return {
            job_id:job.id,shell_id:job.shellId,mode:'isolated',status:job.status,
            command_label:job.label,started_at:job.startedAt,
            ...(job.finishedAt?{finished_at:job.finishedAt}:{}),
            elapsed_ms:Math.max(0,(job.finishedAt||Date.now())-job.startedAt),
            timeout_ms:job.timeout,
            ...(job.lastOutputAt?{last_output_at:job.lastOutputAt}:{}),
            output_tail:job.outputTail.slice(-size),
            truncated:job.truncated||job.outputTail.length>size,
            ...(job.exitCode!==undefined?{exit_code:job.exitCode}:{}),
            ...(job.error?{error:job.error}:{}),
            ...(job.hint?{input_hint:job.hint}:{})
        };
    }
    private find(shellId:string,id:string):RecordJob{
        const job=this.jobs.get(id);
        if(!job||job.shellId!==shellId){throw new Error('Unknown background job for the selected shell.');}
        return job;
    }
    start(shellId:string,cwd:string,command:string,timeout=120000,requestedId?:string):BackgroundJobSnapshot{
        if(this.stopping){throw new Error('Background job manager is stopping.');}
        if(typeof command!=='string'||!command.trim()){throw new Error('Empty background command.');}
        if(!Number.isInteger(timeout)||timeout<1000||timeout>3600000){
            throw new Error('Background timeout must be an integer between 1000 and 3600000 ms.');
        }
        // Refuse known interactive commands; stdio is piped and stdin ignored.
        // No automatic credentials, Enter, q or Ctrl+C are ever injected.
        const trimmed=command.trim();
        if(/^(?:less|more|man|top|htop|btop|bpytop|nvtop|iotop|iftop|tig|vi|vim|nano|sudo|su|ssh|sftp|passwd|ftp|telnet)(?:\s|$)/i.test(trimmed)||
            /\bRead-Host\b/i.test(trimmed)||/\b(?:pause|choice)\s*(?:$|[;&|])/i.test(trimmed)){
            throw new Error('Known interactive command rejected from background execution; use an explicit non-interactive command instead.');
        }
        if(requestedId!==undefined&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)||this.jobs.has(requestedId))){
            throw new Error('Invalid or duplicate background job identifier.');
        }
        this.prune();
        if(this.jobs.size>=MAX_STORED){throw new Error('Background job history capacity reached.');}
        const active=[...this.jobs.values()].filter(job=>!job.finishedAt).length;
        if(active>=MAX_ACTIVE){throw new Error('Too many concurrent background jobs in this VS Code window.');}
        const job:RecordJob={
            id:requestedId||randomUUID(),shellId,controller:new AbortController(),
            status:'running',startedAt:Date.now(),timeout,
            // Only show recognized executable names; arguments can contain secrets.
            label:/^(?:npm|npx|pnpm|yarn|node|git|python|python3|pip|pip3|cargo|go|dotnet|mvn|gradle|make|cmake|pytest|tsc)(?=\s|$)/i.exec(trimmed)?.[0].toLowerCase()||'isolated',
            outputTail:'',truncated:false,settled:Promise.resolve()
        };
        this.jobs.set(job.id,job);
        const onOutput=(chunk:string)=>{
            if(!chunk){return;}
            job.lastOutputAt=Date.now();
            if(job.outputTail.length+chunk.length>MAX_TAIL){job.truncated=true;}
            job.outputTail=(job.outputTail+chunk).slice(-MAX_TAIL);
            job.hint=this.detectHint(job.outputTail);
        };
        job.settled=Promise.resolve().then(()=>this.executor(shellId,cwd,command,timeout,
            job.controller.signal,onOutput)).then(result=>{
            job.status=job.controller.signal.aborted?'cancelled':
                result.exit_code===0?'completed':'failed';
            job.exitCode=result.exit_code;
            job.truncated=job.truncated||result.truncated===true;
            if(!job.outputTail&&result.output){onOutput(result.output);}
            if(job.status==='failed'){job.error='Isolated command exited with a non-zero status.';}
        },error=>{
            job.status=job.controller.signal.aborted?'cancelled':'failed';
            job.error=error instanceof Error?error.message:String(error);
        }).finally(()=>{job.finishedAt=Date.now();});
        return this.snapshot(job);
    }
    status(shellId:string,id:string,maxChars=4096):BackgroundJobSnapshot{
        this.prune();
        return this.snapshot(this.find(shellId,id),maxChars);
    }
    list(shellId:string,max=20):BackgroundJobSnapshot[]{
        this.prune();
        const limit=Number.isInteger(max)?Math.min(Math.max(max,1),50):20;
        return [...this.jobs.values()].filter(job=>job.shellId===shellId)
            .slice(-limit).reverse().map(job=>this.snapshot(job,512));
    }
    cancel(shellId:string,id:string):BackgroundJobSnapshot{
        const job=this.find(shellId,id);
        if(job.status==='running'){
            job.status='cancelling';
            job.controller.abort();
        }
        return this.snapshot(job);
    }
    /** A removed shell ID must not expose an old job if the ID is reused. */
    revokeShell(shellId:string):void{
        for(const [id,job] of this.jobs){
            if(job.shellId!==shellId){continue;}
            if(!job.finishedAt){
                job.controller.abort();
                this.revokedJobs.add(job.settled);
                void job.settled.finally(()=>this.revokedJobs.delete(job.settled));
            }
            this.jobs.delete(id);
        }
    }
    revokeMissingShells(live:ReadonlySet<string>):void{
        for(const job of this.jobs.values()){
            if(!live.has(job.shellId)){this.revokeShell(job.shellId);}
        }
    }
    async stop():Promise<void>{
        this.stopping=true;
        const active=[...this.jobs.values()].filter(job=>!job.finishedAt);
        for(const job of active){
            if(job.status==='running'){job.status='cancelling';job.controller.abort();}
        }
        const pending=[...active.map(job=>job.settled),...this.revokedJobs];
        if(!pending.length){return;}
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{
            await Promise.race([
                Promise.allSettled(pending),
                new Promise<void>(resolve=>{timer=setTimeout(resolve,4500);})
            ]);
        }finally{if(timer){clearTimeout(timer);}}
    }
}
