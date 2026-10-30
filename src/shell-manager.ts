import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type ShellOrigin = 'user' | 'mcp' | 'automatic';
export interface SavedUserShell {shell_id:string; initial_cwd:string; alias?:string;}

export interface ShellDescription {
    origin: ShellOrigin;
    timed_out_running: boolean;
    recovery_required: boolean;
    shell_id: string;
    initial_cwd: string;
    window_id?: string;
    alias?: string;
    busy: boolean;
    queued: number;
}
export interface ShellExecutionResult {
    shell_id: string;
    command: string;
    output: string;
    exit_code: number | undefined;
    truncated: boolean;
}
interface ShellEntry {
    id: string;
    cwd: string;
    origin: ShellOrigin;
    timedOutRunning: boolean;
    recoveryRequired: boolean;
    queuedCancels:Set<()=>void>;
    terminal: vscode.Terminal;
    queued: number;
    active: boolean;
    closed: boolean;
    queue: Promise<void>;
}
const SHELL_ID = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
const MAX_OUTPUT = 1_000_000;
const MAX_TIMEOUT = 3_600_000;

/**
 * No implicit active terminal and no inferred ChatGPT conversation identity.
 * Commands are FIFO per shell, concurrent across different shell IDs.
 * MCP-owned terminals close on timeout. User-created terminals preserve the running
 * process; their FIFO remains locked until VSCode reports that command has ended.
 */
export class ShellManager implements vscode.Disposable {
    private readonly shells = new Map<string, ShellEntry>();
    private readonly closeListener: vscode.Disposable;
    private disposed = false;

