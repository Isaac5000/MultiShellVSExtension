import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {randomUUID} from 'crypto';
import {parse,parseTree,modify,applyEdits,ParseError,Node as JsonNode} from 'jsonc-parser';
import type * as vscode from 'vscode';
import {AiProvider,LocalProvider,LocalAiConnection} from './ai-connections';

export const AI_CLIENT_INSTALLS='multiShellMcpInstalledLocalClientsV1';
export type ClientSetupProvider=Exclude<LocalProvider,'other'>;
export interface ClientConfigLocation {
    file:string;
    group:'mcpServers';
    server:'multishell';
    entry:Record<string,unknown>;
    scope:'user'|'workspace';
}
export interface ClientConfigState {
    configured:boolean;
    managed:boolean;
    scope:'user'|'workspace'|'unsupported';
    detail:string;
}
interface Ownership {provider:ClientSetupProvider;file:string;url:string;id:string;}
type Store=Pick<vscode.Memento,'get'|'update'>;
const MAX_FILE=2*1024*1024;

function isPlainObject(value:unknown):value is Record<string,unknown>{
    return !!value&&typeof value==='object'&&!Array.isArray(value);
}
function saved(store:Store):Record<string,Ownership>{
    const obj=store.get<unknown>(AI_CLIENT_INSTALLS,{});
    if(!isPlainObject(obj)){return {};}
    const result:Record<string,Ownership>={};
    for(const [k,v] of Object.entries(obj)){
        if(!isPlainObject(v)||typeof v.file!=='string'||typeof v.url!=='string'||
            typeof v.id!=='string'||!['vscode','gemini-cli','claude-code','cursor'].includes(String(v.provider))){
            continue;
        }
        result[k]=v as unknown as Ownership;
    }
    return result;
}
function url(port:number):string{
    if(!Number.isSafeInteger(port)||port<1024||port>65535){
        throw new Error('Invalid MCP listener port.');
    }
    return 'http://127.0.0.1:'+port+'/mcp';
}
export function integrationLocation(provider:AiProvider,port:number,workspace?:string,
    home=os.homedir(),copilotHome=process.env.COPILOT_HOME):ClientConfigLocation{
    const endpoint=url(port);
    if(copilotHome&&!path.isAbsolute(copilotHome)){
        throw new Error('COPILOT_HOME must be an absolute path.');
    }
    switch(provider){
        case 'vscode':
            return {file:path.resolve(copilotHome||path.join(home,'.copilot'),'mcp-config.json'),
                group:'mcpServers',server:'multishell',scope:'user',
                entry:{type:'http',url:endpoint}};
        case 'gemini-cli':
            return {file:path.join(home,'.gemini','settings.json'),
                group:'mcpServers',server:'multishell',scope:'user',
                entry:{httpUrl:endpoint,trust:false}};
        case 'cursor':
            return {file:path.join(home,'.cursor','mcp.json'),
                group:'mcpServers',server:'multishell',scope:'user',
                entry:{url:endpoint}};
        case 'claude-code':
            if(!workspace||!path.isAbsolute(workspace)){
                throw new Error('Open a local workspace folder to configure Claude Code.');
            }
            return {file:path.join(workspace,'.mcp.json'),
                group:'mcpServers',server:'multishell',scope:'workspace',
                entry:{type:'http',url:endpoint}};
        default:
            throw new Error('This MCP client does not provide a supported automatic configuration.');
    }
}
function verifyNoDuplicateKeys(source:string):void{
    const root=parseTree(source,[],{allowTrailingComma:true,disallowComments:false});
    const visit=(node:JsonNode|undefined):void=>{
        if(!node){return;}
        if(node.type==='object'){
            const seen=new Set<string>();
            for(const child of node.children||[]){
                const key=child.children?.[0]?.value;
                if(typeof key!=='string'||seen.has(key)){
                    throw new Error('Duplicate or invalid configuration keys; refusing to edit.');
                }
                seen.add(key);
            }
        }
        for(const child of node.children||[]){visit(child);}
    };
    visit(root);
}
function decode(source:string):Record<string,unknown>{
    const errors:ParseError[]=[];
    const value=parse(source,errors,{allowTrailingComma:true,disallowComments:false});
    if(errors.length||!isPlainObject(value)){throw new Error('Client configuration JSON is invalid. No changes made.');}
    verifyNoDuplicateKeys(source);
    return value;
}
async function read(file:string):Promise<{source:string;doc:Record<string,unknown>;exists:boolean}>{
    try{
        const stat=await fs.promises.lstat(file);
        if(!stat.isFile()||stat.size>MAX_FILE){throw new Error('Unsafe client configuration file.');}
        const source=await fs.promises.readFile(file,'utf8');
        return {source,doc:decode(source),exists:true};
    }catch(e){
        if((e as NodeJS.ErrnoException).code==='ENOENT'){
            return {source:'{}\n',doc:{},exists:false};
        }
        throw e;
    }
}
function serverEntry(doc:Record<string,unknown>,loc:ClientConfigLocation):unknown{
    const group=doc[loc.group];
    if(group===undefined){return undefined;}
    if(!isPlainObject(group)){throw new Error('Client MCP configuration has an invalid servers object.');}
    return group[loc.server];
}
function matching(entry:unknown,loc:ClientConfigLocation):boolean{
    if(!isPlainObject(entry)){return false;}
    const target=loc.entry;
    // Keep the exact transport and endpoint expected for this provider.
    return Object.entries(target).every(([key,value])=>entry[key]===value);
}
async function edit(file:string,transform:(doc:Record<string,unknown>,source:string)=>string):Promise<boolean>{
    const directory=path.dirname(file);
    await fs.promises.mkdir(directory,{recursive:true});
    const lock=file+'.multishell.lock';
    try{await fs.promises.mkdir(lock,{mode:0o700});}
    catch(error){
        if((error as NodeJS.ErrnoException).code==='EEXIST'){
            throw new Error('Another client configuration operation is in progress.');
        }
        throw error;
    }
    try{
        const {source,doc,exists}=await read(file);
        const changed=transform(doc,source);
        if(changed===source){return false;}
        decode(changed);
        // An existing file is copied before any attempted replacement.
        if(exists){
            const backup=file+'.multishell-backup-'+Date.now()+'-'+randomUUID().slice(0,6);
            await fs.promises.copyFile(file,backup,fs.constants.COPYFILE_EXCL);
        }
        const temp=file+'.multishell-writing-'+randomUUID();
        try{
            await fs.promises.writeFile(temp,changed,{flag:'wx',mode:0o600});
            const now=await read(file);
            if(now.source!==source||now.exists!==exists){
                throw new Error('Client configuration was edited concurrently; refusing to overwrite.');
            }
            await fs.promises.rename(temp,file);
        }finally{await fs.promises.rm(temp,{force:true}).catch(()=>{});}
        return true;
    }finally{
        await fs.promises.rmdir(lock).catch(()=>{});
    }
}
export async function connectionConfigStatus(profile:LocalAiConnection,port:number,store:Store,
    workspace?:string,roots:{home?:string;copilotHome?:string}={}):Promise<ClientConfigState>{
    if(profile.provider==='other'||['claude-web','grok-web','gemini-api','mistral-work','cursor-remote'].includes(profile.provider)){
        return {configured:false,managed:false,scope:'unsupported',detail:'Manual MCP client'};
    }
    let loc:ClientConfigLocation;
    try{loc=integrationLocation(profile.provider,port,workspace,roots.home,roots.copilotHome);}
    catch{return {configured:false,managed:false,scope:'workspace',detail:'Workspace or environment unavailable'};}
    const owns=saved(store)[profile.id];
    const installed=await read(loc.file);
    const entry=serverEntry(installed.doc,loc);
    // Port 3000 now requires a local credential. Legacy URL-only client
    // definitions cannot connect and must not be advertised as functional.
    return {
        configured:false,
        managed:!!owns&&owns.file===loc.file&&owns.provider===profile.provider,
        scope:loc.scope,
        detail:entry===undefined?loc.file:
            loc.file+' (legacy unauthenticated entry: use a per-AI gateway)'
    };
}
/** Retained only to reject legacy automatic setup safely.
 * Real gateway credentials must never be copied into client JSON files. */
