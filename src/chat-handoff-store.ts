import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {createHash,randomUUID} from 'crypto';

export type HandoffStatus='working'|'blocked'|'claimed_complete';
export interface ChatHandoffInput{
    objective:string;
    verification:string;
    summary:string;
    completed:string[];
    remaining:string[];
    artifacts:string[];
    risks:string[];
    nextAction:string;
    status:HandoffStatus;
    verificationEvidence?:string;
}
export interface ChatHandoffScope{
    shellId:string;
    workspace:string;
    machineId:string;
}
export interface StoredChatHandoff extends ChatHandoffInput{
    format:1;
    handoffId:string;
    revision:number;
    scopeHash:string;
    createdAt:number;
    updatedAt:number;
}
const MAX_HANDOFFS=24;
const MAX_FILE_BYTES=16384;
const MAX_TOTAL_BYTES=MAX_HANDOFFS*MAX_FILE_BYTES;
const ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN=/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[a-z0-9._~+/=-]{12,}|\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,})\b|(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*['\"]?[^\s,'\"]{12,}/i;

function maxText(value:unknown,max:number,required=true):string{
    if(typeof value!=='string'||value.length>max||
        (required&&!value.trim())||value.includes('\0')){
        throw new Error('Invalid or oversized chat handoff field.');
    }
    if(SECRET_PATTERN.test(value)){
        throw new Error('Possible credential in chat checkpoint. Exclude secrets before saving.');
    }
    return value;
}
function textList(value:unknown,maxItems:number,maxItemBytes:number):string[]{
    if(!Array.isArray(value)||value.length>maxItems){throw new Error('Invalid handoff list.');}
    return value.map(item=>{
        const text=maxText(item,maxItemBytes);
        if(Buffer.byteLength(text,'utf8')>maxItemBytes){
            throw new Error('Handoff list item exceeds the byte limit.');
        }
        return text;
    });
}
function cleanInput(input:ChatHandoffInput):ChatHandoffInput{
    if(!input||typeof input!=='object'||Array.isArray(input)){
        throw new Error('Invalid chat handoff.');
    }
    if(!['working','blocked','claimed_complete'].includes(input.status)){
        throw new Error('Unsupported chat handoff status.');
    }
    const clean:ChatHandoffInput={
        objective:maxText(input.objective,1400),
        verification:maxText(input.verification,1000),
        summary:maxText(input.summary,2800),
        completed:textList(input.completed,24,500),
        remaining:textList(input.remaining,24,500),
        artifacts:textList(input.artifacts,24,300),
        risks:textList(input.risks,12,400),
        nextAction:maxText(input.nextAction,850),
        status:input.status
    };
    if(input.verificationEvidence!==undefined){
        clean.verificationEvidence=maxText(input.verificationEvidence,1200,false);
    }
    if(clean.status==='claimed_complete'&&!clean.verificationEvidence?.trim()){
        throw new Error('Claimed completion needs explicit verification evidence.');
    }
    return clean;
}
export function handoffScopeHash(scope:ChatHandoffScope):string{
    if(!scope||typeof scope.shellId!=='string'||!scope.shellId||
        scope.shellId.length>160||typeof scope.workspace!=='string'||
        !path.isAbsolute(scope.workspace)||typeof scope.machineId!=='string'||
        !scope.machineId||scope.machineId.length>160){
        throw new Error('A verified machine, workspace and exact shell are required.');
    }
    // Do not use a transient VSCode window ID for storage identity: the
    // same project must be recoverable after a window reload.
    const normalized=process.platform==='win32'?
        scope.workspace.replace(/\//g,'\\').toLowerCase():
        scope.workspace;
    return createHash('sha256').update(JSON.stringify([
        scope.machineId,normalized
    ])).digest('hex');
}
export function defaultHandoffRoot():string{
    if(process.platform==='win32'){
        return path.join(process.env.LOCALAPPDATA||
            path.join(os.homedir(),'AppData','Local'),'MultiShellMCP','chat-handoffs');
    }
    if(process.platform==='darwin'){
        return path.join(os.homedir(),'Library','Application Support',
            'MultiShellMCP','chat-handoffs');
    }
    return path.join(process.env.XDG_STATE_HOME||
        path.join(os.homedir(),'.local','state'),'MultiShellMCP','chat-handoffs');
}
export class ChatHandoffStore{
    private readonly directory:string;
    constructor(directory=defaultHandoffRoot()){
        if(!path.isAbsolute(directory)){throw new Error('Handoff storage root must be absolute.');}
        fs.mkdirSync(directory,{recursive:true,mode:0o700});
        if(!fs.lstatSync(directory).isDirectory()){
            throw new Error('Handoff storage is not a normal directory.');
        }
        this.directory=directory;
    }
    private file(id:string):string{
        if(!ID_PATTERN.test(id)){throw new Error('Invalid handoff ID.');}
        return path.join(this.directory,id+'.json');
    }
    private readFile(id:string):StoredChatHandoff|undefined{
        const filename=this.file(id);
        let stat:fs.Stats;
        try{stat=fs.lstatSync(filename);}
        catch(error){
            if((error as NodeJS.ErrnoException).code==='ENOENT'){return undefined;}
            throw error;
        }
        if(!stat.isFile()||stat.size>MAX_FILE_BYTES){
            throw new Error('Unsafe or oversized stored handoff.');
        }
        // Keep the metadata check, file read and post-read identity check
        // bound to the same opened descriptor. A swapped pathname must never
        // become a different trusted checkpoint (even with matching JSON IDs).
        const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0);
        const descriptor=fs.openSync(filename,flags);
        let raw:StoredChatHandoff;
        try{
            const opened=fs.fstatSync(descriptor);
            if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||
                opened.size>MAX_FILE_BYTES){
                throw new Error('Checkpoint file identity changed during read.');
            }
            // Bounded read even when another process grows the file mid-read.
            const data=Buffer.allocUnsafe(MAX_FILE_BYTES+1);
            let length=0;
            while(length<data.length){
                const bytes=fs.readSync(descriptor,data,length,data.length-length,length);
                if(bytes===0){break;}
                length+=bytes;
            }
            if(length>MAX_FILE_BYTES){throw new Error('Unsafe or oversized stored handoff.');}
            const after=fs.lstatSync(filename);
            if(!after.isFile()||after.dev!==opened.dev||after.ino!==opened.ino||
                after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||
                opened.size!==length){
                throw new Error('Checkpoint file identity changed during read.');
            }
            raw=JSON.parse(data.subarray(0,length).toString('utf8')) as StoredChatHandoff;
        }finally{
            fs.closeSync(descriptor);
        }
        if(raw.format!==1||raw.handoffId!==id||
            !Number.isSafeInteger(raw.revision)||raw.revision<1||
            typeof raw.scopeHash!=='string'||
            !Number.isSafeInteger(raw.updatedAt)){
            throw new Error('Invalid stored chat handoff.');
        }
        return raw;
    }
    private listing():StoredChatHandoff[]{
        const files=fs.readdirSync(this.directory).filter(name=>ID_PATTERN.test(
            name.endsWith('.json')?name.slice(0,-5):'')&&name.endsWith('.json'));
        if(files.length>MAX_HANDOFFS){throw new Error('Handoff storage capacity exceeded.');}
        let bytes=0;
        const list=files.map(filename=>{
            bytes+=fs.lstatSync(path.join(this.directory,filename)).size;
            if(bytes>MAX_TOTAL_BYTES){throw new Error('Handoff storage byte budget exceeded.');}
            return this.readFile(filename.slice(0,-5))!;
        });
        return list;
    }
    list(scope:ChatHandoffScope):StoredChatHandoff[]{
        const hash=handoffScopeHash(scope);
        return this.listing().filter(item=>item.scopeHash===hash)
            .sort((a,b)=>b.updatedAt-a.updatedAt||b.createdAt-a.createdAt)
            .map(x=>({...x}));
    }
    get(scope:ChatHandoffScope,id?:string):StoredChatHandoff|undefined{
        const hash=handoffScopeHash(scope);
        const row=id?this.readFile(id):this.list(scope)[0];
        if(!row){return undefined;}
        if(row.scopeHash!==hash){throw new Error('Handoff belongs to another machine or workspace.');}
        return {...row};
    }
    /** Cross-process locks prevent concurrent new goals from exceeding capacity,
     * as well as stale revisions from overwriting a different chat's progress.
     * Stale locks are not removed speculatively after a crash.
     */
    private withLock<T>(lock:string,fn:()=>T):T{
        let fd:number;
        try{fd=fs.openSync(lock,'wx',0o600);}
        catch(error){
            if((error as NodeJS.ErrnoException).code==='EEXIST'){
                throw new Error('Handoff write already in progress; do not retry blindly.');
            }
            throw error;
        }
        try{return fn();}
        finally{fs.closeSync(fd);fs.unlinkSync(lock);}
    }
    private locked<T>(id:string,fn:()=>T):T{
        return this.withLock(this.file(id)+'.lock',fn);
    }
    private capacityLocked<T>(fn:()=>T):T{
        return this.withLock(path.join(this.directory,'.capacity.lock'),fn);
    }
    private atomicWrite(id:string,record:StoredChatHandoff):void{
        const payload=JSON.stringify(record);
        if(Buffer.byteLength(payload,'utf8')>MAX_FILE_BYTES){
            throw new Error('Chat handoff exceeds 16 KiB storage limit.');
        }
        const tmp=path.join(this.directory,'.'+id+'.'+randomUUID()+'.tmp');
        try{
            fs.writeFileSync(tmp,payload,{flag:'wx',mode:0o600});
            fs.renameSync(tmp,this.file(id));
        }finally{
            try{fs.unlinkSync(tmp);}
            catch(error){
                if((error as NodeJS.ErrnoException).code!=='ENOENT'){throw error;}
            }
        }
    }
    save(scope:ChatHandoffScope,input:ChatHandoffInput,
        id?:string,expectedRevision?:number):StoredChatHandoff{
        const clean=cleanInput(input),scopeHash=handoffScopeHash(scope);
        const handoffId=id||randomUUID();
        if(id&&!ID_PATTERN.test(id)){throw new Error('Invalid handoff ID.');}
        if(!id&&expectedRevision!==undefined&&expectedRevision!==0){
            throw new Error('A new handoff cannot have an existing revision.');
        }
        return this.capacityLocked(()=>this.locked(handoffId,()=>{
            const previous=this.readFile(handoffId);
            if(previous){
                if(previous.scopeHash!==scopeHash){
                    throw new Error('Handoff is scoped to another workspace.');
                }
                if(expectedRevision!==previous.revision){
                    throw new Error('Stale handoff revision. Reload before overwriting.');
                }
            }else{
                if(id){throw new Error('Unknown handoff ID; cannot silently create it.');}
                if(this.listing().length>=MAX_HANDOFFS){
                    throw new Error('Chat handoff storage full; archive or delete an old goal.');
                }
            }
            const now=Date.now();
            const record:StoredChatHandoff={
                format:1,handoffId,revision:(previous?.revision||0)+1,
                scopeHash,createdAt:previous?.createdAt||now,updatedAt:now,
                ...clean
            };
            this.atomicWrite(handoffId,record);
            return {...record};
        }));
    }
    remove(scope:ChatHandoffScope,id:string,expectedRevision:number):void{
        handoffScopeHash(scope);
        this.capacityLocked(()=>this.locked(id,()=>{
            const record=this.get(scope,id);
            if(!record){throw new Error('Handoff not found.');}
            if(record.revision!==expectedRevision){
                throw new Error('Stale handoff revision. Nothing removed.');
            }
            fs.unlinkSync(this.file(id));
        }));
    }
}