    constructor() {
        this.closeListener = vscode.window.onDidCloseTerminal(terminal => {
            for (const entry of this.shells.values()) {
                if (entry.terminal === terminal) {
                    entry.closed = true;
                    this.shells.delete(entry.id);
                    break;
                }
            }
        });
    }
    /** Return the exact terminal IDs created previously for this workspace.
     * Never adopt unrelated terminals or shells belonging to another workspace. */
    private restoredMainCandidates(workspace: string): Array<{id:string;terminal:vscode.Terminal}> {
        const name=(path.basename(workspace)||'window').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
        const prefix='MCP [main-'+name+'-';
        const candidates:Array<{id:string;terminal:vscode.Terminal}>=[];
        for(const terminal of vscode.window.terminals||[]) {
            if(!terminal.name.startsWith(prefix)||!terminal.name.endsWith(']')){continue;}
            const id=terminal.name.slice(5,-1);
            if(!/^main-[A-Za-z0-9_-]+-[a-f0-9]{8}$/.test(id)||terminal.name!=='MCP ['+id+']'){continue;}
            candidates.push({id,terminal});
        }
        return candidates;
    }
    /** Reattach restored VSCode terminals. Preserve their real VSCode terminal object
     * and never create another one when a previous main shell is available. */
    restoreMainTerminals(workspace:string,preferredId?:string):string|undefined {
        if(this.disposed){return undefined;}
        const candidates=this.restoredMainCandidates(workspace);
        if(candidates.length===0){return undefined;}
        const cwd=fs.realpathSync(workspace);
        for(const {id,terminal} of candidates){
            if(this.shells.has(id)){continue;}
            this.shells.set(id,{id,cwd,origin:'automatic',timedOutRunning:false,recoveryRequired:false,queuedCancels:new Set(),terminal,queued:0,active:false,closed:false,queue:Promise.resolve()});
        }
        return candidates.some(c=>c.id===preferredId)?preferredId:candidates[0].id;
    }
    /**
     * Reconnect still-existing user terminals, never create replacements for them.
     * VSCode does not expose a reliable "is currently running" flag for a restored
     * terminal, so restored sessions require an explicit idle confirmation.
     *
     * Legacy 0.10.7 sessions had no persisted ownership metadata. Recover those
     * only if the exact MCP terminal name AND its original cwd identify a terminal
     * in this VSCode window and inside the current workspace.
     */
    restoreUserTerminals(workspace:string,saved:readonly SavedUserShell[]=[]):ShellDescription[] {
        if(this.disposed){return [];}
        const root=fs.realpathSync(workspace);
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
            // Restored persistent terminals may lose creationOptions.cwd even
            // when VSCode preserves their real process. Prefer the known cwd
            // saved by THIS workspace; never infer one for unknown sessions.
            const stored=seen.get(id);
            const options=terminal.creationOptions as vscode.TerminalOptions|undefined;
            const original=options?.cwd;
            const originalPath=typeof original==='string'?original:original?.fsPath;
            if(originalPath && !path.isAbsolute(originalPath)){continue;}
            let cwd:string;
            try{
                if(stored){
                    const expected=fs.realpathSync(stored.initial_cwd);
                    if(originalPath){
                        const actual=fs.realpathSync(originalPath);
                        if(process.platform==='win32'?expected.toLowerCase()!==actual.toLowerCase():expected!==actual){continue;}
                    }
                    cwd=expected;
                }else{
                    // Migration without saved ownership requires an explicit
                    // physical cwd: name alone cannot establish provenance.
                    if(!originalPath){continue;}
                    cwd=fs.realpathSync(originalPath);
                    const relative=path.relative(root,cwd);
                    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){continue;}
                }
            }catch{continue;}
            const entry:ShellEntry={id,cwd,origin:'user',timedOutRunning:false,recoveryRequired:true,
                queuedCancels:new Set(),terminal,queued:0,active:false,closed:false,queue:Promise.resolve()};
            this.shells.set(id,entry);
            recovered.push(this.describe(entry));
        }
        return recovered;
    }
    confirmRestoredUserShell(id:string):ShellDescription {
        this.validateId(id);
        const entry=this.shells.get(id);
        if(!entry||entry.closed||entry.origin!=='user'||!entry.recoveryRequired){
            throw new Error('No restored user terminal awaiting confirmation: '+id);
        }
        if(entry.active||entry.queued){throw new Error('Terminal is still busy: '+id);}
        entry.recoveryRequired=false;
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
            },1500);
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
        const entry: ShellEntry = { id, cwd: realCwd, origin, timedOutRunning:false, recoveryRequired:false, queuedCancels:new Set(), terminal, queued: 0, active: false, closed: false, queue: Promise.resolve() };
        this.shells.set(id, entry);
        return this.describe(entry);
    }
    private describe(entry: ShellEntry): ShellDescription {
        return { shell_id: entry.id, initial_cwd: entry.cwd, origin:entry.origin, timed_out_running:entry.timedOutRunning, recovery_required:entry.recoveryRequired, busy: entry.active, queued: entry.queued };
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
        entry.terminal.dispose();
    }
    async execute(id: string, command: string, timeoutMs = 120000): Promise<ShellExecutionResult> {
        this.validateId(id);
        if (!command.trim()) { throw new Error('Empty command.'); }
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT) {
            throw new Error('timeout must be an integer 1000..3600000 ms.');
        }
        const entry=this.shells.get(id);
        if (!entry || entry.closed) { throw new Error('Unknown shell_id "' + id + '". Call create_shell_code first.'); }
        if(entry.recoveryRequired){throw new Error('Restored user shell "'+id+'" requires confirmation in the VSCode MultiShell panel that its previous command is no longer running. The existing terminal was preserved.');}
        if (entry.timedOutRunning) {
            throw new Error('Shell "'+id+'" has a command still running after its timeout. Its process was preserved because this is a user-created terminal. Wait for it to finish or interrupt it manually in VSCode before sending another command.');
        }
        entry.queued++;
        // The response can time out before the real terminal command completes.
        // This gate only opens once that command has ACTUALLY ended (or terminal closed).
        const previous=entry.queue;
        let release!:()=>void;
        entry.queue=new Promise<void>(resolve=>{release=resolve;});
        let started=false;
        let dequeued=false;
        let cancelQueued!:()=>void;
        const cancelled=new Promise<never>((_,reject)=>{
            cancelQueued=()=>reject(new Error('Shell "'+id+'" is still running its timed-out user command. Queued MCP command cancelled to protect the user session.'));
        });
        entry.queuedCancels.add(cancelQueued);
        try {
            // If an already-running user command times out, cancel waiting calls
            // immediately. They must not execute unexpectedly when the user resumes.
            await Promise.race([previous,cancelled]);
            entry.queuedCancels.delete(cancelQueued);
            entry.queued--;
            dequeued=true;
            if (entry.closed) { throw new Error('Shell "' + id + '" was closed while command was queued.'); }
            if (entry.timedOutRunning) {throw new Error('Shell "'+id+'" still has a timed-out user command running.');}
            started=true;
            entry.active=true;
            return await this.executeNow(entry,command,timeoutMs,()=>{
                entry.active=false;
                entry.timedOutRunning=false;
                release();
            });
        } finally {
            entry.queuedCancels.delete(cancelQueued);
            if (!dequeued) {entry.queued--;}
            if (!started) {release();}
        }
    }
    private async executeNow(entry: ShellEntry, command: string, timeoutMs: number, onFinished:()=>void): Promise<ShellExecutionResult> {
        const terminal=entry.terminal;
        let output='';
        let truncated=false;
        let exitCode:number|undefined;
        let endListener:vscode.Disposable|undefined;
        let integrationListener:vscode.Disposable|undefined;
        let closeListener:vscode.Disposable|undefined;
        let timer:ReturnType<typeof setTimeout>|undefined;
        let execution:vscode.TerminalShellExecution|undefined;
        let timedOutForUser=false;
        let finished=false;
        const finish=()=>{
            if(finished){return;}
            finished=true;
            endListener?.dispose();
            integrationListener?.dispose();
            closeListener?.dispose();
            onFinished();
        };
        // For a user-owned terminal the timeout only stops WAITING for the response.
        // It must not terminate the process, detach its completion listener, or
        // release the FIFO gate while the original command is still running.
        const deadline=new Promise<never>((_,reject)=>{
            timer=setTimeout(()=>{
                if(entry.origin==='user'){
                    timedOutForUser=true;
                    entry.timedOutRunning=true;
                    for(const cancel of [...entry.queuedCancels]){cancel();}
                    reject(new Error('Command timed out in user-created shell "'+entry.id+'". Terminal and running process preserved. Return to the terminal in VSCode; no new MCP command will be sent until the original command finishes.'));
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
            closeListener=vscode.window.onDidCloseTerminal(t=>{
                if(t===terminal){
                    finish();
                    reject(new Error('Shell "'+entry.id+'" closed during command.'));
                }
            });
        });
        const run=async ():Promise<ShellExecutionResult>=>{
            if(!terminal.shellIntegration){
                await new Promise<void>(resolve=>{
                    integrationListener=vscode.window.onDidChangeTerminalShellIntegration(e=>{
                        if(e.terminal===terminal && terminal.shellIntegration){resolve();}
                    });
                    if(terminal.shellIntegration){resolve();}
                });
            }
            if(entry.closed || !terminal.shellIntegration){throw new Error('Shell integration unavailable or terminal closed.');}
            const completed=new Promise<void>(resolve=>{
                endListener=vscode.window.onDidEndTerminalShellExecution(e=>{
                    if(e.terminal===terminal && e.execution===execution){
                        exitCode=e.exitCode;
                        resolve();
                    }
                });
            });
            execution=terminal.shellIntegration.executeCommand(command);
            const read=(async()=>{
                for await(const chunk of execution!.read()){
                    if(output.length<MAX_OUTPUT){output+=chunk.slice(0,MAX_OUTPUT-output.length);}
                    if(output.length===MAX_OUTPUT){truncated=true;}
                }
            })();
            await Promise.all([read,completed]);
            return {shell_id:entry.id,command,output,exit_code:exitCode,truncated};
        };
        const running=run();
        // Observe late completion even after the MCP response has timed out.
        // Both branches are handled to avoid unhandled rejections.
        void running.then(finish,finish);
        try{
            return await Promise.race([running,deadline,closed]);
        }finally{
            if(timer){clearTimeout(timer);}
            if(!timedOutForUser){finish();}
        }
    }
    dispose(preserveTerminals=false): void {
        if (this.disposed) { return; }
        this.disposed = true;
        this.closeListener.dispose();
        for (const entry of this.shells.values()) {
            entry.closed = true;
            if(!preserveTerminals){entry.terminal.dispose();}
        }
        this.shells.clear();
    }
}