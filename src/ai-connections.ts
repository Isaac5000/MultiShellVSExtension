import type * as vscode from 'vscode';
import {randomUUID} from 'crypto';
import {RemoteProvider,isRemoteProvider} from './ai-provider-catalog';

/** Local-only connection profiles. These are client setup reminders, NOT
 * cryptographic identities or verified client sessions. Never grant them
 * server permissions or expose the loopback MCP listener to a public network.
 */
export const LOCAL_CONNECTIONS_KEY='multiShellMcpLocalConnectionsV1';
export const PROVIDERS=['vscode','claude-code','gemini-cli','cursor','other'] as const;
export type LocalProvider=typeof PROVIDERS[number];
export type AiProvider=LocalProvider|RemoteProvider;
export function isAiProvider(value:unknown):value is AiProvider{
    return isLocalProvider(value)||isRemoteProvider(value);
}
export interface LocalAiConnection {
    id:string;
    provider:AiProvider;
    name:string;
    createdAt:number;
}
type StateStorage=Pick<vscode.Memento,'get'|'update'>;
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,47}$/u;
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const MAX_CONNECTIONS=24;

export function validConnectionName(value:unknown):value is string{
    return typeof value==='string'&&NAME.test(value)&&value.trim()===value;
}
export function isLocalProvider(value:unknown):value is LocalProvider{
    return typeof value==='string'&&
        (PROVIDERS as readonly string[]).includes(value);
}
function sanitize(input:unknown):LocalAiConnection|undefined{
    if(!input||typeof input!=='object'){return undefined;}
    const item=input as Record<string,unknown>;
    if(typeof item.id!=='string'||!ID.test(item.id)||
        !isAiProvider(item.provider)||!validConnectionName(item.name)||
        typeof item.createdAt!=='number'||!Number.isFinite(item.createdAt)){
        return undefined;
    }
    return {id:item.id,provider:item.provider,name:item.name,createdAt:item.createdAt};
}
export function listLocalConnections(store:StateStorage):LocalAiConnection[]{
    const saved=store.get<unknown>(LOCAL_CONNECTIONS_KEY,[]);
    if(!Array.isArray(saved)){return [];}
    const result:LocalAiConnection[]=[];
    const ids=new Set<string>();
    for(const item of saved.slice(0,MAX_CONNECTIONS)){
        const profile=sanitize(item);
        if(profile&&!ids.has(profile.id)){
            ids.add(profile.id);result.push(profile);
        }
    }
    return result;
}
export async function addLocalConnection(store:StateStorage,
    provider:unknown,name:unknown):Promise<LocalAiConnection>{
    if(!isAiProvider(provider)||!validConnectionName(name)){
        throw new Error('Invalid local client provider or connection label.');
    }
    const connections=listLocalConnections(store);
    if(connections.length>=MAX_CONNECTIONS){throw new Error('Connection profile limit reached (24).');}
    if(connections.some(x=>x.provider===provider&&x.name.toLocaleLowerCase()===name.toLocaleLowerCase())){
        throw new Error('A connection with this name and provider already exists.');
    }
    const entry:LocalAiConnection={id:randomUUID(),provider,name,createdAt:Date.now()};
    await store.update(LOCAL_CONNECTIONS_KEY,[...connections,entry]);
    return entry;
}
export async function removeLocalConnection(store:StateStorage,id:unknown):Promise<boolean>{
    if(typeof id!=='string'){throw new Error('Invalid connection identifier.');}
    const saved=listLocalConnections(store);
    const next=saved.filter(x=>x.id!==id);
    if(saved.length===next.length){return false;}
    await store.update(LOCAL_CONNECTIONS_KEY,next);
    return true;
}
export function localConnectionInstructions(provider:AiProvider,port:number,
    gatewayUrl?:string):string{
    if(!Number.isSafeInteger(port)||port<1024||port>65535){
        throw new Error('Invalid MCP port.');
    }
    if(!isLocalProvider(provider)){
        throw new Error('Remote AI providers require an authenticated HTTPS gateway, not the local MCP configuration.');
    }
    if(!gatewayUrl||!/^http:\/\/127\.0\.0\.1:381\d{2}\/mcp$/.test(gatewayUrl)){
        throw new Error('An authenticated per-AI gateway on localhost port 38100–38199 is required.');
    }
    const url=gatewayUrl;
    // Placeholder only. Never copy the actual SecretStorage bearer token into
    // clipboard snippets, logs or shared project files.
    const headers={Authorization:'Bearer YOUR_PER_CLIENT_GATEWAY_KEY'};
    const name='multishell';
    switch(provider){
        case 'vscode':
            return JSON.stringify({servers:{[name]:{type:'http',url,headers}}},null,2);
        case 'gemini-cli':
            return JSON.stringify({mcpServers:{'multi-shell':{httpUrl:url,headers,trust:false}}},null,2);
        case 'cursor':
            return JSON.stringify({mcpServers:{[name]:{url,headers}}},null,2);
        case 'claude-code':
            return 'claude mcp add --transport http '+name+' '+url+
                ' --header "Authorization: Bearer YOUR_PER_CLIENT_GATEWAY_KEY"';
        case 'other':
            return JSON.stringify({url,transport:'streamable-http',headers},null,2);
        default:
            throw new Error('Remote AI providers require an authenticated HTTPS gateway, not the local MCP configuration.');
    }
}