import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import {ChildProcess,spawn} from 'child_process';
import {tunnelAsset,verifiedExecutable,validateProfileName,validateTunnelId,
    execChecked,TUNNEL_VERSION,TUNNEL_RELEASE_URL} from './tunnel-release';
import {TunnelLaunchLock,processIsAlive} from './tunnel-lock';
import {TunnelProcessIdentity,readTunnelProcessIdentity,sameTunnelProcess} from './tunnel-process';
import {discoverExistingProfiles,inspectExistingProfile,ExistingTunnelProfile,
    syncManagedProfilePort} from './tunnel-profile';

const SECRET_KEY='multiShellMcpTunnelRuntimeApiKey';
const PROFILE_KEY='multiShellMcpTunnelProfile';
const EXISTING_FILE_KEY='multiShellMcpTunnelExistingProfileFile';
const AUTO_KEY='multiShellMcpTunnelAutoStart';
const DEFAULT_PROFILE='vscode-local';
const HEALTH_PORT=8080;
const SUPERVISION_INTERVAL_MS=10_000;
const MAX_UNEXPECTED_RESTARTS=5;

export type TunnelStatus={
    installed:boolean;version:string;configured:boolean;autostart:boolean;
    childRunning:boolean;listenerOccupied:boolean;ready:boolean;
    owner:'extension'|'adopted'|'detached'|'external'|'none';profile:string;
    source:'managed'|'existing';retryFailures:number;retryPaused:boolean;
};
function settingsDir(context:vscode.ExtensionContext):string{
    return path.join(context.globalStorageUri.fsPath,'tunnel-profiles');
}
async function checkUrl(pathname:string):Promise<boolean>{
    try{
        const response=await fetch('http://127.0.0.1:'+HEALTH_PORT+'/'+pathname,{
            signal:AbortSignal.timeout(1400)});
        await response.body?.cancel();
        return response.ok;
    }catch{return false;}
}
export async function isPortOccupied(port:number):Promise<boolean>{
    return new Promise(resolve=>{
        const socket=net.connect({host:'127.0.0.1',port});
        let done=false;
        const finish=(value:boolean)=>{
            if(done){return;}
            done=true;socket.destroy();resolve(value);
        };
        socket.once('connect',()=>finish(true));
        socket.once('error',()=>finish(false));
        socket.setTimeout(1400,()=>finish(false));
    });
}
function message(error:unknown):string{
    // Neither errors from Tunnel Client nor raw process output may be exposed.
    return error instanceof Error?error.message:String(error);
}
/** All credentials and start/stop actions remain local VS Code commands.
 * The public MCP tool and window worker have no tunnel-management endpoint. */
