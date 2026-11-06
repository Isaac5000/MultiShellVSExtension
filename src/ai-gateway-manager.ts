import type * as vscode from 'vscode';
import {randomBytes} from 'crypto';
import type {ShellApi} from './shell-api';
import type {ToolConfiguration} from './server';
import type {MCPServer} from './server';
import {restrictedShellApi,scopedTools,AiAccessLevel,validAiAccessLevel} from './ai-access';
import {listLocalConnections} from './ai-connections';

const SAVED_KEY='multiShellAiGatewayPoliciesV1';
const SECRET_PREFIX='multiShellAiGatewayKey:';
const FIRST_PORT=38100, LAST_PORT=38199;
export interface AiGatewayPolicy{
    profileId:string;
    shellId:string;
    shellRoot:string;
    level:AiAccessLevel;
    port:number;
    autostart?:boolean;
}
export interface AiGatewayStatus extends AiGatewayPolicy{
    running:boolean;
    /** User-facing status contains no bearer token, secret or header. */
    endpoint:string;
}
type Host=Pick<vscode.ExtensionContext,'globalState'|'secrets'>;
type Running={server:Pick<MCPServer,'start'|'stop'|'isHealthy'>};
type GatewayServer=Running['server'];
type GatewayFactory=(port:number,router:ShellApi,tools:ToolConfiguration,
    token:string,enabled:()=>boolean)=>GatewayServer;
function defaultGatewayFactory(port:number,router:ShellApi,tools:ToolConfiguration,
    token:string,enabled:()=>boolean):GatewayServer{
    // Deferred until the user explicitly starts a gateway. Do not introduce
    // a new VSCode runtime dependency in offline or mocked extension tests.
    const {MCPServer}=require('./server') as typeof import('./server');
    return new MCPServer(port,'127.0.0.1',router,tools,undefined,
        {bearerToken:token,isEnabled:enabled});
}
export class AiGatewayManager{
    private readonly active=new Map<string,Running>();
    private queue:Promise<void>=Promise.resolve();

    constructor(private readonly context:Host,
        private readonly router:()=>ShellApi|undefined,
        private readonly allowed:()=>boolean,
        private readonly serverTools:()=>ToolConfiguration,
        private readonly trusted:()=>boolean=()=>true,
        private readonly createGateway:GatewayFactory=defaultGatewayFactory){}

