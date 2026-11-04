import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { inspectPowerShellReadiness, ShellReadiness } from './shell-readiness';

export type ShellOrigin = 'user' | 'mcp' | 'automatic';
export interface SavedUserShell {shell_id:string; initial_cwd:string; alias?:string;}
/** Evidence that a specific physical terminal had no active work at unload.
 * Never trust this without also matching the restored process ID and cwd. */
export interface SavedIdleProof {initial_cwd:string; process_id:number; saved_at:number;}

export type ShellRecoveryReason = 'restored_unverified' | 'ambiguous_completion' | 'unverified_execution';
export type ShellExecutionPhase =
    'waiting_for_integration' | 'running' | 'waiting_for_completion' |
    'output_error_waiting_for_completion' | 'draining_output' | 'timed_out_preserved';
export type ShellInputHint = 'pager' | 'confirmation' | 'credentials' | 'continuation';

export interface ShellDescription {
    /** A manually started terminal command is active, not an MCP queue item. */
    external_busy?: boolean;
    recovery_reason?: ShellRecoveryReason;
    /** Best-effort observations, not proof that a process is waiting for input. */
    execution_phase?: ShellExecutionPhase;
    input_wait_hint?: ShellInputHint;
    /** Seconds since the last captured output; can include legitimate silent work. */
    output_silent_seconds?: number;
    origin: ShellOrigin;
    timed_out_running: boolean;
    recovery_required: boolean;
    shell_id: string;
    initial_cwd: string;
    window_id?: string;
    /** Stable, nonsecret fingerprint for the local MultiShell installation. */
    machine_id?: string;
    alias?: string;
    busy: boolean;
    queued: number;
    auto_exit_interactive?: boolean;
    auto_exit_override?: boolean;
}
export interface ShellExecutionResult {
    shell_id: string;
    command: string;
    output: string;
    exit_code: number | undefined;
    truncated: boolean;
    output_incomplete?: boolean;
}
interface ShellEntry {
    id: string;
    cwd: string;
    origin: ShellOrigin;
    timedOutRunning: boolean;
    recoveryRequired: boolean;
    recoveryReason?: ShellRecoveryReason;
    executionPhase?: ShellExecutionPhase;
    inputWaitHint?: ShellInputHint;
    lastOutputAt?: number;
    queuedCancels:Set<(reason?:string)=>void>;
    terminal: vscode.Terminal;
    queued: number;
    active: boolean;
    closed: boolean;
    queue: Promise<void>;
    confirmIdleAfterTimeout?:()=>void;
    detachExecution?:()=>void;
    createdByManager?:boolean;
    commandInvoked?:boolean;
    currentExecution?:vscode.TerminalShellExecution;
}
const SHELL_ID = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
const MAX_OUTPUT = 1_000_000;
const MAX_TIMEOUT = 3_600_000;

/** Classify potential interactive prompts without ever sending input. A
 * prompt is only an observation: program output can contain these strings as
 * ordinary text. Keep this classifier separate from automatic pager exit. */
export function detectInputWaitHint(recentOutput:string):ShellInputHint|undefined {
    const plain=recentOutput.slice(-8192)
        .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g,'')
        .replace(/\r/g,'\n').trimEnd();
    // PowerShell's secondary prompt often ends in >> when quotes, braces
    // or command syntax were left incomplete. This is informational only;
    // never inject Enter, Ctrl+C or q to guess how to recover.
    if(/(?:^|\n)>>$/.test(plain)){return 'continuation';}
    if(/(?:\(END\)|(?:^|\n):|--\s*(?:More|Más|Mehr|Plus|Mais|Altro)\s*--)$/i.test(plain)){
        return 'pager';
    }
    if(/(?:password|passphrase|contraseña|introduce la clave|enter passphrase)(?:\s+for\s+[^\n:]+)?\s*:\s*$/i.test(plain)){
        return 'credentials';
    }
    if(/(?:\[(?:Y\/n|y\/N|s\/N|S\/n|yes\/no)\]|\((?:y\/n|yes\/no|s\/n)\)|press (?:any key|enter) to continue(?:[.\s…]*)|pulsa (?:una tecla|intro) para continuar)\s*[:?]?$/i.test(plain)){
        return 'confirmation';
    }
    return undefined;
}

/** Do not infer foreground-pager identity from an ambiguously escaped shell
 * command. Quoting rules differ between PowerShell, CMD and POSIX shells.
 * Fail closed instead of injecting 'q' into a command that might be waiting
 * for a continuation prompt or might run a different program.
 *
 * This does NOT block a user's explicit command: it only disables automatic
 * keystrokes when parsing is ambiguous. The active process stays preserved.
 */
