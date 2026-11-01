import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ShellManager, ShellDescription, ShellExecutionResult, ShellOrigin, SavedUserShell, SavedIdleProof } from './shell-manager';
import { ShellApi } from './shell-api';
import type { NativeKind, NativeArgs } from './tools/native-window-tools';

const HOST = '127.0.0.1';
export const REGISTER_PATH = '/_multishell/register';
export const CONTROL_PATH = '/_multishell/control';
const ACTION_PATH = '/_multishell/action';
const MAX_BODY = 2_000_000;

type WorkerAction = { op:'create'|'create_panel_user'|'create_user'|'list'|'execute'|'execute_isolated'|'close'|'close_user'|'close_panel_user'|'alias'|'native'; id?:string; cwd?:string; allow?:boolean; command?:string; timeout?:number; alias?:string; origin?:ShellOrigin; kind?:NativeKind; args?:NativeArgs; panelPermit?:string };
export interface Registration { window_id:string; workspace:string; worker_port:number; aliases?:Record<string,string>; }
export interface UserShellRequest {
    request_id:string;
    shell_id:string;
    cwd:string;
    share:boolean;
    created_at:number;
    expires_at:number;
}
interface WorkerState extends Registration { lastSeen:number; }
interface Assignment { owner:string; cwd:string; }
/** Case-insensitive aliases address one shell per operation; never a conversation-global default. */
const ALIAS=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export function normalizeAlias(value:string):string {
    if(typeof value!=='string'||!ALIAS.test(value)){throw new Error('Alias must be 1-40 letters, digits, - or _, beginning with a letter or number.');}
    return value.toLowerCase();
}
export function resolveWorkingDirectory(workspace:string,cwd?:string):string {
    // Relative paths belong to the selected VSCode window, not the MCP hub process.
    return path.resolve(workspace,cwd?.trim()||'.');
}
export function suggestAlias(name:string):string {
    const alias=(path.basename(name)||'shell').replace(/[^A-Za-z0-9_-]/g,'-').replace(/^-+/,'').slice(0,32).toLowerCase();
    return alias||'shell';
}