    private saved():AiGatewayPolicy[]{
        const input=this.context.globalState.get<unknown>(SAVED_KEY,[]);
        if(!Array.isArray(input)){return [];}
        const valid:AiGatewayPolicy[]=[];
        const seen=new Set<string>(),ports=new Set<number>();
        for(const v of input){
            if(!v||typeof v!=='object'){continue;}
            const item=v as Record<string,unknown>;
            if(typeof item.profileId!=='string'||typeof item.shellId!=='string'||
                typeof item.shellRoot!=='string'||!validAiAccessLevel(item.level)||
                !Number.isInteger(item.port)||Number(item.port)<FIRST_PORT||
                Number(item.port)>LAST_PORT||seen.has(item.profileId)||ports.has(Number(item.port))){
                continue;
            }
            const policy={profileId:item.profileId,shellId:item.shellId,
                shellRoot:item.shellRoot,level:item.level,port:item.port as number,
                autostart:item.autostart===true};
            seen.add(policy.profileId);ports.add(policy.port);valid.push(policy);
        }
        return valid.slice(0,100);
    }
    statuses():AiGatewayStatus[]{
        return this.saved().map(p=>({...p,
            running:this.active.get(p.profileId)?.server.isHealthy()===true,
            endpoint:'http://127.0.0.1:'+p.port+'/mcp'}));
    }
    private serialized<T>(run:()=>Promise<T>):Promise<T>{
        const work=this.queue.catch(()=>{}).then(run);
        this.queue=work.then(()=>{},()=>{});
        return work;
    }
    private exists(id:string):void{
        if(!listLocalConnections(this.context.globalState).some(p=>p.id===id)){
            throw new Error('Unknown AI connection profile.');
        }
    }
    async provision(id:string,shellId:string,level:AiAccessLevel):Promise<AiGatewayStatus>{
        return this.serialized(async()=>{
            this.requireHub();
            this.exists(id);
            if(!validAiAccessLevel(level)||typeof shellId!=='string'||!shellId){
                throw new Error('Choose a valid tool permission level and existing shell.');
            }
            const router=this.router()!;
            const matching=(await router.list()).find(s=>s.shell_id===shellId);
            if(!matching){throw new Error('Selected shell is no longer available.');}
            const records=this.saved(),previous=records.find(x=>x.profileId===id);
            if(previous){
                if(this.active.has(id)){await this.stopOne(id);}
            }
            const port=previous?.port??this.reservePort(records);
            const policy:AiGatewayPolicy={
                profileId:id,shellId,shellRoot:matching.initial_cwd,level,port,
                autostart:previous?.autostart===true
            };
            const next=records.filter(x=>x.profileId!==id).concat(policy);
            const oldToken=await this.context.secrets.get(SECRET_PREFIX+id);
            if(!oldToken){
                await this.context.secrets.store(SECRET_PREFIX+id,
                    randomBytes(32).toString('base64url'));
            }
            await this.context.globalState.update(SAVED_KEY,next);
            return {...policy,running:false,endpoint:'http://127.0.0.1:'+port+'/mcp'};
        });
    }
    async setAutostart(id:string,enabled:boolean):Promise<void>{
        return this.serialized(async()=>{
            this.requireHub();this.exists(id);
            const records=this.saved();
            if(!records.some(x=>x.profileId===id)){throw new Error('Configure the AI gateway first.');}
            await this.context.globalState.update(SAVED_KEY,records.map(x=>
                x.profileId===id?{...x,autostart:enabled}:x));
        });
    }
    async startIfEnabled():Promise<void>{
        for(const p of this.saved().filter(x=>x.autostart)){
            if(!this.allowed()){return;}
            try{await this.start(p.profileId);}
            catch{/* Fail closed: a missing/replaced shell or occupied port
                   * must not trigger a destructive fallback or credential leak. */}
        }
    }
    private reservePort(saved:AiGatewayPolicy[]):number{
        const used=new Set(saved.map(p=>p.port));
        for(let port=FIRST_PORT;port<=LAST_PORT;port++){
            if(!used.has(port)){return port;}
        }
        throw new Error('AI connection port limit reached.');
    }
    private requireHub():void{
        if(!this.allowed()||!this.router()||
            !this.trusted()){
            throw new Error('An active trusted MultiShell hub is required.');
        }
    }
    async start(id:string):Promise<AiGatewayStatus>{
        return this.serialized(async()=>{
            this.requireHub();this.exists(id);
            const policy=this.saved().find(p=>p.profileId===id);
            if(!policy){throw new Error('Configure shell and permissions first.');}
            const current=this.active.get(id);
            if(current?.server.isHealthy()){return this.statuses().find(p=>p.profileId===id)!;}
            if(current){await this.stopOne(id);}
            const token=await this.context.secrets.get(SECRET_PREFIX+id);
            if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token)){
                throw new Error('Missing or invalid credential; rotate the profile key.');
            }
            const router=this.router()!;
            const matching=(await router.list()).find(s=>
                s.shell_id===policy.shellId&&s.initial_cwd===policy.shellRoot);
            if(!matching){throw new Error('Bound shell has changed or is unavailable; configure access again.');}
            const policyApi=restrictedShellApi(router,policy.shellId,policy.level,policy.shellRoot);
            const server=this.createGateway(policy.port,policyApi,
                scopedTools(policy.level,this.serverTools()),
                token,()=>this.allowed()&&this.trusted());
            await server.start();
            this.active.set(id,{server});
            return this.statuses().find(p=>p.profileId===id)!;
        });
    }
    private async stopOne(id:string):Promise<void>{
        const entry=this.active.get(id);
        if(!entry){return;}
        // Do not lose ownership if stop() rejects: keep the live handle so
        // callers can retry and a failed rotation cannot orphan old credentials.
        await entry.server.stop();
        if(this.active.get(id)===entry){this.active.delete(id);}
    }
    async stop(id:string):Promise<void>{
        return this.serialized(async()=>{this.requireHub();await this.stopOne(id);});
    }
    async stopAll():Promise<void>{
        return this.serialized(async()=>{
            await Promise.all([...this.active.keys()].map(id=>this.stopOne(id)));
        });
    }
    async rotate(id:string):Promise<string>{
        return this.serialized(async()=>{
            this.requireHub();this.exists(id);
            if(!this.saved().some(p=>p.profileId===id)){
                throw new Error('Provision the AI connection first.');
            }
            // Revoke BEFORE creating a new key. A running listener must not
            // accept the old token after the stored credential changes.
            await this.stopOne(id);
            const secret=randomBytes(32).toString('base64url');
            await this.context.secrets.store(SECRET_PREFIX+id,secret);
            return secret;
        });
    }
    async secret(id:string):Promise<string>{
        this.requireHub();this.exists(id);
        if(!this.saved().some(p=>p.profileId===id)){throw new Error('No configured gateway.');}
        const token=await this.context.secrets.get(SECRET_PREFIX+id);
        if(!token){throw new Error('Gateway key is missing.');}
        return token;
    }
    async remove(id:string):Promise<void>{
        return this.serialized(async()=>{
            this.requireHub();
            await this.stopOne(id);
            await this.context.secrets.delete(SECRET_PREFIX+id);
            await this.context.globalState.update(SAVED_KEY,
                this.saved().filter(x=>x.profileId!==id));
        });
    }
    configured(id:string):boolean{
        return this.saved().some(p=>p.profileId===id);
    }
}