export function hasAmbiguousInteractiveEscapes(command:string):boolean {
    let quote:"'"|'"'|undefined;
    for(let i=0;i<command.length;i++){
        const char=command[i];
        const code=char.charCodeAt(0);
        if(code<32||code===127){return true;}
        if(char==="'"||char==='"'){
            if(!quote){quote=char;}
            else if(quote===char){quote=undefined;}
            continue;
        }
        if(char==='\\'){
            const next=command[i+1];
            // Shell-dependent escaped quotes, spaces and operators are not
            // safe evidence of a standalone pager command.
            if(next===undefined||/[\s"'`$;|&<>(){}\[\]]/.test(next)){return true;}
        }
    }
    return quote!==undefined;
}

/** Only standalone allowlisted programs may receive q, and only if their
 * observed output independently confirms a pager/full-screen interface.
 */
export function recognizedInteractiveCommand(command:string):string|undefined {
    // Reject malformed raw input BEFORE trim(): leading/trailing control
    // sequences must not be hidden by whitespace normalization.
    if(hasAmbiguousInteractiveEscapes(command)){return undefined;}
    const trimmed=command.trim();
    if(/[\r\n;|&<>\x60$()]/.test(trimmed)){return undefined;}
    const match=/^(?:(?:\/usr\/bin\/|\/bin\/)?)(less|more|top|htop|man|btop|bpytop|nvtop|iftop|iotop|tig)(?=\s|$)/i.exec(trimmed);
    if(!match){return undefined;}
    const program=match[1].toLowerCase();
    const args=trimmed.slice(match[0].length).trim().match(/"[^"]*"|'[^']*'|\S+/g)??[];
    const flags=args.filter(arg=>arg.startsWith('-')||arg==='/?');
    if(flags.some(arg=>/^(?:--help|--version|--usage|-h|-V|-\?|\/\?)$/i.test(arg))){return undefined;}
    // Finite/batch modes and metadata queries must never receive q.
    if(program==='top'&&flags.some(arg=>/^(?:--batch|--iterations(?:=.*)?)$/i.test(arg)||(/^-[^-]/.test(arg)&&/[bn]/.test(arg.slice(1))))){return undefined;}
    if(program==='iotop'&&flags.some(arg=>/^(?:--batch|--iter(?:=.*)?)$/i.test(arg)||(/^-[^-]/.test(arg)&&/[bn]/.test(arg.slice(1))))){return undefined;}
    if(program==='man'&&flags.some(arg=>(/^-[^-]/.test(arg)&&/[wfkKP]/.test(arg.slice(1)))||/^--(?:where|path|whatis|apropos|global-apropos|pager)(?:=.*)?$|^--no-pager$/i.test(arg))){return undefined;}
    if(program==='less'&&flags.some(arg=>/^(?:--quit-if-one-screen|-F)$/i.test(arg))){return undefined;}
    return program;
}

/** A specific interactive prompt or full-screen entry must be observed.
 * Arbitrary first output, help/version text or batch output is insufficient.
 * This is best effort: VS Code does not expose the foreground process identity
 * atomically with sendText().
 */
export function interactiveReadyForQuit(program:string,recentOutput:string):boolean {
    const tail=recentOutput.slice(-8192);
    const altScreen=/\x1b\[\?(?:1049|1047|47)h/.test(tail);
    const plain=tail.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g,'').replace(/[\r\n]/g,'\n');
    switch(program){
        case 'more':
            return /--\s*(?:More|Más|Mehr|Plus|Mais|Altro)\s*--\s*$/i.test(plain);
        case 'less':
        case 'man':
            return /(?:\(END\)|(?:^|\n):)\s*$/i.test(plain);
        case 'top':
            return /\btop\s*-\s*\d{1,2}:\d{2}/i.test(plain)&&
                /(?:Tasks:|Cpu\(s\):|%Cpu|MiB Mem|KiB Mem|Mem\s*:)/i.test(plain);
        case 'htop':
        case 'btop':
        case 'bpytop':
        case 'nvtop':
        case 'iftop':
        case 'iotop':
        case 'tig':
            return altScreen;
        default:return false;
    }
}

/**
 * No implicit active terminal and no inferred ChatGPT conversation identity.
 * Commands are FIFO per shell, concurrent across different shell IDs.
 * Temporary MCP-owned terminals close on timeout. User-created and primary
 * terminals preserve their processes and FIFO until the command really ends.
 */
export class ShellManager implements vscode.Disposable {
    private readonly shells = new Map<string, ShellEntry>();
    private readonly closeListener: vscode.Disposable;
    private readonly recoveryStartListener?: vscode.Disposable;
    private readonly recoveryEndListener?: vscode.Disposable;
    private readonly observedExecutions=new WeakMap<vscode.Terminal,Set<vscode.TerminalShellExecution>>();
    /** Completion events may arrive while VS Code is still reattaching terminals. */
    private readonly observedIdle=new WeakMap<vscode.Terminal,boolean>();
    private readonly activityRevisions=new WeakMap<vscode.Terminal,number>();
    private recoveryWork?:Promise<string[]>;
    private disposed = false;
    private windowInteractiveAutoExit=true;
    private readonly idleProofs=new Map<string,SavedIdleProof>();
    private readonly interactiveOverrides=new Map<string,boolean>();
    private idleStateListener?:()=>void;

    /** The extension persists evidence on real activity changes, not only
     * during deactivate(), which Reload Window does not always await. */
    setIdleStateListener(listener:(()=>void)|undefined):void {
        this.idleStateListener=listener;
    }
    private notifyIdleState():void {
        try{this.idleStateListener?.();}catch{}
    }

    private preserveOnTimeout(entry: ShellEntry): boolean {
        return entry.origin==='user' || (entry.origin==='automatic' && entry.id.startsWith('main-'));
    }

    setInteractivePolicy(windowEnabled:boolean,overrides:Record<string,boolean>={}):void {
        this.windowInteractiveAutoExit=windowEnabled;
        this.interactiveOverrides.clear();
        for(const [id,value] of Object.entries(overrides)){
            if(SHELL_ID.test(id)&&typeof value==='boolean'){this.interactiveOverrides.set(id,value);}
        }
    }
    setWindowInteractiveAutoExit(enabled:boolean):void{
        this.windowInteractiveAutoExit=enabled;
    }
    get windowAutoExit():boolean{return this.windowInteractiveAutoExit;}
    setShellInteractiveAutoExit(id:string,value:boolean|undefined):void{
        this.validateId(id);
        if(!this.shells.has(id)){throw new Error('Unknown shell ID: '+id);}
        if(value===undefined){this.interactiveOverrides.delete(id);}
        else{this.interactiveOverrides.set(id,value);}
    }
    getInteractiveOverrides():Record<string,boolean>{
        return Object.fromEntries(this.interactiveOverrides);
    }
    private autoExitEnabled(id:string):boolean{
        return this.interactiveOverrides.get(id)??this.windowInteractiveAutoExit;
    }
    /** A VS Code terminal is also writable by the user. Never inject a new
     * MCP command while shell integration reports another command running. */
    private guardExternalExecution(entry:ShellEntry):void{
        if((this.observedExecutions.get(entry.terminal)?.size||0)>0){
            throw new Error('Terminal "'+entry.id+'" is running a command outside its MCP queue. Wait for its completion; no interrupt was sent.');
        }
        if(this.observedIdle.get(entry.terminal)===false){
            entry.recoveryRequired=true;
            entry.recoveryReason='unverified_execution';
            this.notifyIdleState();
            throw new Error('Terminal "'+entry.id+'" has an ambiguous execution state. Automatic idle verification will retry; no input was sent.');
        }
    }

    setSavedIdleProofs(proofs:Record<string,SavedIdleProof>):void{
        this.idleProofs.clear();
        for(const [id,proof] of Object.entries(proofs||{})){
            if(!SHELL_ID.test(id)||!proof||typeof proof.initial_cwd!=='string'||
                !path.isAbsolute(proof.initial_cwd)||
                !Number.isSafeInteger(proof.process_id)||proof.process_id<=0||
                !Number.isSafeInteger(proof.saved_at)||
                Math.abs(Date.now()-proof.saved_at)>120_000){continue;}
            this.idleProofs.set(id,proof);
        }
    }
    private sameCwd(a:string,b:string):boolean{
        const left=process.platform==='win32'?a.toLowerCase():a;
        const right=process.platform==='win32'?b.toLowerCase():b;
        return left===right;
    }
    private async terminalProcessId(terminal:vscode.Terminal):Promise<number|undefined>{
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{
            if(!terminal.processId){return undefined;}
            const result=await Promise.race([
                terminal.processId,
                new Promise<undefined>(resolve=>{
                    timer=setTimeout(()=>resolve(undefined),850);
                })
            ]);
            return typeof result==='number'&&Number.isSafeInteger(result)&&result>0
                ?result:undefined;
        }catch{return undefined;}
        finally{if(timer){clearTimeout(timer);}}
    }
    /** Persist only shells with a confirmed no-work state; no probing or signals. */
    async snapshotSafeIdleProofs():Promise<Record<string,SavedIdleProof>>{
        const proofs:Record<string,SavedIdleProof>={};
        const eligible=(entry:ShellEntry)=>
            !entry.closed&&!entry.active&&!entry.queued&&!entry.timedOutRunning&&
            !entry.recoveryRequired&&
            (entry.origin==='user'||this.preserveOnTimeout(entry))&&
            ((this.observedIdle.get(entry.terminal)===true&&
                 !!entry.terminal.shellIntegration)||
                (entry.createdByManager===true&&!entry.commandInvoked&&
                 entry.terminal.state?.isInteractedWith===false))&&
            (this.observedExecutions.get(entry.terminal)?.size||0)===0;
        // Parallel PID lookups keep the shutdown bounded by one 850ms timeout,
        // regardless of the number of persistent terminals.
        await Promise.all([...this.shells.values()].filter(eligible).map(async entry=>{
            const process_id=await this.terminalProcessId(entry.terminal);
            // A new command might have started while processId was resolving.
            if(process_id!==undefined&&eligible(entry)){
                proofs[entry.id]={initial_cwd:entry.cwd,process_id,saved_at:Date.now()};
            }
        }));
        return proofs;
    }
    /** Reconcile stale state from shell-side readiness or saved process
     * evidence. New foreground activity invalidates asynchronous inspections. */
    async resumeProvenIdleTerminals():Promise<string[]>{
        if(this.recoveryWork){return this.recoveryWork;}
        const work=this.resumeIdleTerminals();
        this.recoveryWork=work;
        try{return await work;}
        finally{if(this.recoveryWork===work){this.recoveryWork=undefined;}}
    }
    private async resumeIdleTerminals():Promise<string[]>{
        const resumed:string[]=[];
        // Public shell events can be lost on reload or cancellation. Inspect
        // the actual foreground runspace, not CPU use, silence or child counts.
        await Promise.all([...this.shells.values()].filter(entry=>
            !entry.closed&&(entry.recoveryRequired||entry.timedOutRunning||
                (!entry.active&&((this.observedExecutions.get(entry.terminal)?.size||0)>0||
                    this.observedIdle.get(entry.terminal)===false))||
                entry.executionPhase==='waiting_for_completion'||
                entry.executionPhase==='output_error_waiting_for_completion')
        ).map(async entry=>{
            const revision=this.activityRevisions.get(entry.terminal)||0;
            const pid=await this.terminalProcessId(entry.terminal);
            if(pid===undefined){return;}
            let readiness:ShellReadiness;
            try{readiness=await this.inspectReadiness(pid);}
            catch{readiness='unknown';}
            if(this.disposed||entry.closed||
                this.shells.get(entry.id)!==entry||
                (this.activityRevisions.get(entry.terminal)||0)!==revision){return;}
            if(readiness==='busy'){return;}
            if(readiness!=='idle'){
                // A failed PowerShell inspection must not resurrect an old idle
                // snapshot. Legacy proof applies only to unsupported shells.
                if(readiness!=='unsupported'){return;}
                const proof=this.idleProofs.get(entry.id);
                if(!entry.recoveryRequired||entry.active||entry.queued||entry.timedOutRunning||
                    this.observedIdle.get(entry.terminal)===false||
                    (this.observedExecutions.get(entry.terminal)?.size||0)>0||
                    !proof||pid!==proof.process_id||!this.sameCwd(proof.initial_cwd,entry.cwd)){return;}
            }
            // A foreground start during the asynchronous inspection invalidates
            // its proof. An idle runspace reconciles only the older snapshot.
            this.observedExecutions.delete(entry.terminal);
            this.observedIdle.set(entry.terminal,true);
            entry.recoveryRequired=false;
            entry.recoveryReason=undefined;
            entry.confirmIdleAfterTimeout?.();
            this.idleProofs.delete(entry.id);
            if(!resumed.includes(entry.id)){resumed.push(entry.id);}
        }));
        if(resumed.length){this.notifyIdleState();}
        return resumed;
    }
    /** A fallback main may be retired only if this extension created it
     * recently and no MCP command or observed terminal execution ever ran. */
    canRetireUnusedFallbackMain(id:string):boolean{
        const entry=this.shells.get(id);
        return !!entry&&entry.origin==='automatic'&&entry.id.startsWith('main-')&&
            entry.createdByManager===true&&entry.commandInvoked!==true&&
            entry.terminal.state?.isInteractedWith===false&&
            !entry.active&&!entry.queued&&!entry.timedOutRunning&&!entry.recoveryRequired&&
            this.observedIdle.get(entry.terminal)!==false&&
            (this.observedExecutions.get(entry.terminal)?.size||0)===0;
    }
    retireUnusedFallbackMain(id:string):boolean{
        if(!this.canRetireUnusedFallbackMain(id)){return false;}
        this.close(id);
        return true;
    }

    constructor(private readonly inspectReadiness:(pid:number)=>Promise<ShellReadiness>=inspectPowerShellReadiness) {
        // There is no reliable public VS Code "is terminal idle" property.
        // Shell events and separate runspace inspections provide idle proof.
        // Never probe by executing text in the terminal: executeCommand()
        // can send Ctrl+C and interrupt a preserved user process.
        if(typeof vscode.window.onDidStartTerminalShellExecution==='function'){
            this.recoveryStartListener=vscode.window.onDidStartTerminalShellExecution(event=>{
                this.activityRevisions.set(event.terminal,(this.activityRevisions.get(event.terminal)||0)+1);
                let active=this.observedExecutions.get(event.terminal);
                if(!active){
                    active=new Set();
                    this.observedExecutions.set(event.terminal,active);
                }
                active.add(event.execution);
                this.observedIdle.set(event.terminal,false);
                if([...this.shells.values()].some(e=>e.terminal===event.terminal)){
                    this.notifyIdleState();
                }
            });
        }
        if(typeof vscode.window.onDidEndTerminalShellExecution==='function'){
            this.recoveryEndListener=vscode.window.onDidEndTerminalShellExecution(event=>{
                this.activityRevisions.set(event.terminal,(this.activityRevisions.get(event.terminal)||0)+1);
                const active=this.observedExecutions.get(event.terminal);
                active?.delete(event.execution);
                // VS Code documents undefined exit codes for cancelled commands
                // and for a subshell starting without the original completing.
                // Those events are not sufficient to prove the terminal is idle.
                const definiteEnd=typeof event.exitCode==='number' &&
                    (!active || active.size===0);
                this.observedIdle.set(event.terminal,definiteEnd);
                if(!definiteEnd){
                    // An undefined exit code is not proof the command is still running,
                    // but neither can the extension safely prove the terminal idle.
                    for(const entry of this.shells.values()){
                        if(entry.terminal===event.terminal && !entry.closed && !entry.active){
                            entry.recoveryRequired=true;
                            entry.recoveryReason='ambiguous_completion';
                        }
                    }
                }
                if([...this.shells.values()].some(e=>e.terminal===event.terminal)){
                    this.notifyIdleState();
                }
                if(!definiteEnd){return;}
                for(const entry of this.shells.values()){
                    if(entry.terminal===event.terminal &&
                        entry.recoveryRequired && !entry.closed &&
                        !entry.active && entry.queued===0){
                        entry.recoveryRequired=false;
                        entry.recoveryReason=undefined;
                        this.notifyIdleState();
                        break;
                    }
                }
            });
        }
        this.closeListener = vscode.window.onDidCloseTerminal(terminal => {
            for (const entry of this.shells.values()) {
                if (entry.terminal === terminal) {
                    entry.closed = true;
                    this.shells.delete(entry.id);
                    this.interactiveOverrides.delete(entry.id);
                    this.notifyIdleState();
                    break;
                }
            }
        });
    }
    /** Return the exact terminal IDs created previously for this workspace.
     * Never adopt unrelated terminals or shells belonging to another workspace. */
    private restoredMainCandidates(workspace: string, preferredId?:string): Array<{id:string;terminal:vscode.Terminal}> {
        const name=(path.basename(workspace)||'window').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
        const prefix='MCP [main-'+name+'-';
        const candidates:Array<{id:string;terminal:vscode.Terminal}>=[];
        const known=vscode.window.terminals||[];
        const counts=new Map<string,number>();
        for(const t of known){counts.set(t.name,(counts.get(t.name)||0)+1);}
        const physicalRoot=fs.realpathSync(workspace);
        const same=(a:string,b:string)=>process.platform==='win32'
            ?a.toLowerCase()===b.toLowerCase():a===b;
        for(const terminal of known) {
            if(!terminal.name.startsWith(prefix)||!terminal.name.endsWith(']')){continue;}
            const id=terminal.name.slice(5,-1);
            if(!/^main-[A-Za-z0-9_-]+-[a-f0-9]{8}$/.test(id)||
                terminal.name!=='MCP ['+id+']'||counts.get(terminal.name)!==1){continue;}
            const options=terminal.creationOptions as vscode.TerminalOptions|undefined;
            const original=options?.cwd;
            const declared=typeof original==='string'?original:original?.fsPath;
            if(declared){
                if(!path.isAbsolute(declared)){continue;}
                try{if(!same(fs.realpathSync(declared),physicalRoot)){continue;}}
                catch{continue;}
            }else if(id!==preferredId){
                // Without the cwd, the persisted ID is the sole reliable owner proof.
                // Two unrelated projects can share the same workspace basename.
                continue;
            }
            candidates.push({id,terminal});
        }
        return candidates;
    }
    /** Read-only lookup for a reappearing persisted primary, without
     * registering another main until a safe handover is possible. */
    findRestorableMainId(workspace:string,preferredId?:string):string|undefined{
        const candidates=this.restoredMainCandidates(workspace,preferredId);
        return (candidates.find(candidate=>candidate.id===preferredId)||candidates[0])?.id;
    }
    /** Reattach restored VSCode terminals. Preserve their real VSCode terminal object
     * and never create another one when a previous main shell is available. */
    restoreMainTerminals(workspace:string,preferredId?:string):string|undefined {
        if(this.disposed){return undefined;}
        const candidates=this.restoredMainCandidates(workspace,preferredId);
        if(candidates.length===0){return undefined;}
        // Exactly one primary terminal may belong to a VS Code window.
        // Historical versions could leave several physical main terminals:
        // do not register all of them as MCP sessions, and never dispose
        // unrelated or potentially running old physical terminals here.
        const selected=candidates.find(candidate=>candidate.id===preferredId)||
            candidates[0];
        const {id,terminal}=selected;
        if(!this.shells.has(id)){
            const cwd=fs.realpathSync(workspace);
            this.shells.set(id,{id,cwd,origin:'automatic',timedOutRunning:false,
                recoveryRequired:this.observedIdle.get(terminal)!==true,
                recoveryReason:this.observedIdle.get(terminal)===true?undefined:'restored_unverified',
                queuedCancels:new Set(),terminal,queued:0,active:false,closed:false,queue:Promise.resolve()});
        }
        return id;
    }
    /**
     * Reconnect still-existing user terminals, never create replacements for them.
     * VSCode does not expose a reliable "is currently running" flag for a restored
     * terminal. A definite shell-integration command completion auto-unlocks
     * the session; otherwise an explicit idle confirmation is required.
     *
     * Never infer ownership from a terminal name and working directory alone:
     * that would promote temporary MCP terminals into persistent USER shells.
     */
    restoreUserTerminals(workspace:string,saved:readonly SavedUserShell[]=[]):ShellDescription[] {
        if(this.disposed){return [];}
        const seen=new Map<string,SavedUserShell>();
        for(const item of saved){
            if(!item||typeof item.shell_id!=='string'||!SHELL_ID.test(item.shell_id)||
                item.shell_id.startsWith('main-')||
                typeof item.initial_cwd!=='string'||!path.isAbsolute(item.initial_cwd)){continue;}
            seen.set(item.shell_id,item);
        }
        const recovered:ShellDescription[]=[];
        const knownTerminals=vscode.window.terminals||[];
        // Never choose an arbitrary process if two physical terminals share an ID.
        const counts=new Map<string,number>();
        for(const terminal of knownTerminals){
            counts.set(terminal.name,(counts.get(terminal.name)||0)+1);
        }
        for(const terminal of knownTerminals){
            const match=/^MCP \[([A-Za-z][A-Za-z0-9_-]{1,39})\]$/.exec(terminal.name);
            if(!match||match[1].startsWith('main-')||counts.get(terminal.name)!==1){continue;}
            const id=match[1];
            if(this.shells.has(id)){continue;}
            const stored=seen.get(id);
            if(!stored){continue;}
            // Restored persistent terminals may lose creationOptions.cwd even
            // when VSCode preserves their real process. Prefer the known cwd
            // saved by THIS workspace; never infer one for unknown sessions.
            const options=terminal.creationOptions as vscode.TerminalOptions|undefined;
            const original=options?.cwd;
            const originalPath=typeof original==='string'?original:original?.fsPath;
            if(originalPath && !path.isAbsolute(originalPath)){continue;}
            let cwd:string;
            try{
                const expected=fs.realpathSync(stored.initial_cwd);
                if(originalPath){
                    const actual=fs.realpathSync(originalPath);
                    if(process.platform==='win32'?expected.toLowerCase()!==actual.toLowerCase():expected!==actual){continue;}
                }
                cwd=expected;
            }catch{continue;}
            const entry:ShellEntry={id,cwd,origin:'user',timedOutRunning:false,
                recoveryRequired:this.observedIdle.get(terminal)!==true,
                recoveryReason:this.observedIdle.get(terminal)===true?undefined:'restored_unverified',
                queuedCancels:new Set(),terminal,queued:0,active:false,closed:false,queue:Promise.resolve()};
            this.shells.set(id,entry);
            recovered.push(this.describe(entry));
        }
        return recovered;
    }
    confirmRestoredUserShell(id:string):ShellDescription {
        this.validateId(id);
        const entry=this.shells.get(id);
        if(!entry||entry.closed||(entry.origin!=='user'&&entry.origin!=='automatic')||
            (!entry.recoveryRequired && !entry.timedOutRunning)){
            throw new Error('No restored or timed-out terminal awaiting confirmation: '+id);
        }
        if(entry.timedOutRunning){
            if(!entry.confirmIdleAfterTimeout){
                throw new Error('Timed-out shell recovery is unavailable: '+id);
            }
            // Explicit user confirmation: never interrupt the preserved process.
            const active=this.observedExecutions.get(entry.terminal);
            if([...active||[]].some(execution=>execution!==entry.currentExecution)){
                throw new Error('Another external command is still active: '+id);
            }
            if(entry.currentExecution){active?.delete(entry.currentExecution);}
            entry.confirmIdleAfterTimeout();
            this.observedIdle.set(entry.terminal,true);
            entry.recoveryReason=undefined;
            this.notifyIdleState();
            return this.describe(entry);
        }
        if(entry.active||entry.queued){throw new Error('Terminal is still busy: '+id);}
        if((this.observedExecutions.get(entry.terminal)?.size||0)>0){
            throw new Error('Terminal "'+id+'" has an observed external command still active. Do not confirm idle while it is running.');
        }
        entry.recoveryRequired=false;
        entry.recoveryReason=undefined;
        this.observedIdle.set(entry.terminal,true);
        this.notifyIdleState();
        return this.describe(entry);
    }
    /** Terminal restoration may finish just after extension activation.
     * A bounded grace period prevents duplicate main shells without blocking forever. */
    async awaitRestoredMainTerminals(workspace:string,preferredId?:string):Promise<string|undefined> {
        const found=this.restoreMainTerminals(workspace,preferredId);
        if(found){return found;}
        if(typeof vscode.window.onDidOpenTerminal!=='function'){return undefined;}
        return new Promise(resolve=>{
            let timer:ReturnType<typeof setTimeout>;
            const subscription=vscode.window.onDidOpenTerminal(()=>{
                const result=this.restoreMainTerminals(workspace,preferredId);
                if(result){clearTimeout(timer);subscription.dispose();resolve(result);}
            });
            timer=setTimeout(()=>{
                subscription.dispose();
                resolve(this.restoreMainTerminals(workspace,preferredId));
            },preferredId?6500:1500);
            // A terminal could have been restored between the first scan and listener registration.
            const immediate=this.restoreMainTerminals(workspace,preferredId);
            if(immediate){clearTimeout(timer);subscription.dispose();resolve(immediate);}
        });
    }
    private validateId(id: string): void {
        if (!SHELL_ID.test(id)) {
            throw new Error('shell_id must start with a letter, contain 2-40 characters and use only letters, digits, _ or -.');
        }
    }
    create(id: string, workingDirectory?: string, allowSharedDirectory = false, origin:ShellOrigin = 'mcp'): ShellDescription {
        this.validateId(id);
        if (this.disposed) { throw new Error('Shell manager has stopped.'); }
        if (this.shells.has(id)) { throw new Error('Shell ID "' + id + '" already exists.'); }
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const cwd = path.resolve(workspace || process.cwd(), workingDirectory || '.');
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
            throw new Error('Working directory does not exist: ' + cwd);
        }
        const realCwd = fs.realpathSync(cwd);
        if (!allowSharedDirectory && [...this.shells.values()].some(e => process.platform === 'win32'
            ? e.cwd.toLowerCase() === realCwd.toLowerCase()
            : e.cwd === realCwd)) {
            throw new Error('Another shell already uses this directory. Use a separate Git worktree or explicitly set allow_shared_directory=true.');
        }
        const terminal = vscode.window.createTerminal({ name: 'MCP [' + id + ']', cwd: realCwd });
        const entry: ShellEntry = { id, cwd: realCwd, origin, timedOutRunning:false, recoveryRequired:false, queuedCancels:new Set(), terminal,queued:0,active:false,closed:false,queue:Promise.resolve(),createdByManager:true,commandInvoked:false };
        this.shells.set(id, entry);
        this.notifyIdleState();
        // A newly created temporary shell inherits the current window policy.
        // Never revive a stale persisted exception from an older temporary shell
        // that happened to use the same ID. The requesting/parent shell is irrelevant.
        if(origin==='mcp'){this.interactiveOverrides.delete(id);}
        return this.describe(entry);
    }
    private describe(entry: ShellEntry): ShellDescription {
        const externalBusy=!entry.active && (this.observedExecutions.get(entry.terminal)?.size||0)>0;
        const activeMcp=entry.active||entry.timedOutRunning;
        const silentSeconds=activeMcp&&entry.lastOutputAt!==undefined
            ?Math.max(0,Math.floor((Date.now()-entry.lastOutputAt)/1000)):undefined;
        return { shell_id: entry.id, initial_cwd: entry.cwd, origin:entry.origin,
            timed_out_running:entry.timedOutRunning, recovery_required:entry.recoveryRequired,
            recovery_reason:entry.recoveryReason, external_busy:externalBusy,
            execution_phase:activeMcp?entry.executionPhase:undefined,
            input_wait_hint:activeMcp?entry.inputWaitHint:undefined,
            output_silent_seconds:silentSeconds,
            busy: entry.active || externalBusy, queued: entry.queued,
            auto_exit_interactive:this.autoExitEnabled(entry.id),
            auto_exit_override:this.interactiveOverrides.get(entry.id) };
    }
    list(): ShellDescription[] {
        return [...this.shells.values()].map(e => this.describe(e));
    }
    root(id: string): string {
        this.validateId(id);
        const entry = this.shells.get(id);
        if (!entry || entry.closed) { throw new Error('Unknown shell_id "' + id + '". Call create_shell_code first.'); }
        return entry.cwd;
    }
    show(id: string): void {
        this.validateId(id);
        const entry=this.shells.get(id);
        if(!entry||entry.closed){throw new Error('Unknown shell_id: '+id);}
        entry.terminal.show(false);
    }
    close(id: string): void {
        const entry = this.shells.get(id);
        if (!entry) { throw new Error('Unknown shell_id: ' + id); }
        entry.closed = true;
        this.shells.delete(id);
        this.interactiveOverrides.delete(id);
        this.notifyIdleState();
        entry.terminal.dispose();
    }
    async execute(id: string, command: string, timeoutMs = 120000, signal?: AbortSignal): Promise<ShellExecutionResult> {
        this.validateId(id);
        if (!command.trim()) { throw new Error('Empty command.'); }
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT) {
            throw new Error('timeout must be an integer 1000..3600000 ms.');
        }
        const entry=this.shells.get(id);
        if (!entry || entry.closed) { throw new Error('Unknown shell_id "' + id + '". Call create_shell_code first.'); }
        if(entry.recoveryRequired||entry.timedOutRunning||(!entry.active&&
            ((this.observedExecutions.get(entry.terminal)?.size||0)>0||
                this.observedIdle.get(entry.terminal)===false))){await this.resumeProvenIdleTerminals();}
        if(entry.recoveryRequired){throw new Error('Restored shell "'+id+'" requires confirmation of idle state by automatic verification. Retry shortly. Reason: '+(entry.recoveryReason||'unverified')+'. No input was sent to the terminal.');}
        if (entry.timedOutRunning) {
            throw new Error('Shell "'+id+'" has a command still running after its timeout. Its process was preserved because this is a user-created or primary terminal. Automatic verification will restore access when it is idle; no input was sent.');
        }
        if(signal?.aborted){throw new Error('MCP command cancelled before execution.');}
        entry.queued++;
        // The response can time out before the real terminal command completes.
        // This gate only opens once that command has ACTUALLY ended (or terminal closed).
        const previous=entry.queue;
        let release!:()=>void;
        entry.queue=new Promise<void>(resolve=>{release=resolve;});
        let started=false;
        let dequeued=false;
        let cancelQueued!:(reason?:string)=>void;
        const cancelled=new Promise<never>((_,reject)=>{
            cancelQueued=(reason)=>reject(new Error(reason||'Shell "'+id+'" is still running its timed-out preserved command. Queued MCP command cancelled to protect the user session.'));
        });
        const abortQueued=()=>{cancelQueued('MCP command cancelled while queued.');};
        signal?.addEventListener('abort',abortQueued,{once:true});
        if(signal?.aborted){abortQueued();}
        entry.queuedCancels.add(cancelQueued);
        try {
            // If an already-running user command times out, cancel waiting calls
            // immediately. They must not execute unexpectedly when the user resumes.
            await Promise.race([previous,cancelled]);
            signal?.removeEventListener('abort',abortQueued);
            entry.queuedCancels.delete(cancelQueued);
            entry.queued--;
            dequeued=true;
            if(signal?.aborted){throw new Error('MCP command cancelled before execution.');}
            if (entry.closed) { throw new Error('Shell "' + id + '" was closed while command was queued.'); }
            if (entry.timedOutRunning) {throw new Error('Shell "'+id+'" still has a timed-out user command running.');}
            if (entry.recoveryRequired) {throw new Error('Restored shell "'+id+'" still requires idle confirmation.');}
            this.guardExternalExecution(entry);
            started=true;
            entry.active=true;
            entry.executionPhase='waiting_for_integration';
            entry.inputWaitHint=undefined;
            entry.lastOutputAt=Date.now();
            entry.commandInvoked=true;
            this.notifyIdleState();
            return await this.executeNow(entry,command,timeoutMs,()=>{
                entry.active=false;
                entry.timedOutRunning=false;
                entry.executionPhase=undefined;
                entry.inputWaitHint=undefined;
                entry.lastOutputAt=undefined;
                release();
                this.notifyIdleState();
            },signal);
        } finally {
            signal?.removeEventListener('abort',abortQueued);
            entry.queuedCancels.delete(cancelQueued);
            if (!dequeued) {entry.queued--;}
            if (!started) {
                // A cancelled queued request must not open the gate for later
                // requests until ALL earlier commands have actually ended.
                // The cancelled call itself never executes.
                void previous.then(release,release);
            }
        }
    }
    private async executeNow(entry: ShellEntry, command: string, timeoutMs: number, onFinished:()=>void,signal?:AbortSignal): Promise<ShellExecutionResult> {
        const terminal=entry.terminal;
        let output='';
        let truncated=false;
        let exitCode:number|undefined;
        let endListener:vscode.Disposable|undefined;
        let integrationListener:vscode.Disposable|undefined;
        let closeListener:vscode.Disposable|undefined;
        let timer:ReturnType<typeof setTimeout>|undefined;
        let execution:vscode.TerminalShellExecution|undefined;
        let timedOutPreserved=false;
        let finished=false;
        let commandEnded=false;
        let ambiguousEndSeen=false;
        let autoExitSent=false;
        let terminalScreen='';
        const safeInteractive=this.autoExitEnabled(entry.id) ? recognizedInteractiveCommand(command) : undefined;
        let confirmIdle!:()=>void;
        let releaseIntegrationWait!:()=>void;
        let stopReading!:()=>void;
        let outputIterator:AsyncIterator<string>|undefined;
        const readerStopped=new Promise<undefined>(resolve=>{stopReading=()=>resolve(undefined);});
        let cancelBeforeDispatch!:()=>void;
        const cancelledBeforeDispatch=new Promise<never>((_,reject)=>{
            cancelBeforeDispatch=()=>{if(!execution){reject(new Error('MCP command cancelled before execution.'));}};
        });
        const interruptedIntegrationWait=new Promise<void>(resolve=>{releaseIntegrationWait=resolve;});
        const manuallyReleased=new Promise<void>(resolve=>{confirmIdle=resolve;});
        const finish=()=>{
            if(finished){return;}
            finished=true;
            stopReading();
            try{void Promise.resolve(outputIterator?.return?.()).catch(()=>{});}catch{}
            releaseIntegrationWait();
            signal?.removeEventListener('abort',cancelBeforeDispatch);
            entry.currentExecution=undefined;
            entry.confirmIdleAfterTimeout=undefined;
            entry.detachExecution=undefined;
            endListener?.dispose();
            integrationListener?.dispose();
            closeListener?.dispose();
            onFinished();
        };
        entry.confirmIdleAfterTimeout=()=>{
            confirmIdle();
            finish();
        };
        signal?.addEventListener('abort',cancelBeforeDispatch,{once:true});
        if(signal?.aborted){cancelBeforeDispatch();}
        // For a user-owned terminal the timeout only stops WAITING for the response.
        // It must not terminate the process, detach its completion listener, or
        // release the FIFO gate while the original command is still running.
        const deadline=new Promise<never>((_,reject)=>{
            timer=setTimeout(()=>{
                if(this.preserveOnTimeout(entry) && !execution){
                    reject(new Error('Shell integration unavailable in preserved shell "'+entry.id+'". Command was not started; terminal remains available.'));
                }else if(this.preserveOnTimeout(entry)){
                    timedOutPreserved=true;
                    entry.timedOutRunning=true;
                    entry.executionPhase='timed_out_preserved';
                    for(const cancel of [...entry.queuedCancels]){cancel();}
                    reject(new Error('Command timed out in preserved shell "'+entry.id+'". A command may still be running, waiting for user input, or missing its VSCode completion event. Process preserved; no new MCP command will be sent until completion or explicit idle confirmation.'));
                }else{
                    // Reject before disposing: VSCode fires its close event synchronously.
                    // This preserves the more informative timeout error for the caller.
                    reject(new Error('Command timed out: shell "'+entry.id+'" closed to prevent command overlap.'));
                    entry.closed=true;
                    this.shells.delete(entry.id);
                    terminal.dispose();
                }
            },timeoutMs);
        });
        const closed=new Promise<never>((_,reject)=>{
            entry.detachExecution=()=>{
                reject(new Error('Shell manager stopped; no further command will be dispatched.'));
                confirmIdle();
                finish();
            };
            closeListener=vscode.window.onDidCloseTerminal(t=>{
                if(t===terminal){
                    finish();
                    reject(new Error('Shell "'+entry.id+'" closed during command.'));
                }
            });
        });
        const run=async ():Promise<ShellExecutionResult>=>{
            if(!terminal.shellIntegration){
                await Promise.race([
                    new Promise<void>(resolve=>{
                        integrationListener=vscode.window.onDidChangeTerminalShellIntegration(e=>{
                            if(e.terminal===terminal && terminal.shellIntegration){resolve();}
                        });
                        if(terminal.shellIntegration){resolve();}
                    }),
                    interruptedIntegrationWait
                ]);
            }
            if(finished || entry.closed || !terminal.shellIntegration){
                throw new Error('Shell integration unavailable or terminal closed.');
            }
            if(signal?.aborted){throw new Error('MCP command cancelled before execution.');}
            if(entry.recoveryRequired){throw new Error('Shell requires idle verification before execution.');}
            this.guardExternalExecution(entry);
            // Some VS Code integration implementations fire an end event
            // synchronously within executeCommand(), before it returns the
            // execution object. Retain those events and replay only the
            // matching one once the identity is known, never a foreign event.
            const earlyEnds:Array<{execution:vscode.TerminalShellExecution;exitCode:number|undefined}>=[];
            let complete!:()=>void;
            const completed=new Promise<void>(resolve=>{complete=resolve;});
            const handleEnd=(event:{execution:vscode.TerminalShellExecution;exitCode:number|undefined})=>{
                if(event.execution!==execution||commandEnded){return;}
                if(typeof event.exitCode!=='number'){
                    ambiguousEndSeen=true;
                    return;
                }
                exitCode=event.exitCode;
                commandEnded=true;
                entry.executionPhase='draining_output';
                this.notifyIdleState();
                if(timer){clearTimeout(timer);timer=undefined;}
                complete();
            };
            endListener=vscode.window.onDidEndTerminalShellExecution(e=>{
                if(e.terminal!==terminal){return;}
                if(!execution){earlyEnds.push({execution:e.execution,exitCode:e.exitCode});return;}
                handleEnd({execution:e.execution,exitCode:e.exitCode});
            });
            execution=terminal.shellIntegration.executeCommand(command);
            entry.currentExecution=execution;
            if(!commandEnded){
                entry.executionPhase='running';
                entry.lastOutputAt=Date.now();
            }
            for(const event of earlyEnds){handleEnd(event);}
            this.notifyIdleState();
            let readFailure:unknown;
            let readSettled=false;
            const read=(async()=>{
                try{
                outputIterator=execution!.read()[Symbol.asyncIterator]();
                while(!finished){
                    const next=await Promise.race([outputIterator.next(),readerStopped]);
                    if(!next||next.done||finished){break;}
                    const chunk=next.value;
                    if(output.length<MAX_OUTPUT){output+=chunk.slice(0,MAX_OUTPUT-output.length);}
                    if(output.length===MAX_OUTPUT){truncated=true;}
                    if(chunk.length>0){
                        entry.lastOutputAt=Date.now();
                        terminalScreen=(terminalScreen+chunk).slice(-16384);
                        // Only surface an input hint. Do not automatically
                        // answer confirmations, passwords or unknown pagers.
                        entry.inputWaitHint=detectInputWaitHint(terminalScreen);
                    }
                    // Send q ONLY on a recognized pager prompt or full-screen
                    // entry for this command, never on arbitrary first output.
                    // Do not defer a keystroke in a timer that could fire after
                    // a short-lived program has already exited.
                    if(safeInteractive&&!autoExitSent&&chunk.length>0){
                        if(!ambiguousEndSeen&&interactiveReadyForQuit(safeInteractive,terminalScreen)&&
                            typeof terminal.sendText==='function'&&
                            !finished&&!commandEnded&&!entry.closed&&entry.active){
                            autoExitSent=true;
                            try{terminal.sendText('q',false);}
                            catch{
                                // Preserve the usual timeout and recovery path.
                            }
                        }
                    }
                }
                }catch(error){
                    // Losing the output stream is NOT proof the process ended.
                    // Wait for the terminal's completion event (or an explicit
                    // user acknowledgement) before releasing the FIFO gate.
                    readFailure=error;
                }finally{
                    readSettled=true;
                    if(!finished && !commandEnded && !entry.closed){
                        entry.executionPhase=readFailure
                            ?'output_error_waiting_for_completion'
                            :'waiting_for_completion';
                        this.notifyIdleState();
                    }
                }
            })();
            // A command-completion event is definitive even if the VS Code
            // output iterator lingers. Drain for 750 ms, then report partial
            // output rather than needlessly locking the FIFO until timeout.
            const completedAndDrained=(async()=>{
                await completed;
                if(!readSettled){
                    let drainTimer:ReturnType<typeof setTimeout>|undefined;
                    try{
                        await Promise.race([read,new Promise<void>(resolve=>{
                            drainTimer=setTimeout(resolve,750);
                        })]);
                    }finally{
                        if(drainTimer){clearTimeout(drainTimer);}
                    }
                }
            })();
            await Promise.race([completedAndDrained,manuallyReleased]);
            if(readFailure){throw readFailure;}
            return {shell_id:entry.id,command,output,exit_code:exitCode,
                truncated:truncated||!readSettled,
                ...(!readSettled?{output_incomplete:true}:{})};
        };
        const running=run();
        // Observe late completion even after the MCP response has timed out.
        // Both branches are handled to avoid unhandled rejections.
        void running.then(finish,finish);
        try{
            return await Promise.race([running,deadline,closed,cancelledBeforeDispatch]);
        }finally{
            if(timer){clearTimeout(timer);}
            if(!timedOutPreserved){finish();}
        }
    }
    dispose(preserveTerminals=false): void {
        if (this.disposed) { return; }
        this.disposed = true;
        this.closeListener.dispose();
        this.recoveryStartListener?.dispose();
        this.recoveryEndListener?.dispose();
        this.idleStateListener=undefined;
        for (const entry of this.shells.values()) {
            entry.closed = true;
            for(const cancel of [...entry.queuedCancels]){cancel('Shell manager stopped; queued command cancelled.');}
            entry.detachExecution?.();
            if(!preserveTerminals){entry.terminal.dispose();}
        }
        this.shells.clear();
    }
}