export async function configureClient(
    _profile:LocalAiConnection,_port:number,_store:Store,
    _workspace?:string,_roots:{home?:string;copilotHome?:string}={}
):Promise<'configured'|'already-configured'>{
    throw new Error('Automatic MCP installation requires an authenticated per-AI gateway and secure client credential delivery. Use Copy configuration and set up the client manually.');
}
export async function disconnectClient(profile:LocalAiConnection,_port:number,store:Store,
    workspace?:string,roots:{home?:string;copilotHome?:string}={}):Promise<boolean>{
    const owners=saved(store);
    const record=owners[profile.id];
    if(!record||record.provider!==profile.provider){
        throw new Error('This MCP entry is not owned by MultiShell; it will not be removed.');
    }
    const originalPort=Number(new URL(record.url).port);
    const loc=integrationLocation(profile.provider,originalPort,workspace,roots.home,roots.copilotHome);
    if(record.file!==loc.file){
        throw new Error('Managed MCP profile moved; refusing to remove another file.');
    }
    const removed=await edit(loc.file,(doc,source)=>{
        const existing=serverEntry(doc,loc);
        if(!matching(existing,loc)){
            throw new Error('MCP client entry changed since setup. Refusing to remove it.');
        }
        const edits=modify(source,[loc.group,loc.server],undefined,{
            formattingOptions:{insertSpaces:true,tabSize:2,eol:source.includes('\r\n')?'\r\n':'\n'}
        });
        return applyEdits(source,edits);
    });
    if(removed){
        delete owners[profile.id];
        await store.update(AI_CLIENT_INSTALLS,owners);
    }
    return removed;
}
export function ownsClientProfile(store:Store,id:string):boolean{
    return Object.hasOwn(saved(store),id);
}