export class TunnelManager{
    private child:ChildProcess|undefined;
    private adopted?:TunnelProcessIdentity;
    private busy:Promise<unknown>|undefined;
    private disposed=false;
    private shuttingDown=false;
    private timer?:NodeJS.Timeout;
    private startedAt=0;
    private nextAttempt=0;
    private unexpectedFailures=0;
    private autoPaused=false;
    private readonly launchLock:TunnelLaunchLock;
    constructor(private readonly context:vscode.ExtensionContext,
        private readonly currentMcpPort:()=>number|undefined,
        private readonly canOwnTunnel:()=>Promise<boolean>,
        private readonly notify:(message:string)=>void,
        private readonly getLocalToken:()=>string|undefined=()=>undefined){
        this.launchLock=new TunnelLaunchLock(context.globalStorageUri.fsPath,
            ()=>isPortOccupied(HEALTH_PORT));
    }
    private runExclusive<T>(operation:()=>Promise<T>):Promise<T>{
        if(this.busy){throw new Error('A tunnel management operation is already running.');}
        if(this.disposed){throw new Error('Tunnel manager was disposed.');}
        const work=operation();
        this.busy=work;
        return work.finally(()=>{if(this.busy===work){this.busy=undefined;}});
    }
    /** No secret is ever persisted in a profile or CLI argument. Tunnel Client
     * resolves this private header only on the local MCP HTTP hop. */
    private localAuthEnv():NodeJS.ProcessEnv{
        const token=this.getLocalToken();
        if(!token){return {}; } // Legacy synthetic test fixtures only.
        if(!/^[a-f0-9]{64}$/.test(token)){throw new Error('Invalid local MCP authentication token.');}
        const header='X-MultiShell-Local-Auth: env:MULTISHELL_MCP_LOCAL_AUTH';
        return {MULTISHELL_MCP_LOCAL_AUTH:token,
            MCP_EXTRA_HEADERS:header,
            MCP_DISCOVERY_EXTRA_HEADERS:header};
    }
    private profile():string{
        return this.context.globalState.get<string>(PROFILE_KEY,DEFAULT_PROFILE);
    }
    private existingFile():string|undefined{
        return this.context.globalState.get<string>(EXISTING_FILE_KEY);
    }
    private profileFile():string{
        return this.existingFile()||path.join(settingsDir(this.context),this.profile()+'.yaml');
    }
    private profileArgs():string[]{
        const legacy=this.existingFile();
        return legacy?['--profile-file',legacy]:
            ['--profile',this.profile(),'--profile-dir',settingsDir(this.context)];
    }
    /** An update can leave a verified child running from the previous VSIX.
     * Only consider a sibling installation of this exact extension (same
     * VS Code extensions directory and official tunnel platform/version).
     * A lock file cannot redirect execution to an arbitrary filesystem path. */
    private priorExtensionRoot(executable:string,asset:ReturnType<typeof tunnelAsset>):
    string|undefined{
        const current=this.context.extensionUri?.fsPath;
        if(!current||typeof executable!=='string'){return undefined;}
        const root=path.dirname(path.dirname(path.dirname(path.dirname(executable))));
        if(!/^local-multishell\.multi-shell-mcp-server-\d+\.\d+\.\d+$/.test(
            path.basename(root))){return undefined;}
        const normalize=(value:string)=>{
            const resolved=path.resolve(value);
            return process.platform==='win32'?resolved.toLowerCase():resolved;
        };
        if(normalize(root)===normalize(current)||
            normalize(path.dirname(root))!==normalize(path.dirname(current))||
            normalize(path.join(root,'tunnel-client','v'+TUNNEL_VERSION,
                asset.platformTag,asset.binary))!==normalize(executable)){
            return undefined;
        }
        return root;
    }
    /** Prefer the native binary bundled with this VSIX for all fresh starts.
     * Adopt a surviving older child only after official binary verification
     * AND matching its kernel process identity with our ownership lock. */
    private async installed():Promise<string|undefined>{
        const asset=tunnelAsset();
        const packagedRoot=this.context.extensionUri?.fsPath;
        const embedded=packagedRoot?await verifiedExecutable(packagedRoot,asset):undefined;
        const record=await this.launchLock.inspect();
        if(record?.childPid&&record.childIdentity&&
            record.profile===this.profile()&&
            record.endpointPort===this.currentMcpPort()&&
            processIsAlive(record.childPid)){
            const old=await verifiedExecutable(this.context.globalStorageUri.fsPath,asset);
            const priorRoot=this.priorExtensionRoot(record.childIdentity.executable,asset);
            const prior=priorRoot?await verifiedExecutable(priorRoot,asset):undefined;
            for(const executable of [old,prior]){
                if(!executable){continue;}
                const identity=await readTunnelProcessIdentity(record.childPid,executable);
                if(sameTunnelProcess(identity,record.childIdentity)){return executable;}
            }
        }
        // Fresh launches fail closed unless this platform VSIX includes its
        // verified native tunnel. Never fall back to an idle old copy.
        return embedded;
    }
    async status():Promise<TunnelStatus>{
        const [exe,ready,occupied,record]=await Promise.all([
            this.installed(),checkUrl('readyz'),isPortOccupied(HEALTH_PORT),
            this.launchLock.inspect()
        ]);
        const childRunning=Boolean(this.child&&this.child.exitCode===null&&!this.child.killed);
        const executable=this.adopted?exe:undefined;
        const adopted=Boolean(executable&&sameTunnelProcess(this.adopted,
            await readTunnelProcessIdentity(this.adopted!.pid,executable)));
        return {
            installed:!!exe,version:TUNNEL_VERSION,
            configured:fs.existsSync(this.profileFile())&&
                !!(await this.context.secrets.get(SECRET_KEY)),
            autostart:this.context.globalState.get<boolean>(AUTO_KEY,false),
            childRunning:childRunning||adopted,listenerOccupied:occupied,ready,
            owner:childRunning?'extension':adopted?'adopted':
                record?.childPid&&processIsAlive(record.childPid)?'detached':
                occupied?'external':'none',
            source:this.existingFile()?'existing':'managed',profile:this.profile(),
            retryFailures:this.unexpectedFailures,retryPaused:this.autoPaused
        };
    }
    async install():Promise<string>{
        return this.runExclusive(async()=>{
            const existing=await this.installed();
            if(!existing){
                throw new Error('Integrated Tunnel Client verification failed. Reinstall the platform-specific VSIX.');
            }
            this.notify('Bundled Tunnel Client v'+TUNNEL_VERSION+' verified for this OS.');
            return existing;
        });
    }
    async configure(tunnelId:string,runtimeKey:string,profile=DEFAULT_PROFILE):Promise<void>{
        return this.runExclusive(async()=>{
            if(!runtimeKey.trim()){throw new Error('API key is required.');}
            const id=validateTunnelId(tunnelId);
            const name=validateProfileName(profile);
            const exe=await this.installed();
            if(!exe){throw new Error('Bundled Tunnel Client verification failed; reinstall the platform-specific VSIX.');}
            if(this.child||this.adopted){throw new Error('Stop the managed tunnel before changing its profile.');}
            const port=this.currentMcpPort();
            if(!port){throw new Error('Start MultiShell MCP before configuring a tunnel.');}
            const dir=settingsDir(this.context);
            await fs.promises.mkdir(dir,{recursive:true,mode:0o700});
            const file=path.join(dir,name+'.yaml');
            if(fs.existsSync(file)){throw new Error('Profile already exists; it will not be overwritten.');}
            await execChecked(exe,[
                'init','--sample','sample_mcp_remote_no_auth',
                '--profile',name,'--profile-dir',dir,
                '--tunnel-id',id,
                '--mcp-server-url','http://127.0.0.1:'+port+'/mcp',
                '--health-listen-addr','127.0.0.1:'+HEALTH_PORT
            ],path.dirname(exe),20000);
            if(!fs.existsSync(file)){throw new Error('Tunnel Client init did not create the profile.');}
            await this.context.secrets.store(SECRET_KEY,runtimeKey.trim());
            await this.context.globalState.update(PROFILE_KEY,name);
            await this.context.globalState.update(EXISTING_FILE_KEY,undefined);
        });
    }
    /** Reject port changes which would leave an active managed tunnel
     * connected to an obsolete MCP listener. No external process is stopped. */
    async assertPortChangeSafe(oldPort:number,newPort:number):Promise<void>{
        if(oldPort===newPort){return;}
        const record=await this.launchLock.inspect();
        // Imported profiles are read-only, but a tunnel launched with one is
        // still owned by this manager and must not be stranded on the old port.
        if(this.child||this.adopted||
            (record?.profile===this.profile()&&record.childPid&&
                processIsAlive(record.childPid))){
            throw new Error('Disconnect the managed tunnel before changing the MCP port. The active tunnel was preserved.');
        }
        if(this.existingFile()){return;}
        const file=this.profileFile();
        if(!fs.existsSync(file)){return;}
        await inspectExistingProfile(file,oldPort);
    }
    /** Synchronize only extension-created profiles once the new MCP listener
     * is running. Imported profiles remain read-only by design. */
    async syncPort(oldPort:number,newPort:number):Promise<'updated'|'imported'|'unchanged'>{
        if(oldPort===newPort){return 'unchanged';}
        return this.runExclusive(async()=>{
            if(this.existingFile()){
                this.notify('Imported tunnel profile was not modified; select a matching profile for the new MCP port.');
                return 'imported';
            }
            if(!fs.existsSync(this.profileFile())){return 'unchanged';}
            await this.assertPortChangeSafe(oldPort,newPort);
            await syncManagedProfilePort(this.profileFile(),oldPort,newPort);
            this.notify('Managed tunnel profile synchronized to MCP port '+newPort+'.');
            return 'updated';
        });
    }
    async findExistingProfiles():Promise<ExistingTunnelProfile[]>{
        const port=this.currentMcpPort();
        if(!port){throw new Error('Start MultiShell MCP before searching for profiles.');}
        return discoverExistingProfiles(port);
    }
    /** Reuse an existing profile by reference without modifying its bytes.
     * The runtime key is entered locally and is never decoded from legacy DPAPI. */
    async reuseExistingProfile(profile:ExistingTunnelProfile,key:string):Promise<void>{
        return this.runExclusive(async()=>{
            if(!key.trim()){throw new Error('API key is required.');}
            if(this.child||this.adopted){throw new Error('Stop the managed tunnel before switching profiles.');}
            const port=this.currentMcpPort();
            if(!port){throw new Error('Start MultiShell MCP before reusing a profile.');}
            const matching=(await discoverExistingProfiles(port)).some(item=>item.file===profile.file);
            if(!matching){throw new Error('The selected profile is no longer available or permitted.');}
            const verified=await inspectExistingProfile(profile.file,port);
            await this.context.secrets.store(SECRET_KEY,key.trim());
            await this.context.globalState.update(PROFILE_KEY,verified.name);
            await this.context.globalState.update(EXISTING_FILE_KEY,verified.file);
            this.notify('Existing profile selected read-only. Its YAML file was not modified.');
        });
    }
    async updateApiKey(key:string):Promise<void>{
        await this.runExclusive(async()=>{
            if(!key.trim()){throw new Error('API key cannot be empty.');}
            if(this.child||this.adopted){throw new Error('Stop the managed tunnel before replacing its key.');}
            await this.context.secrets.store(SECRET_KEY,key.trim());
        });
    }
    private async verifyBeforeStart(exe:string):Promise<void>{
        const key=await this.context.secrets.get(SECRET_KEY);
        if(!key){throw new Error('Runtime API key not configured.');}
        const port=this.currentMcpPort();
        if(!port){throw new Error('MultiShell MCP server is not running.');}
        await inspectExistingProfile(this.profileFile(),port);
        const localToken=this.getLocalToken();
        const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
            method:'POST',headers:{'content-type':'application/json',
                accept:'application/json,text/event-stream',
                ...(localToken?{'x-multishell-local-auth':localToken}:{})},
            body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping',params:{}}),
            signal:AbortSignal.timeout(4000)
        }).catch(()=>undefined);
        if(!response?.ok){throw new Error('MultiShell MCP endpoint is not healthy.');}
        await response.body?.cancel();
        const environment={...process.env,...this.localAuthEnv(),CONTROL_PLANE_API_KEY:key};
        await execChecked(exe,['doctor',...this.profileArgs(),'--json'],
            path.dirname(exe),30000,environment);
    }
    private childExited(child:ChildProcess,exitCode:number|null,signal:NodeJS.Signals|null):void{
        if(this.child!==child){return;}
        this.child=undefined;
        void this.launchLock.release().catch(()=>{});
        if(this.disposed||this.shuttingDown){return;}
        if(Date.now()-this.startedAt>=300_000){this.unexpectedFailures=0;}
        this.unexpectedFailures++;
        if(this.unexpectedFailures>=MAX_UNEXPECTED_RESTARTS){
            this.autoPaused=true;
            this.notify('Tunnel stopped unexpectedly too often; automatic retries paused.');
        }else{
            this.nextAttempt=Date.now()+Math.min(60_000,2000*2**(this.unexpectedFailures-1));
            this.notify('Tunnel exited unexpectedly (code '+exitCode+', signal '+(signal||'none')+
                '). A bounded retry is scheduled if autostart is enabled.');
        }
    }
    /** Adopt only our own lock record and a kernel-verified surviving
     * Tunnel Client instance. No process is killed during adoption.
     * The internal form can safely run inside a start() lock. */
    private async adoptDetachedUnlocked():Promise<boolean>{
        if(!await this.canOwnTunnel()||this.child||this.adopted){return false;}
        const record=await this.launchLock.inspect();
        if(!record?.childPid||!record.childIdentity||
            record.profile!==this.profile()||
            record.endpointPort!==this.currentMcpPort()||
            !processIsAlive(record.childPid)){return false;}
        const exe=await this.installed();
        if(!exe){return false;}
        const identity=await readTunnelProcessIdentity(record.childPid,exe);
        if(!sameTunnelProcess(identity,record.childIdentity)){return false;}
        if(!await this.launchLock.claimDetached(record.token,identity!,async()=>
            sameTunnelProcess(identity,
                await readTunnelProcessIdentity(identity!.pid,exe)))){
            return false;
        }
        this.adopted=identity;
        this.notify('Verified extension-owned Tunnel Client reattached after reload.');
        return true;
    }
    async adoptDetached():Promise<boolean>{
        return this.runExclusive(()=>this.adoptDetachedUnlocked());
    }
    async start():Promise<'started'|'already-running'|'occupied'>{
        return this.runExclusive(async()=>{
            if(!await this.canOwnTunnel()){
                throw new Error('Only the active MultiShell MCP hub window may start the shared tunnel.');
            }
            const exe=await this.installed();
            if(!exe){throw new Error('Bundled Tunnel Client verification failed; reinstall the platform-specific VSIX.');}
            if(this.child&&this.child.exitCode===null){return 'already-running';}
            if(this.adopted){
                const exe=await this.installed();
                const identity=exe?await readTunnelProcessIdentity(this.adopted.pid,exe):undefined;
                if(sameTunnelProcess(this.adopted,identity)){return 'already-running';}
                // A recycled PID must never be terminated. If the old PID is
                // gone and port free, only the owned stale lock is released.
                if(processIsAlive(this.adopted.pid)||await isPortOccupied(HEALTH_PORT)){
                    return 'occupied';
                }
                this.adopted=undefined;
                await this.launchLock.release();
            }
            // The previous VS Code host can exit after our first adoption attempt.
            // Reclaim only a fingerprint-verified tunnel from our exact profile;
            // never stop or replace an unrelated listener on port 8080.
            if(await isPortOccupied(HEALTH_PORT)){
                return await this.adoptDetachedUnlocked()?'already-running':'occupied';
            }
            await this.verifyBeforeStart(exe);
            if(!await this.launchLock.acquire(this.profile(),this.currentMcpPort()!)){
                return 'already-running';
            }
            try{
                if(await isPortOccupied(HEALTH_PORT)){return 'occupied';}
                const secret=await this.context.secrets.get(SECRET_KEY);
                if(!secret){throw new Error('Runtime API key not configured.');}
                const env={...process.env,...this.localAuthEnv(),CONTROL_PLANE_API_KEY:secret};
                const child=spawn(exe,['run',...this.profileArgs()],{
                    cwd:path.dirname(exe),env,windowsHide:true,
                    // On Windows a detached console process may trigger the
                    // system's default terminal when its Codex child starts.
                    // A hidden non-detached child remains independently owned.
                    detached:process.platform!=='win32',stdio:'ignore'
                });
                let exitedEarly=false;
                const trackEarlyExit=()=>{exitedEarly=true;};
                child.once('exit',trackEarlyExit);
                try{
                    await new Promise<void>((resolve,reject)=>{
                        child.once('spawn',resolve);
                        child.once('error',reject);
                    });
                    if(!child.pid||exitedEarly||child.exitCode!==null||child.signalCode!==null){
                        throw new Error('Tunnel Client exited before it could be supervised.');
                    }
                    await this.launchLock.setChild(child.pid,
                        await readTunnelProcessIdentity(child.pid,exe));
                    if(exitedEarly||child.exitCode!==null||child.signalCode!==null){
                        throw new Error('Tunnel Client exited while preparing process supervision.');
                    }
                }catch(error){
                    if(!exitedEarly&&child.exitCode===null&&child.signalCode===null){
                        child.kill();
                    }
                    throw error;
                }finally{
                    child.off('exit',trackEarlyExit);
                }
                this.child=child;
                this.shuttingDown=false;
                this.startedAt=Date.now();
                child.once('exit',(code,signal)=>this.childExited(child,code,signal));
                child.once('error',error=>this.notify('Tunnel child process error: '+message(error)));
                child.unref();
                this.notify('Tunnel Client started in a separate process without a VS Code terminal.');
                return 'started';
            }finally{
                // Lock remains while an owned child is alive. On an error,
                // do not prevent a subsequent deliberate retry.
                if(!this.child){await this.launchLock.release();}
            }
        });
    }
    async stop():Promise<void>{
        await this.runExclusive(async()=>{
            const child=this.child;
            const adopted=this.adopted;
            if(!child&&!adopted){
                throw new Error('No extension-owned tunnel exists. External and unverified detached processes are never killed.');
            }
            // After reload, PID alone is not evidence of ownership. Validate
            // start time, executable, arguments and our lock again immediately
            // before sending a signal. Fail closed on ambiguity.
            if(adopted){
                const exe=await this.installed();
                const record=await this.launchLock.inspect();
                const current=exe?await readTunnelProcessIdentity(adopted.pid,exe):undefined;
                if(!exe||!sameTunnelProcess(current,adopted)||
                    !sameTunnelProcess(record?.childIdentity,adopted)||
                    record?.ownerPid!==process.pid){
                    throw new Error('Detached tunnel identity could not be verified; refusing to terminate a PID.');
                }
            }
            this.shuttingDown=true;
            await this.context.globalState.update(AUTO_KEY,false);
            this.stopMonitoring();
            if(child){
                child.kill();
                await new Promise<void>((resolve,reject)=>{
                    if(child.exitCode!==null){resolve();return;}
                    const timer=setTimeout(()=>reject(new Error('Tunnel process did not exit after stop request.')),6000);
                    child.once('exit',()=>{clearTimeout(timer);resolve();});
                });
                if(this.child===child){this.child=undefined;}
            }else if(adopted){
                // Only a fingerprint-verified child can reach this branch.
                // Do not use taskkill /F or kill a process tree.
                process.kill(adopted.pid,'SIGTERM');
                const deadline=Date.now()+6000;
                while(processIsAlive(adopted.pid)&&Date.now()<deadline){
                    await new Promise(resolve=>setTimeout(resolve,100));
                }
                if(processIsAlive(adopted.pid)){
                    throw new Error('Verified tunnel process did not exit after stop request.');
                }
                this.adopted=undefined;
            }
            await this.launchLock.release();
            this.notify('Stopped extension-owned Tunnel Client; autostart disabled.');
        });
    }
    async setAutostart(enabled:boolean):Promise<void>{
        await this.context.globalState.update(AUTO_KEY,enabled);
        if(enabled){
            this.unexpectedFailures=0;this.autoPaused=false;this.nextAttempt=0;
            this.startMonitoring();
        }else{this.stopMonitoring();}
    }
    private startMonitoring():void{
        if(this.disposed||this.timer){return;}
        this.timer=setInterval(()=>{void this.monitorTick();},SUPERVISION_INTERVAL_MS);
        this.timer.unref?.();
    }
    private stopMonitoring():void{
        if(this.timer){clearInterval(this.timer);this.timer=undefined;}
    }
    private async monitorTick():Promise<void>{
        if(this.disposed||this.busy||this.autoPaused||Date.now()<this.nextAttempt||
            !this.context.globalState.get<boolean>(AUTO_KEY,false)||
            !await this.canOwnTunnel()){return;}
        if(this.child&&this.child.exitCode===null){return;}
        const [exe,key]=await Promise.all([this.installed(),
            this.context.secrets.get(SECRET_KEY)]);
        if(!exe||!key||!fs.existsSync(this.profileFile())){return;}
        if(await isPortOccupied(HEALTH_PORT)){
            // A surviving tunnel may still be owned by an exiting extension
            // host during reload. Retry safe adoption instead of silently
            // treating it as permanently external.
            if(!this.adopted){
                try{await this.adoptDetached();}catch{
                    this.notify('Tunnel ownership recovery deferred; no existing process was stopped.');
                }
            }
            return;
        }
        try{await this.start();}
        catch{
            // Invalid auth/configuration must not generate an endless loop of
            // control-plane requests. Require a new explicit user action.
            this.autoPaused=true;
            this.notify('Tunnel autostart failed verification; retries paused until manually enabled again.');
        }
    }
    async startIfEnabled():Promise<void>{
        if(!this.context.globalState.get<boolean>(AUTO_KEY,false)){return;}
        this.startMonitoring();
        await this.monitorTick();
    }
    /** Do not tear down independently running child processes on Reload Window.
     * Their launch lock blocks duplicate starts in the replacement extension host. */
    dispose():void{
        this.disposed=true;
        this.stopMonitoring();
        this.launchLock.detach();
    }
    get releasePage():string{return TUNNEL_RELEASE_URL;}
}