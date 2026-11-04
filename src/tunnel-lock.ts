import * as fs from 'fs';
import * as path from 'path';
import {randomUUID} from 'crypto';
import {TunnelProcessIdentity,sameTunnelProcess} from './tunnel-process';

export interface TunnelLockRecord{
    token:string; ownerPid:number; childPid?:number;
    createdAt:number; profile:string; endpointPort:number;
    childIdentity?:TunnelProcessIdentity;
}
export function processIsAlive(pid:number):boolean{
    if(!Number.isSafeInteger(pid)||pid<=0){return false;}
    try{process.kill(pid,0);return true;}
    catch(error){
        // Access denied indicates a running process, not a stale lock.
        return (error as NodeJS.ErrnoException).code==='EPERM';
    }
}
/** Cross-VS-Code-window launch coordination in shared globalStorage.
 * A stale lock can be reclaimed only after the owning process, any child,
 * and the health listener are all confirmed absent.
 * A live child after Reload Window is not adopted for termination. */
export class TunnelLaunchLock{
    readonly filename:string;
    private token?:string;
    constructor(storage:string,private readonly portBusy:()=>Promise<boolean>,
        private readonly isAlive:(pid:number)=>boolean=processIsAlive){
        this.filename=path.join(storage,'tunnel-instance.lock');
    }
    async inspect():Promise<TunnelLockRecord|undefined>{
        try{
            const content=await fs.promises.readFile(this.filename,'utf8');
            const value=JSON.parse(content) as TunnelLockRecord;
            if(typeof value.token!=='string'||!Number.isSafeInteger(value.ownerPid)||
                !Number.isFinite(value.createdAt)||!Number.isSafeInteger(value.endpointPort)){
                return undefined;
            }
            return value;
        }catch{return undefined;}
    }
    async acquire(profile:string,endpointPort:number):Promise<boolean>{
        await fs.promises.mkdir(path.dirname(this.filename),{recursive:true,mode:0o700});
        for(let attempt=0;attempt<2;attempt++){
            const token=randomUUID();
            const value:TunnelLockRecord={token,ownerPid:process.pid,
                createdAt:Date.now(),profile,endpointPort};
            try{
                const file=await fs.promises.open(this.filename,'wx',0o600);
                try{await file.writeFile(JSON.stringify(value),'utf8');}
                finally{await file.close();}
                this.token=token;
                return true;
            }catch(error){
                if((error as NodeJS.ErrnoException).code!=='EEXIST'){throw error;}
            }
            // Only one reclaimer may inspect and remove a stale record at a
            // time. Rename alone is NOT a compare-and-swap operation: a
            // second contender can otherwise remove the new owner's lock.
            const guard=this.filename+'.reclaim';
            try{
                await fs.promises.mkdir(guard,{mode:0o700});
            }catch(error){
                if((error as NodeJS.ErrnoException).code==='EEXIST'){return false;}
                throw error;
            }
            try{
                const record=await this.inspect();
                if(record&&(this.isAlive(record.ownerPid)||
                    (record.childPid&&this.isAlive(record.childPid)))){return false;}
                let created=0;
                try{created=(await fs.promises.stat(this.filename)).mtimeMs;}
                catch{continue;}
                // A partially written record is considered live until aged out.
                if(!record&&Date.now()-created<30_000){return false;}
                if(await this.portBusy()){return false;}
                // Check again after the asynchronous port query. Protect a
                // new valid owner even if a separate tool rewrote the lock.
                const latest=await this.inspect();
                if(latest?.token!==record?.token ||
                    (latest&&(this.isAlive(latest.ownerPid)||
                        (latest.childPid&&this.isAlive(latest.childPid))))){return false;}
                const stale=this.filename+'.stale-'+token;
                try{
                    await fs.promises.rename(this.filename,stale);
                    await fs.promises.unlink(stale).catch(()=>{});
                }catch(error){
                    if((error as NodeJS.ErrnoException).code!=='ENOENT'){return false;}
                }
            }finally{
                // Crash leftovers fail closed. Never automatically steal a
                // recovery guard: doing so would recreate the original race.
                await fs.promises.rmdir(guard).catch(()=>{});
            }
        }
        return false;
    }
    async setChild(pid:number,identity?:TunnelProcessIdentity):Promise<void>{
        const record=await this.inspect();
        if(!this.token||record?.token!==this.token){
            throw new Error('Tunnel launch lock ownership was lost.');
        }
        const temporary=this.filename+'.writing-'+this.token;
        try{
            await fs.promises.writeFile(temporary,JSON.stringify({...record,childPid:pid,childIdentity:identity}),
                {flag:'wx',mode:0o600});
            await fs.promises.rename(temporary,this.filename);
        }finally{await fs.promises.rm(temporary,{force:true}).catch(()=>{});}
    }
    /** Reassign a verified surviving child after Reload Window. This never
     * terminates a process; the caller must check its kernel start identity
     * and executable again before any later stop request. */
    async claimDetached(recordToken:string,identity:TunnelProcessIdentity,
        validate:()=>Promise<boolean>):Promise<boolean>{
        const guard=this.filename+'.reclaim';
        try{await fs.promises.mkdir(guard,{mode:0o700});}
        catch(error){
            if((error as NodeJS.ErrnoException).code==='EEXIST'){return false;}
            throw error;
        }
        try{
            const original=await this.inspect();
            if(!original||original.token!==recordToken||
                !sameTunnelProcess(original.childIdentity,identity)||
                original.childPid!==identity.pid||
                !this.isAlive(identity.pid)||
                (original.ownerPid!==process.pid&&this.isAlive(original.ownerPid))){
                return false;
            }
            if(!await validate()){return false;}
            const current=await this.inspect();
            if(!current||current.token!==original.token||
                !sameTunnelProcess(current.childIdentity,identity)||
                !this.isAlive(identity.pid)){return false;}
            const replacement={...current,token:randomUUID(),
                ownerPid:process.pid,createdAt:Date.now()};
            const temporary=this.filename+'.writing-'+replacement.token;
            try{
                await fs.promises.writeFile(temporary,JSON.stringify(replacement),
                    {flag:'wx',mode:0o600});
                await fs.promises.rename(temporary,this.filename);
            }finally{
                await fs.promises.rm(temporary,{force:true}).catch(()=>{});
            }
            this.token=replacement.token;
            return true;
        }finally{
            await fs.promises.rmdir(guard).catch(()=>{});
        }
    }
    async release():Promise<void>{
        if(!this.token){return;}
        const record=await this.inspect();
        if(record?.token===this.token){
            await fs.promises.unlink(this.filename).catch(()=>{});
        }
        this.token=undefined;
    }
    /** Do not remove the lock during window reload: an independent child may
     * still be alive and must not be duplicated or inadvertently killed. */
    detach():void{this.token=undefined;}
}