export function getSecret(storage:string):string {
    fs.mkdirSync(storage,{recursive:true});
    const file=path.join(storage,'multishell-local-token');
    try {fs.writeFileSync(file,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
    catch(e) {if((e as NodeJS.ErrnoException).code!=='EEXIST'){throw e;}}
    const token=fs.readFileSync(file,'utf-8').trim();
    if(!/^[a-f0-9]{64}$/.test(token)){throw new Error('Invalid MultiShell MCP token in '+file);}
    return token;
}
export function authenticated(given:unknown,secret:string):boolean {
    if(typeof given!=='string'||given.length!==secret.length){return false;}
    return timingSafeEqual(Buffer.from(given),Buffer.from(secret));
}
async function body(req:IncomingMessage):Promise<any> {
    const chunks:Buffer[]=[];let total=0;
    for await(const x of req) {
        const chunk=Buffer.from(x);total+=chunk.length;
        if(total>MAX_BODY){throw new Error('Local request exceeds 2 MB');}
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function reply(res:ServerResponse,code:number,value:unknown):void {
    if(res.writableEnded){return;}
    res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(value));
}
async function post(port:number,uri:string,secret:string,value:unknown,timeoutMs=10000,signal?:AbortSignal):Promise<any> {
    const ac=new AbortController();
    const abort=()=>ac.abort();
    if(signal?.aborted){abort();}
    else {signal?.addEventListener('abort',abort,{once:true});}
    const timer=setTimeout(abort,timeoutMs);
    try {
        const response=await fetch('http://'+HOST+':'+port+uri,{
            method:'POST',headers:{'content-type':'application/json','x-multishell-token':secret},
            body:JSON.stringify(value),signal:ac.signal
        });
        const raw=await response.text();
        let data:any;
        try{data=JSON.parse(raw);}catch{throw new Error('No compatible MultiShell MCP server on port '+port+' (HTTP '+response.status+')');}
        if(!response.ok){throw new Error(data.error||('HTTP '+response.status));}
        return data;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

/** VSCode terminals stay owned by the window that created them. */
export class WindowWorker {
    readonly id:string;
    readonly workspace:string;
    private server?:HttpServer;
    private listenerPort=0;
    private readonly pendingRequests=new Map<string,{
        details:UserShellRequest;settle:(approved:boolean)=>void;
    }>();
    /** One-time local UI permits are never exposed through the HTTP API.
     * A shared hub authentication token alone cannot authorize user creation. */
    private readonly panelPermits=new Map<string,{
        id:string;cwd:string;allow:boolean;expires:number;
    }>();
    readonly aliases=new Map<string,string>();
    constructor(private readonly shells:ShellManager,private readonly secret:string,workspace:string,
        private readonly onAliasChanged?:(id:string,alias:string)=>Promise<void>,
        private readonly onUserShellCreated?:(shell:ShellDescription)=>Promise<void>,
        private readonly queueUserApprovals=false){
        this.workspace=workspace;
        const name=(path.basename(workspace)||'window').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
        this.id=name+'-'+randomUUID().slice(0,8);
    }
    /** Called only by the owning window's native panel event handler. */
    authorizePanelCreation(id:string,cwd:string,allow:boolean):string{
        const permit=randomBytes(32).toString('hex');
        this.panelPermits.set(permit,{id,cwd,allow,expires:Date.now()+30_000});
        return permit;
    }
    revokePanelCreation(permit:string):void{this.panelPermits.delete(permit);}
    private consumePanelCreation(r:WorkerAction):boolean{
        if(r.op!=='create_panel_user'||typeof r.panelPermit!=='string'){return false;}
        const permit=this.panelPermits.get(r.panelPermit);
        this.panelPermits.delete(r.panelPermit);
        if(!permit||permit.expires<Date.now()){return false;}
        const same=(a:string,b:string)=>process.platform==='win32'
            ?a.toLowerCase()===b.toLowerCase():a===b;
        return permit.id===r.id&&typeof r.cwd==='string'&&
            same(permit.cwd,r.cwd)&&permit.allow===(r.allow===true);
    }
    listPendingUserRequests():UserShellRequest[]{
        return [...this.pendingRequests.values()].map(x=>x.details);
    }
    decideUserRequest(id:string,approved:boolean):boolean{
        const request=this.pendingRequests.get(id);
        if(!request){return false;}
        request.settle(approved);
        return true;
    }
    /** Requests exist only inside this VS Code window: MCP HTTP never
     * exposes any operation to approve one. Cancellation removes it. */
    private async requestPanelApproval(r:WorkerAction,signal:AbortSignal):Promise<void>{
        if(signal.aborted){throw new Error('User terminal request cancelled.');}
        if(this.pendingRequests.size>=20){
            throw new Error('Too many pending user terminal requests.');
        }
        if(this.listPendingUserRequests().some(x=>x.shell_id===r.id)){
            throw new Error('User terminal request already pending: '+r.id);
        }
        const request_id=randomUUID();
        const created_at=Date.now();
        const details:UserShellRequest={
            request_id,shell_id:r.id!,cwd:r.cwd!,share:r.allow===true,
            created_at,expires_at:created_at+110_000
        };
        const approved=await new Promise<boolean>(resolve=>{
            let settled=false;
            const cleanup=()=>{
                clearTimeout(timer);
                signal.removeEventListener('abort',abort);
                this.pendingRequests.delete(request_id);
            };
            const settle=(result:boolean)=>{
                if(settled){return;}
                settled=true;
                cleanup();
                resolve(result);
            };
            const abort=()=>settle(false);
            const timer=setTimeout(()=>settle(false),110_000);
            this.pendingRequests.set(request_id,{details,settle});
            signal.addEventListener('abort',abort,{once:true});
            if(signal.aborted){abort();}
        });
        if(!approved||signal.aborted){
            throw new Error('User terminal creation was not approved or request expired.');
        }
    }
    get port():number{return this.listenerPort;}
    isHealthy():boolean{return Boolean(this.server?.listening);}
    async start():Promise<void>{
        if(this.isHealthy()){return;}
        this.server=undefined;
        this.listenerPort=0;
        const server=createServer(async (req,res)=>{
            if(req.method!=='POST'||req.url!==ACTION_PATH){reply(res,404,{error:'Not found'});return;}
            if(!authenticated(req.headers['x-multishell-token'],this.secret)){reply(res,403,{error:'Unauthorized'});return;}
            const cancel=new AbortController();
            res.once('close',()=>{if(!res.writableEnded){cancel.abort();}});
            try{
                const r=await body(req) as WorkerAction;
                let result:unknown;
                switch(r.op){
                    case 'create':
                    case 'create_panel_user':
                    case 'create_user': {
                        if(r.op==='create' && r.origin==='user'){
                            throw new Error('User terminals require explicit local approval.');
                        }
                        const approvedByLocalPanel=this.consumePanelCreation(r);
                        if(r.op==='create_panel_user'&&r.panelPermit!==undefined&&!approvedByLocalPanel){
                            throw new Error('Invalid or expired local panel authorization.');
                        }
                        if(approvedByLocalPanel){
                            // The user already clicked Create in this window's panel.
                            // No redundant OS-level modal is needed.
                        }else if(r.op==='create_user' && this.queueUserApprovals){
                            await this.requestPanelApproval(r,cancel.signal);
                        }else if(r.op==='create_user'||r.op==='create_panel_user'){
                            const vscode=require('vscode') as typeof import('vscode');
                            const es=vscode.env.language.toLowerCase().startsWith('es');
                            const accept=es?'Crear terminal de usuario':'Create user terminal';
                            const fromPanel=r.op==='create_panel_user';
                            const warning=es
                                ? (fromPanel?'Confirma la creación de esta terminal de USUARIO.':'La IA solicita una terminal de USUARIO persistente.')+
                                  '\n\nID: '+r.id+'\nDirectorio: '+r.cwd+
                                  '\nCompartir directorio: '+(r.allow?'Sí':'No')+
                                  '\n\nAutoriza solo si deseas crear esta terminal.'
                                : (fromPanel?'Confirm this USER terminal creation.':'The AI requests a persistent USER terminal.')+
                                  '\n\nID: '+r.id+'\nDirectory: '+r.cwd+
                                  '\nShare directory: '+(r.allow?'Yes':'No')+
                                  '\n\nApprove only if you intend to create this terminal.';
                            const choice=await vscode.window.showWarningMessage(warning,{modal:true},accept);
                            if(choice!==accept){throw new Error('User terminal creation was not approved.');}
                            if(cancel.signal.aborted){throw new Error('User terminal request was disconnected or expired; no terminal created.');}
                        }
                        if(cancel.signal.aborted){throw new Error('Terminal creation request was cancelled before opening a shell.');}
                        const origin:ShellOrigin=r.op==='create'?'mcp':'user';
                        const created=this.shells.create(r.id!,r.cwd,r.allow,origin);
                        try{
                            if(origin==='user'){
                                await this.onUserShellCreated?.(created);
                            }
                            if(cancel.signal.aborted){
                                throw new Error('Terminal creation request disconnected before completion.');
                            }
                            this.aliases.set(r.id!,normalizeAlias(r.id!));
                        }catch(error){
                            this.shells.close(r.id!);
                            throw error;
                        }
                        result=created;
                        break;
                    }
                    case 'list': {
                        const live=this.shells.list();
                        const ids=new Set(live.map(s=>s.shell_id));
                        for(const id of this.aliases.keys()){if(!ids.has(id)){this.aliases.delete(id);}}
                        result=live;
                        break;
                    }
                    case 'execute':result=await this.shells.execute(r.id!,r.command!,r.timeout,cancel.signal);break;
                    case 'execute_isolated': {
                        const {runIsolatedCommand}=require('./tools/isolated-command') as typeof import('./tools/isolated-command');
                        result=await runIsolatedCommand(r.id!,this.shells.root(r.id!),r.command!,r.timeout,cancel.signal);
                        break;
                    }
                    case 'close':
                    case 'close_user':
                    case 'close_panel_user': {
                        const shell=this.shells.list().find(s=>s.shell_id===r.id);
                        if(shell?.origin==='user' && r.op==='close'){
                            throw new Error('User terminal requires explicit local confirmation before closing.');
                        }
                        if(shell?.origin==='user' && (r.op==='close_user'||r.op==='close_panel_user')){
                            const vscode=require('vscode') as typeof import('vscode');
                            const es=vscode.env.language.toLowerCase().startsWith('es');
                            const accept=es?'Cerrar terminal de usuario':'Close user terminal';
                            const warning=es
                                ? 'La IA solicita CERRAR la terminal de usuario '+r.id+
                                  '. Los procesos que siga ejecutando se interrumpirán. ¿Autorizar?'
                                : 'The AI requests CLOSING user terminal '+r.id+
                                  '. Any running processes will be interrupted. Approve?';
                            const choice=await vscode.window.showWarningMessage(warning,{modal:true},accept);
                            if(choice!==accept){throw new Error('User terminal closure was not approved.');}
                            if(cancel.signal.aborted){throw new Error('Closure request disconnected or expired.');}
                        }
                        try {this.shells.close(r.id!);}
                        catch(e){
                            if(this.shells.list().some(s=>s.shell_id===r.id)){throw e;}
                        }
                        this.aliases.delete(r.id!);
                        result={closed:r.id};
                        break;
                    }
                    case 'alias': {
                        const alias=normalizeAlias(r.alias!);
                        if(!this.shells.list().some(s=>s.shell_id===r.id)){throw new Error('Unknown local shell ID.');}
                        // Persist before publishing: a failed save must not leave an
                        // in-memory alias the coordinator does not know about.
                        await this.onAliasChanged?.(r.id!,alias);
                        this.aliases.set(r.id!,alias);
                        result={shell_id:r.id,alias};
                        break;
                    }
                    case 'native': {
                        const root=this.shells.root(r.id!);
                        // Import at use time to keep the standalone router tests independent of the VSCode host.
                        const vscode=require('vscode') as typeof import('vscode');
                        const {runNative}=require('./tools/native-window-tools') as typeof import('./tools/native-window-tools');
                        result=await runNative(vscode,root,r.kind!,r.args||{});
                        break;
                    }
                    default:throw new Error('Unsupported action');
                }
                reply(res,200,{result});
            }catch(e){reply(res,400,{error:e instanceof Error?e.message:String(e)});}
        });
        server.on('error',error=>{
            // An unhandled Node.js server error can terminate the VSCode host.
            // The controller heartbeat repairs an unreachable worker listener.
            console.error('MultiShell MCP window worker listener error: '+String(error));
        });
        server.on('close',()=>{
            if(this.server===server){this.listenerPort=0;}
        });
        await new Promise<void>((resolve,reject)=>{
            server.once('error',reject);
            server.listen(0,HOST,()=>{server.off('error',reject);resolve();});
        });
        this.server=server;
        this.listenerPort=(server.address() as AddressInfo).port;
    }
    async stop():Promise<void>{
        this.panelPermits.clear();
        for(const request of [...this.pendingRequests.values()]){
            request.settle(false);
        }
        const s=this.server;this.server=undefined;this.listenerPort=0;
        if(s?.listening){
            s.closeAllConnections?.();
            await new Promise<void>(resolve=>s.close(()=>resolve()));
        }
    }
}

export class WindowRouter implements ShellApi {
    private readonly workers=new Map<string,WorkerState>();
    private readonly assigned=new Map<string,Assignment>();
    private readonly pending=new Map<string,string>();
    private readonly aliases=new Map<string,string>();
    private readonly shellAliases=new Map<string,string>();
    private readonly reservedAliases=new Set<string>();
    private readonly pendingAliasShells=new Set<string>();
    private reconciliationWork:Promise<void>=Promise.resolve();
    private readonly unreachableWorkers=new Set<string>();
    constructor(readonly secret:string) {}
    register(r:Registration):void {
        if(!/^[a-zA-Z0-9_-]{2,80}$/.test(r.window_id) || !Number.isInteger(r.worker_port) ||
            r.worker_port<1024 || r.worker_port>65535 ||
            typeof r.workspace!=='string' || !r.workspace.trim() || r.workspace.length>4096) {
            throw new Error('Invalid window registration');
        }
        const previous=this.workers.get(r.window_id);
        if(previous && previous.worker_port!==r.worker_port){
            for(const [id,s] of this.assigned){if(s.owner===r.window_id){this.removeAssignment(id);}}
        }
        this.workers.set(r.window_id,{...r,lastSeen:Date.now()});
        this.unreachableWorkers.delete(r.window_id);
    }
    private prune():void {
        for(const [id,w] of this.workers){if(Date.now()-w.lastSeen>12_000){
            this.workers.delete(id);
            this.unreachableWorkers.delete(id);
            for(const [sid,s] of this.assigned){if(s.owner===id){this.removeAssignment(sid);}}
        }}
    }
    private removeAssignment(id:string):void {
        this.assigned.delete(id);
        const alias=this.shellAliases.get(id);
        if(alias){this.aliases.delete(alias);this.shellAliases.delete(id);}
    }
    /** Full IDs are checked first; aliases must be globally unique. */
    resolve(id:string):string {
        this.prune();
        if(this.assigned.has(id)){return id;}
        const shell=typeof id==='string'?this.aliases.get(id.toLowerCase()):undefined;
        if(!shell||!this.assigned.has(shell)){throw new Error('Unknown shell_id or alias: '+id);}
        return shell;
    }
    private available(alias:string,id:string):boolean {
        const existing=this.aliases.get(alias);
        return !this.reservedAliases.has(alias) && (!existing||existing===id)&&
            ![...this.assigned.keys()].some(s=>s!==id&&s.toLowerCase()===alias);
    }
    private uniqueAlias(desired:string,id:string):string {
        let base:string;
        try{base=normalizeAlias(desired);}catch{base=suggestAlias(desired);}
        if(this.available(base,id)){return base;}
        for(let i=2;i<10000;i++){
            const suffix='-'+i;
            const candidate=base.slice(0,40-suffix.length)+suffix;
            if(this.available(candidate,id)){return candidate;}
        }
        throw new Error('No unique alias available.');
    }
    async setAlias(id:string,value:string):Promise<{shell_id:string;alias:string}> {
        const shell=this.resolve(id);
        const alias=normalizeAlias(value);
        if(this.pendingAliasShells.has(shell)){throw new Error('Alias change already in progress for shell: '+shell);}
        if(!this.available(alias,shell)){throw new Error('Alias already in use: '+alias);}
        const owner=this.assigned.get(shell)!.owner;
        this.reservedAliases.add(alias);
        this.pendingAliasShells.add(shell);
        try{
            await this.send(owner,{op:'alias',id:shell,alias});
            const previous=this.shellAliases.get(shell);
            if(previous){this.aliases.delete(previous);}
            this.shellAliases.set(shell,alias);
            this.aliases.set(alias,shell);
            return {shell_id:shell,alias};
        }finally{
            this.reservedAliases.delete(alias);
            this.pendingAliasShells.delete(shell);
        }
    }
    windows():Array<{window_id:string;workspace:string;online:boolean}>{
        this.prune();
        return [...this.workers.values()].map(w=>({window_id:w.window_id,workspace:w.workspace,online:!this.unreachableWorkers.has(w.window_id)}));
    }
    private getWorker(id:string,probe=false):WorkerState {
        this.prune();
        const w=this.workers.get(id);
        if(!w || (!probe && this.unreachableWorkers.has(id))){
            throw new Error('Window '+id+' is offline; wait for its worker to reconnect.');
        }
        return w;
    }
    private async send(windowId:string,r:WorkerAction,signal?:AbortSignal):Promise<any> {
        const w=this.getWorker(windowId,r.op==='list');
        const response=await post(w.worker_port,ACTION_PATH,this.secret,r,
            (r.op==='execute'||r.op==='execute_isolated')? Math.min((r.timeout||120000)+30_000,3_700_000):
            (r.op==='create_user'||r.op==='create_panel_user'||r.op==='close_user'||r.op==='close_panel_user')?120_000:10_000,signal);
        return response.result;
    }
    /** General MCP creation is always temporary. Persistent user shells require local confirmation. */
    async create(id:string,cwd?:string,allowSharedDirectory=false,windowId?:string,origin:ShellOrigin='mcp',
        approval?:'panel'|'modal',signal?:AbortSignal,panelPermit?:string):Promise<ShellDescription> {
        if(origin==='user' && !approval){throw new Error('User terminals require explicit VSCode approval.');}
        if(origin==='automatic'){throw new Error('Automatic primary terminals cannot be created via MCP.');}
        if(!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(id)){throw new Error('Invalid shell_id');}
        if(this.assigned.has(id)||this.pending.has(id)||this.aliases.has(id.toLowerCase())||this.reservedAliases.has(id.toLowerCase())){throw new Error('shell_id already exists or conflicts with an alias: '+id);}
        const windows=this.windows();
        if(!windows.length){throw new Error('No VSCode window is online.');}
        if(windows.length>1 && !windowId){throw new Error('Several windows are open: call list_windows_code and supply window_id.');}
        const selected=windowId || windows[0].window_id;
        const worker=this.getWorker(selected);
        const directory=fs.realpathSync(resolveWorkingDirectory(worker.workspace,cwd));
        const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
        if(!allowSharedDirectory &&
            ([...this.assigned.values()].some(s=>same(s.cwd,directory)) ||
             [...this.pending.values()].some(x=>same(x,directory)))) {
            throw new Error('Directory belongs to another shell. Use a Git worktree or allow_shared_directory=true.');
        }
        this.pending.set(id,directory);
        try {
            if(signal?.aborted){throw new Error('Shell creation cancelled before the worker request.');}
            const op=origin==='user'?(approval==='panel'?'create_panel_user':'create_user'):'create';
            let shell:ShellDescription;
            try{
                shell=await this.send(selected,{op,id,cwd:directory,allow:allowSharedDirectory,
                    panelPermit:approval==='panel'?panelPermit:undefined},signal) as ShellDescription;
            }catch(error){
                // The worker may have completed a TEMP creation while the
                // upstream connection disappeared. Reconcile this exact ID
                // without touching persistent user terminals.
                if(signal?.aborted&&origin==='mcp'){
                    try{
                        const live=await this.send(selected,{op:'list'}) as ShellDescription[];
                        if(live.some(item=>item.shell_id===id&&item.origin==='mcp'&&
                            (process.platform==='win32'?item.initial_cwd.toLowerCase()===directory.toLowerCase():
                                item.initial_cwd===directory))){
                            await this.send(selected,{op:'close',id});
                        }
                    }catch{}
                }
                throw error;
            }
            // The caller may have disconnected while the worker finished a
            // creation. Never publish or return a cancelled temporary shell.
            if(signal?.aborted){
                if(origin==='mcp'){
                    try{await this.send(selected,{op:'close',id});}catch{}
                }
                throw new Error('Shell creation cancelled after worker completion.');
            }
            this.assigned.set(id,{owner:selected,cwd:shell.initial_cwd});
            try{await this.setAlias(id,this.uniqueAlias(id,id));}
            catch(e){this.removeAssignment(id);try{await this.send(selected,{op:origin==='user'?'close_panel_user':'close',id});}catch{}throw e;}
            return {...shell,alias:this.shellAliases.get(id),window_id:selected} as ShellDescription;
        } finally {
            this.pending.delete(id);
        }
    }
    /** The AI may request, but never grant, creation of a persistent user terminal. */
    createUserWithApproval(id:string,cwd?:string,allowSharedDirectory=false,windowId?:string,signal?:AbortSignal):Promise<ShellDescription>{
        return this.create(id,cwd,allowSharedDirectory,windowId,'user','modal',signal);
    }
    /** Trusted local VSCode panel action: user clicked Create in this window. */
    createPanelUser(id:string,cwd?:string,allowSharedDirectory=false,windowId?:string,panelPermit?:string):Promise<ShellDescription>{
        return this.create(id,cwd,allowSharedDirectory,windowId,'user','panel',undefined,panelPermit);
    }
    async list():Promise<ShellDescription[]> {
        this.prune();
        const results=await Promise.all([...this.workers].map(async ([id])=>{
            try{
                const found=await this.send(id,{op:'list'}) as ShellDescription[];
                this.unreachableWorkers.delete(id);
                return found.filter(x=>this.assigned.get(x.shell_id)?.owner===id).map(x=>({...x,alias:this.shellAliases.get(x.shell_id),window_id:id}));
            }catch{
                this.unreachableWorkers.add(id);
                return [];
            }
        }));
        return results.flat();
    }
    ownerOf(id:string):string|undefined {
        this.prune();
        return this.assigned.get(this.resolve(id))?.owner;
    }
    root(id:string):string {
        this.prune();
        const a=this.assigned.get(this.resolve(id));
        if(!a){throw new Error('Unknown shell_id: '+id);}
        this.getWorker(a.owner);
        return a.cwd;
    }
    async execute(id:string,command:string,timeout=120000,signal?:AbortSignal):Promise<ShellExecutionResult> {
        const a=this.assigned.get(this.resolve(id));
        if(!a){throw new Error('Unknown shell_id: '+id);}
        return this.send(a.owner,{op:'execute',id:this.resolve(id),command,timeout},signal) as Promise<ShellExecutionResult>;
    }
    async executeIsolated(id:string,command:string,timeout=120000,signal?:AbortSignal):Promise<ShellExecutionResult> {
        const shell=this.resolve(id);
        const a=this.assigned.get(shell);
        if(!a){throw new Error('Unknown shell_id: '+id);}
        return this.send(a.owner,{op:'execute_isolated',id:shell,command,timeout},signal) as Promise<ShellExecutionResult>;
    }
    async native(id:string,kind:NativeKind,args:NativeArgs):Promise<unknown> {
        const shell=this.resolve(id);
        const owner=this.assigned.get(shell)!.owner;
        return this.send(owner,{op:'native',id:shell,kind,args});
    }
    async close(id:string,fromPanel=false):Promise<void>{
        const a=this.assigned.get(this.resolve(id));
        if(!a){throw new Error('Unknown shell_id: '+id);}
        const shell=this.resolve(id);
        if(shell.startsWith('main-')){throw new Error('The main shell cannot be closed through MCP.');}
        try {
            const live=await this.send(a.owner,{op:'list'}) as ShellDescription[];
            const isUser=live.find(s=>s.shell_id===shell)?.origin==='user';
            const op=isUser?(fromPanel?'close_panel_user':'close_user'):'close';
            await this.send(a.owner,{op,id:shell});
        } catch(e) {
            // If VSCode closed the shell itself, discard its stale router assignment.
            const live=await this.send(a.owner,{op:'list'}) as ShellDescription[];
            if(live.some(s=>s.shell_id===shell)){throw e;}
        }
        this.removeAssignment(shell);
    }
    /** Reconcile one complete worker snapshot; never publish a half-applied alias batch. */
    async reconcile(windowId:string):Promise<void> {
        // Registrations from several windows may arrive together at hub startup.
        const previous=this.reconciliationWork;
        let release:()=>void=()=>{};
        this.reconciliationWork=new Promise<void>(done=>{release=done;});
        await previous;
        try{await this.reconcileLocked(windowId);}
        finally{release();}
    }
    private async reconcileLocked(windowId:string):Promise<void> {
        const shells=await this.send(windowId,{op:'list'}) as ShellDescription[];
        const live=new Set<string>();
        for(const shell of shells){
            if(!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(shell.shell_id) ||
                live.has(shell.shell_id)){
                throw new Error('Invalid or duplicate shell ID during reconciliation: '+shell.shell_id);
            }
            live.add(shell.shell_id);
            const previous=this.assigned.get(shell.shell_id);
            if(previous && previous.owner!==windowId){
                throw new Error('Conflicting shell ID across VSCode windows: '+shell.shell_id);
            }
        }
        const stagedAssigned=new Map(this.assigned);
        const stagedAliases=new Map(this.aliases);
        const stagedShellAliases=new Map(this.shellAliases);
        const obsolete:string[]=[];
        for(const [id,assignment] of stagedAssigned){
            if(assignment.owner===windowId&&!live.has(id)){
                obsolete.push(id);
                stagedAssigned.delete(id);
                const alias=stagedShellAliases.get(id);
                if(alias){stagedAliases.delete(alias);stagedShellAliases.delete(id);}
            }
        }
        for(const shell of shells){
            const conflictingAlias=stagedAliases.get(shell.shell_id.toLowerCase());
            if(conflictingAlias && conflictingAlias!==shell.shell_id){
                throw new Error('Shell ID conflicts with another shell alias: '+shell.shell_id);
            }
            stagedAssigned.set(shell.shell_id,{owner:windowId,cwd:shell.initial_cwd});
        }
        const registered=this.getWorker(windowId);
        const planned:Array<{id:string;alias:string;previous:string}>=[];
        const available=(alias:string,id:string):boolean=>
            !this.reservedAliases.has(alias) &&
            (!stagedAliases.has(alias)||stagedAliases.get(alias)===id) &&
            ![...stagedAssigned.keys()].some(shellId=>shellId!==id&&shellId.toLowerCase()===alias);
        const unique=(requested:string,id:string):string=>{
            let base:string;
            try{base=normalizeAlias(requested);}catch{base=suggestAlias(requested);}
            if(available(base,id)){return base;}
            for(let i=2;i<10000;i++){
                const suffix='-'+i;
                const alias=base.slice(0,40-suffix.length)+suffix;
                if(available(alias,id)){return alias;}
            }
            throw new Error('No unique alias available.');
        };
        for(const shell of shells){
            const id=shell.shell_id;
            const requested=registered.aliases?.[id] ||
                (id.startsWith('main-')?suggestAlias(registered.workspace):id);
            const alias=unique(requested,id);
            const old=stagedShellAliases.get(id);
            if(old===alias){continue;}
            const previous=registered.aliases?.[id] || old || normalizeAlias(id);
            if(old){stagedAliases.delete(old);}
            stagedShellAliases.set(id,alias);
            stagedAliases.set(alias,id);
            planned.push({id,alias,previous:normalizeAlias(previous)});
        }

        // Keep concurrent create/rename requests away from uncommitted IDs and aliases.
        const protectedIds:string[]=[];
        for(const shell of shells){
            if(!this.assigned.has(shell.shell_id)){
                if(this.pending.has(shell.shell_id)){
                    throw new Error('Shell ID is still being created: '+shell.shell_id);
                }
                protectedIds.push(shell.shell_id);
            }
        }
        for(const change of planned){
            if(this.pendingAliasShells.has(change.id)){
                throw new Error('Alias change in progress for shell: '+change.id);
            }
        }
        for(const id of protectedIds){
            this.pending.set(id,stagedAssigned.get(id)!.cwd);
        }
        for(const change of planned){
            this.reservedAliases.add(change.alias);
            this.pendingAliasShells.add(change.id);
        }
        const applied:typeof planned=[];
        try{
            for(const change of planned){
                await this.send(windowId,{op:'alias',id:change.id,alias:change.alias});
                applied.push(change);
            }
            // Nothing is published in the router until all worker saves succeed.
            for(const id of obsolete){this.removeAssignment(id);}
            for(const shell of shells){
                this.assigned.set(shell.shell_id,{owner:windowId,cwd:shell.initial_cwd});
            }
            for(const change of planned){
                const old=this.shellAliases.get(change.id);
                if(old){this.aliases.delete(old);}
                this.shellAliases.set(change.id,change.alias);
                this.aliases.set(change.alias,change.id);
            }
        }catch(error){
            const rollbackErrors:string[]=[];
            for(const change of applied.reverse()){
                try{await this.send(windowId,{op:'alias',id:change.id,alias:change.previous});}
                catch(rollbackError){rollbackErrors.push(change.id+': '+String(rollbackError));}
            }
            if(rollbackErrors.length){
                throw new Error('Reconciliation failed: '+String(error)+
                    '; worker alias rollback incomplete: '+rollbackErrors.join('; '));
            }
            throw error;
        }finally{
            for(const id of protectedIds){this.pending.delete(id);}
            for(const change of planned){
                this.reservedAliases.delete(change.alias);
                this.pendingAliasShells.delete(change.id);
            }
        }
    }

}
export class MultiWindowController {
    readonly router:WindowRouter;
    readonly worker:WindowWorker;
    readonly localShells:ShellManager;
    primaryShellId:string;
    get listeningPort():number{return this.port;}
    private leader?:{stop():Promise<void>;isHealthy?():boolean};
    private pulse?:ReturnType<typeof setInterval>;
    private heartbeatWork?:Promise<void>;
    private busy=false;
    private stopped=false;
    private role:'hub'|'worker'='worker';
    constructor(private readonly port:number,private readonly token:string,workspace:string,
        private readonly createHub:(router:WindowRouter)=>Promise<{stop():Promise<void>;isHealthy?():boolean}>,
        private readonly status:(role:'hub'|'worker',windowId:string)=>void=()=>{},
        private readonly primaryAlias?:string,
        private readonly preferredPrimaryId?:string,
        private readonly savedUserShells:readonly SavedUserShell[] = [],
        private readonly onAliasChanged:((id:string,alias:string)=>Promise<void>) | undefined = undefined,
        private readonly onUserShellCreated:((shell:ShellDescription)=>Promise<void>) | undefined = undefined,
        windowAutoExit=true,
        shellInteractiveOverrides:Record<string,boolean>={},
        savedIdleProofs:Record<string,SavedIdleProof>={},
        private readonly onPrimaryChanged?:((id:string)=>Promise<void>)) {
        this.localShells=new ShellManager();
        this.localShells.setInteractivePolicy?.(windowAutoExit,shellInteractiveOverrides);
        this.localShells.setSavedIdleProofs?.(savedIdleProofs);
        this.worker=new WindowWorker(this.localShells,token,workspace,onAliasChanged,onUserShellCreated,true);
        this.primaryShellId='main-'+this.worker.id;
        this.worker.aliases.set(this.primaryShellId,primaryAlias && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(primaryAlias) ? normalizeAlias(primaryAlias) : suggestAlias(workspace));
        this.router=new WindowRouter(token);
    }
    private registration():Registration {
        const live=new Set(this.localShells.list().map(s=>s.shell_id));
        for(const id of this.worker.aliases.keys()){
            if(!live.has(id)){this.worker.aliases.delete(id);}
        }
        return {window_id:this.worker.id,workspace:this.worker.workspace,worker_port:this.worker.port,aliases:Object.fromEntries(this.worker.aliases)};
    }
    private async register():Promise<void>{
        if(this.leader){
            this.router.register(this.registration());
            await this.router.reconcile(this.worker.id);
        } else {
            await post(this.port,REGISTER_PATH,this.token,this.registration());
        }
    }
    async start():Promise<void>{
        // Recover VSCode's real terminal objects before creating any new main shell.
        // Persisted IDs only win when they match a terminal restored in this window.
        const original=await this.localShells.awaitRestoredMainTerminals?.(
            this.worker.workspace,this.preferredPrimaryId);
        if(original){
            this.worker.aliases.delete(this.primaryShellId);
            this.primaryShellId=original;
            for(const shell of this.localShells.list()){
                this.worker.aliases.set(shell.shell_id,normalizeAlias(shell.shell_id));
            }
            const alias=this.primaryAlias && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(this.primaryAlias)
                ?normalizeAlias(this.primaryAlias):suggestAlias(this.worker.workspace);
            this.worker.aliases.set(this.primaryShellId,alias);
        }
        this.ensurePrimary();
        await this.localShells.resumeProvenIdleTerminals?.();
        await this.worker.start();
        try{
            await this.elect();
        }catch(e){
            try{await this.leader?.stop();}finally{this.leader=undefined;}
            await this.worker.stop();this.localShells.dispose(true);throw e;
        }
        this.pulse=setInterval(()=>{
            if(this.heartbeatWork){return;}
            const work=this.heartbeat();
            this.heartbeatWork=work;
            void work.finally(()=>{if(this.heartbeatWork===work){this.heartbeatWork=undefined;}});
        },3000);
    }
    private async elect():Promise<void>{
        try {
            const hub=await this.createHub(this.router);
            this.leader=hub;this.role='hub';
            try{
                if(this.stopped){throw new Error('MultiShell controller already stopped.');}
                await this.register();
                if(this.stopped){throw new Error('MultiShell controller stopped during registration.');}
                this.status('hub',this.worker.id);
            }catch(error){
                this.leader=undefined;
                await hub.stop();
                throw error;
            }
        } catch (e) {
            if((e as NodeJS.ErrnoException).code!=='EADDRINUSE'){throw e;}
            // Register only with a compatible authenticated MultiShell MCP hub.
            await this.register();
            this.role='worker';this.status('worker',this.worker.id);
        }
    }
    private async heartbeat():Promise<void>{
        if(this.stopped||this.busy){return;}
        this.busy=true;
        try{
            await this.preferLateRestoredPrimary();
            this.ensurePrimary();
            await this.localShells.resumeProvenIdleTerminals?.();
            // Worker TCP listeners are independent of the shared hub. If one
            // dies unexpectedly, rebind its ephemeral port before registration.
            if(!this.worker.isHealthy()){
                await this.worker.start();
                if(this.stopped){return;}
            }
            // A hub can lose its HTTP listener without losing its in-memory
            // leader reference. Release it and re-elect on the next heartbeat.
            if(this.leader && this.leader.isHealthy?.()===false){
                const old=this.leader;
                this.leader=undefined;
                try{await old.stop();}catch{}
                if(this.stopped){return;}
                await this.elect();
            }else{
                await this.register();
            }
        }catch{
            // A heartbeat may finish after stop() begins: never re-elect on shutdown.
            if(!this.stopped && !this.leader){
                try{await this.elect();}catch{}
            }
        }finally{this.busy=false;}
    }
    /** VS Code can restore a terminal after initial activation. Replace only
     * an unused fallback created by this instance; never dispose an active
     * terminal or abandon commands that have already been sent to it. */
    private async preferLateRestoredPrimary():Promise<void>{
        if(!this.preferredPrimaryId||this.primaryShellId===this.preferredPrimaryId){
            return;
        }
        const candidate=this.localShells.findRestorableMainId?.(
            this.worker.workspace,this.preferredPrimaryId);
        if(candidate!==this.preferredPrimaryId){return;}
        const fallback=this.primaryShellId;
        // Never attach a second main while the current fallback is in use.
        // Otherwise a late terminal would appear as another main in the panel.
        if(!this.localShells.canRetireUnusedFallbackMain?.(fallback)){return;}
        const restored=this.localShells.restoreMainTerminals?.(
            this.worker.workspace,this.preferredPrimaryId);
        if(restored!==this.preferredPrimaryId){return;}
        if(!this.localShells.retireUnusedFallbackMain?.(fallback)){return;}
        this.worker.aliases.delete(fallback);
        this.primaryShellId=restored;
        this.worker.aliases.set(restored,
            this.primaryAlias && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(this.primaryAlias)
                ?normalizeAlias(this.primaryAlias):suggestAlias(this.worker.workspace));
        try{await this.onPrimaryChanged?.(restored);}
        catch(error){console.error('Failed to persist recovered primary terminal: '+String(error));}
    }
    async snapshotSafeIdleProofs():Promise<Record<string,SavedIdleProof>>{
        return await this.localShells.snapshotSafeIdleProofs?.()||{};
    }
    private ensurePrimary():void {
        // Reassociate real user terminals restored by VSCode, including late
        // restoration. Never create a replacement user terminal.
        for(const shell of this.localShells.restoreUserTerminals?.(this.worker.workspace,this.savedUserShells)||[]){
            const saved=this.savedUserShells.find(s=>s.shell_id===shell.shell_id);
            this.worker.aliases.set(shell.shell_id,saved?.alias ? normalizeAlias(saved.alias):normalizeAlias(shell.shell_id));
        }
        if(!this.localShells.list().some(s=>s.shell_id===this.primaryShellId)) {
            this.localShells.create(this.primaryShellId,this.worker.workspace,true,'automatic');
        }
    }
    public async panelState():Promise<{
        role:'hub'|'worker';windowId:string;workspace:string;primary:string;
        shells:ShellDescription[];
        windowAutoExit:boolean;
        requests:UserShellRequest[];
        windows:Array<{window_id:string;workspace:string;online:boolean}>;
    }> {
        let windows:Array<{window_id:string;workspace:string;online:boolean}>=[];
        if(this.leader){windows=this.router.windows();}
        else {
            try {
                const data=await post(this.port,CONTROL_PATH,this.token,{op:'windows'});
                windows=data.result;
            } catch {
                windows=[{window_id:this.worker.id,workspace:this.worker.workspace,online:false}];
            }
        }
        return {role:this.role,windowId:this.worker.id,workspace:this.worker.workspace,
            primary:this.primaryShellId,
            shells:this.localShells.list().map(s=>({...s,alias:this.worker.aliases.get(s.shell_id)})),
            requests:this.worker.listPendingUserRequests(),
            windowAutoExit:this.localShells.windowAutoExit??true,windows};
    }
    /** These controls are exposed to the local panel only, not to MCP HTTP. */
    panelDecideUserRequest(id:string,approved:boolean):boolean{
        return this.worker.decideUserRequest(id,approved);
    }
    panelSetWindowAutoExit(value:boolean):void{
        this.localShells.setWindowInteractiveAutoExit(value);
    }
    panelSetShellAutoExit(id:string,value:boolean|undefined):void{
        this.localShells.setShellInteractiveAutoExit(id,value);
    }
    panelGetShellOverrides():Record<string,boolean>{
        return this.localShells.getInteractiveOverrides();
    }
    public async panelCreateShell(id:string,cwd?:string,share=false):Promise<ShellDescription> {
        // Issued only from a message sent by the webview that the user controls.
        // Bind one approval to the exact resolved directory, ID and sharing flag.
        const directory=fs.realpathSync(resolveWorkingDirectory(this.worker.workspace,cwd));
        const panelPermit=this.worker.authorizePanelCreation(id,directory,share);
        try{
            if(this.leader){
                return await this.router.createPanelUser(id,directory,share,this.worker.id,panelPermit);
            }
            const data=await post(this.port,CONTROL_PATH,this.token,
                {op:'create',id,cwd:directory,share,origin:'user',
                    window_id:this.worker.id,panelPermit},120_000);
            return data.result;
        }finally{
            this.worker.revokePanelCreation(panelPermit);
        }
    }
    public async panelSetAlias(id:string,alias:string):Promise<{shell_id:string;alias:string}> {
        if(!this.localShells.list().some(s=>s.shell_id===id)){throw new Error('This shell belongs to another window.');}
        if(this.leader){return this.router.setAlias(id,alias);}
        const data=await post(this.port,CONTROL_PATH,this.token,{op:'alias',id,alias,window_id:this.worker.id});
        return data.result;
    }
    public async panelCloseShell(id:string):Promise<void> {
        if(id===this.primaryShellId){throw new Error('The main shell cannot be closed from the panel.');}
        if(!this.localShells.list().some(s=>s.shell_id===id)) {
            // A manual VSCode terminal close can race with the panel click.
            await this.register();
            return;
        }
        if(this.leader){await this.router.close(id,true);}
        else {await post(this.port,CONTROL_PATH,this.token,{op:'close',id,window_id:this.worker.id},120_000);}
    }
    public async panelConfirmRestoredShell(id:string):Promise<ShellDescription> {
        if(!this.localShells.list().some(s=>s.shell_id===id)){
            throw new Error('Restored terminal does not belong to this window.');
        }
        // Confirmation is restricted to the owning window and never delegated to
        // an arbitrary MCP client through a public shell tool.
        return this.localShells.confirmRestoredUserShell(id);
    }
    public panelShowShell(id:string):void {
        this.localShells.show(id);
    }
    async stop(preserveTerminals=false):Promise<void>{
        if(this.stopped){return;}
        this.stopped=true;
        if(this.pulse){clearInterval(this.pulse);}
        // Wait for the in-flight registration/election before freeing the worker.
        await this.heartbeatWork?.catch(()=>{});
        try{await this.leader?.stop();}
        finally{await this.worker.stop();this.localShells.dispose(preserveTerminals);}
    }
}