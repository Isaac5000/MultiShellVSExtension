import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ShellManager, ShellDescription, ShellExecutionResult, ShellOrigin, SavedUserShell } from './shell-manager';
import { ShellApi } from './shell-api';
import type { NativeKind, NativeArgs } from './tools/native-window-tools';

const HOST = '127.0.0.1';
export const REGISTER_PATH = '/_multishell/register';
export const CONTROL_PATH = '/_multishell/control';
const ACTION_PATH = '/_multishell/action';
const MAX_BODY = 2_000_000;

type WorkerAction = { op:'create'|'list'|'execute'|'close'|'alias'|'native'; id?:string; cwd?:string; allow?:boolean; command?:string; timeout?:number; alias?:string; origin?:ShellOrigin; kind?:NativeKind; args?:NativeArgs };
export interface Registration { window_id:string; workspace:string; worker_port:number; aliases?:Record<string,string>; }
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
async function post(port:number,uri:string,secret:string,value:unknown,timeoutMs=10000):Promise<any> {
    const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),timeoutMs);
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
    }finally{clearTimeout(timer);}
}

/** VSCode terminals stay owned by the window that created them. */
export class WindowWorker {
    readonly id:string;
    readonly workspace:string;
    private server?:HttpServer;
    private listenerPort=0;
    readonly aliases=new Map<string,string>();
    constructor(private readonly shells:ShellManager,private readonly secret:string,workspace:string){
        this.workspace=workspace;
        const name=(path.basename(workspace)||'window').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,22);
        this.id=name+'-'+randomUUID().slice(0,8);
    }
    get port():number{return this.listenerPort;}
    async start():Promise<void>{
        if(this.server){return;}
        const server=createServer(async (req,res)=>{
            if(req.method!=='POST'||req.url!==ACTION_PATH){reply(res,404,{error:'Not found'});return;}
            if(!authenticated(req.headers['x-multishell-token'],this.secret)){reply(res,403,{error:'Unauthorized'});return;}
            try{
                const r=await body(req) as WorkerAction;
                let result:unknown;
                switch(r.op){
                    case 'create':result=this.shells.create(r.id!,r.cwd,r.allow,r.origin==='user'?'user':'mcp');this.aliases.set(r.id!,normalizeAlias(r.id!));break;
                    case 'list': {
                        const live=this.shells.list();
                        const ids=new Set(live.map(s=>s.shell_id));
                        for(const id of this.aliases.keys()){if(!ids.has(id)){this.aliases.delete(id);}}
                        result=live;
                        break;
                    }
                    case 'execute':result=await this.shells.execute(r.id!,r.command!,r.timeout);break;
                    case 'close': {
                        try {this.shells.close(r.id!);}
                        catch(e){
                            // The user may have closed the terminal directly in VSCode.
                            if(this.shells.list().some(s=>s.shell_id===r.id)){throw e;}
                        }
                        this.aliases.delete(r.id!);
                        result={closed:r.id};
                        break;
                    }
                    case 'alias': {
                        const alias=normalizeAlias(r.alias!);
                        if(!this.shells.list().some(s=>s.shell_id===r.id)){throw new Error('Unknown local shell ID.');}
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
        await new Promise<void>((resolve,reject)=>{
            server.once('error',reject);
            server.listen(0,HOST,()=>{server.off('error',reject);resolve();});
        });
        this.server=server;
        this.listenerPort=(server.address() as AddressInfo).port;
    }
    async stop():Promise<void>{
        const s=this.server;this.server=undefined;this.listenerPort=0;
        if(s){s.closeAllConnections?.();await new Promise<void>(resolve=>s.close(()=>resolve()));}
    }
}

export class WindowRouter implements ShellApi {
    private readonly workers=new Map<string,WorkerState>();
    private readonly assigned=new Map<string,Assignment>();
    private readonly pending=new Map<string,string>();
    private readonly aliases=new Map<string,string>();
    private readonly shellAliases=new Map<string,string>();
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
    }
    private prune():void {
        for(const [id,w] of this.workers){if(Date.now()-w.lastSeen>12_000){
            this.workers.delete(id);
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
        return (!existing||existing===id)&&
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
        if(!this.available(alias,shell)){throw new Error('Alias already in use: '+alias);}
        const owner=this.assigned.get(shell)!.owner;
        await this.send(owner,{op:'alias',id:shell,alias});
        const previous=this.shellAliases.get(shell);
        if(previous){this.aliases.delete(previous);}
        this.shellAliases.set(shell,alias);
        this.aliases.set(alias,shell);
        return {shell_id:shell,alias};
    }
    windows():Array<{window_id:string;workspace:string;online:boolean}>{
        this.prune();
        return [...this.workers.values()].map(w=>({window_id:w.window_id,workspace:w.workspace,online:true}));
    }
    private getWorker(id:string):WorkerState {
        this.prune();
        const w=this.workers.get(id);
        if(!w){throw new Error('Window '+id+' is offline; choose an active window.');}
        return w;
    }
    private async send(windowId:string,r:WorkerAction):Promise<any> {
        const w=this.getWorker(windowId);
        const response=await post(w.worker_port,ACTION_PATH,this.secret,r,
            r.op==='execute'? Math.min((r.timeout||120000)+30_000,3_700_000):10_000);
        return response.result;
    }
    async create(id:string,cwd?:string,allowSharedDirectory=false,windowId?:string,origin:ShellOrigin='mcp'):Promise<ShellDescription> {
        if(!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(id)){throw new Error('Invalid shell_id');}
        if(this.assigned.has(id)||this.pending.has(id)||this.aliases.has(id.toLowerCase())){throw new Error('shell_id already exists or conflicts with an alias: '+id);}
        const windows=this.windows();
        if(!windows.length){throw new Error('No VSCode window is online.');}
        if(windows.length>1 && !windowId){throw new Error('Several windows are open: call list_windows_code and supply window_id.');}
        const selected=windowId || windows[0].window_id;
        const worker=this.getWorker(selected);
        const directory=resolveWorkingDirectory(worker.workspace,cwd);
        const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
        if(!allowSharedDirectory &&
            ([...this.assigned.values()].some(s=>same(s.cwd,directory)) ||
             [...this.pending.values()].some(x=>same(x,directory)))) {
            throw new Error('Directory belongs to another shell. Use a Git worktree or allow_shared_directory=true.');
        }
        this.pending.set(id,directory);
        try {
            const shell=await this.send(selected,{op:'create',id,cwd:directory,allow:allowSharedDirectory,origin}) as ShellDescription;
            this.assigned.set(id,{owner:selected,cwd:shell.initial_cwd});
            try{await this.setAlias(id,this.uniqueAlias(id,id));}
            catch(e){this.removeAssignment(id);try{await this.send(selected,{op:'close',id});}catch{}throw e;}
            return {...shell,alias:this.shellAliases.get(id),window_id:selected} as ShellDescription;
        } finally {
            this.pending.delete(id);
        }
    }
    async list():Promise<ShellDescription[]> {
        this.prune();
        const results=await Promise.all([...this.workers].map(async ([id])=>{
            try{
                const found=await this.send(id,{op:'list'}) as ShellDescription[];
                return found.filter(x=>this.assigned.get(x.shell_id)?.owner===id).map(x=>({...x,alias:this.shellAliases.get(x.shell_id),window_id:id}));
            }catch{return [];}
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
    async execute(id:string,command:string,timeout=120000):Promise<ShellExecutionResult> {
        const a=this.assigned.get(this.resolve(id));
        if(!a){throw new Error('Unknown shell_id: '+id);}
        return this.send(a.owner,{op:'execute',id:this.resolve(id),command,timeout}) as Promise<ShellExecutionResult>;
    }
    async native(id:string,kind:NativeKind,args:NativeArgs):Promise<unknown> {
        const shell=this.resolve(id);
        const owner=this.assigned.get(shell)!.owner;
        return this.send(owner,{op:'native',id:shell,kind,args});
    }
    async close(id:string):Promise<void>{
        const a=this.assigned.get(this.resolve(id));
        if(!a){throw new Error('Unknown shell_id: '+id);}
        const shell=this.resolve(id);
        try {
            await this.send(a.owner,{op:'close',id:shell});
        } catch(e) {
            // If VSCode closed the shell itself, discard its stale router assignment.
            const live=await this.send(a.owner,{op:'list'}) as ShellDescription[];
            if(live.some(s=>s.shell_id===shell)){throw e;}
        }
        this.removeAssignment(shell);
    }
    /** Reconstruct assignments after a main-window restart/failover. */
    async reconcile(windowId:string):Promise<void> {
        const shells=await this.send(windowId,{op:'list'}) as ShellDescription[];
        const live=new Set(shells.map(s=>s.shell_id));
        for(const [id,a] of this.assigned){if(a.owner===windowId&&!live.has(id)){this.removeAssignment(id);}}
        for(const shell of shells) {
            const conflictingAlias=this.aliases.get(shell.shell_id.toLowerCase());
            if(conflictingAlias && conflictingAlias!==shell.shell_id){
                throw new Error('Shell ID conflicts with another shell alias: '+shell.shell_id);
            }
            const previous=this.assigned.get(shell.shell_id);
            if(previous && previous.owner!==windowId) {
                throw new Error('Conflicting shell ID across VSCode windows: '+shell.shell_id);
            }
            if(!previous){this.assigned.set(shell.shell_id,{owner:windowId,cwd:shell.initial_cwd});}
            const registered=this.workers.get(windowId)!;
            const requested=registered.aliases?.[shell.shell_id] ||
                (shell.shell_id.startsWith('main-')?suggestAlias(registered.workspace):shell.shell_id);
            const desired=this.uniqueAlias(requested,shell.shell_id);
            if(this.shellAliases.get(shell.shell_id)!==desired){
                await this.setAlias(shell.shell_id,desired);
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
    private leader?:{stop():Promise<void>};
    private pulse?:ReturnType<typeof setInterval>;
    private busy=false;
    private stopped=false;
    private role:'hub'|'worker'='worker';
    constructor(private readonly port:number,private readonly token:string,workspace:string,
        private readonly createHub:(router:WindowRouter)=>Promise<{stop():Promise<void>}>,
        private readonly status:(role:'hub'|'worker',windowId:string)=>void=()=>{},
        private readonly primaryAlias?:string,
        private readonly preferredPrimaryId?:string,
        private readonly savedUserShells:readonly SavedUserShell[] = []) {
        this.localShells=new ShellManager();
        this.worker=new WindowWorker(this.localShells,token,workspace);
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
        await this.worker.start();
        try{
            await this.elect();
        }catch(e){
            await this.worker.stop();this.localShells.dispose(true);throw e;
        }
        this.pulse=setInterval(()=>{void this.heartbeat();},3000);
    }
    private async elect():Promise<void>{
        try {
            const hub=await this.createHub(this.router);
            this.leader=hub;this.role='hub';
            await this.register();
            this.status('hub',this.worker.id);
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
            this.ensurePrimary();
            await this.register();
        }catch{
            // Leader may have been closed. Other windows compete safely for port 3000.
            if(!this.leader){
                try{await this.elect();}catch{}
            }
        }finally{this.busy=false;}
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
            primary:this.primaryShellId,shells:this.localShells.list().map(s=>({...s,alias:this.worker.aliases.get(s.shell_id)})),windows};
    }
    public async panelCreateShell(id:string,cwd?:string,share=false):Promise<ShellDescription> {
        if(this.leader){return this.router.create(id,cwd,share,this.worker.id,'user');}
        const data=await post(this.port,CONTROL_PATH,this.token,
            {op:'create',id,cwd,share,origin:'user',window_id:this.worker.id});
        return data.result;
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
        if(this.leader){await this.router.close(id);}
        else {await post(this.port,CONTROL_PATH,this.token,{op:'close',id,window_id:this.worker.id});}
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
        try{await this.leader?.stop();}
        finally{await this.worker.stop();this.localShells.dispose(preserveTerminals);}
    }
}