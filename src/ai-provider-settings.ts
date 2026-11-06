import type * as vscode from 'vscode';
import {onboardingGuide,OnboardingFieldId} from './ai-provider-onboarding';
import {listLocalConnections} from './ai-connections';
import {mapConcurrent} from './bounded-map';

const SAVE_KEY='multiShellAiProviderFormV1';
const SECRET_PREFIX='multiShellAiProviderCredentialV1:';
const nonSecretFields=new Set<OnboardingFieldId>(['publicMcpUrl','connectorId']);
const secretFields=new Set<OnboardingFieldId>(['providerApiKey','mcpBearer']);
type Store=Pick<vscode.ExtensionContext,'globalState'|'secrets'>;
export interface AiProviderStoredStatus{
  profileId:string;
  publicMcpUrl?:string;
  connectorId?:string;
  hasProviderApiKey:boolean;
  hasMcpBearer:boolean;
}
type SavedEntry={publicMcpUrl?:string;connectorId?:string};
const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function saved(host:Store):Record<string,SavedEntry>{
  const input=host.globalState.get<unknown>(SAVE_KEY,{});
  if(!isObject(input)){return {};}
  const result:Record<string,SavedEntry>={};
  for(const [id,entry] of Object.entries(input)){
    if(!isObject(entry)){continue;}
    const v:SavedEntry={};
    if(typeof entry.publicMcpUrl==='string'){v.publicMcpUrl=entry.publicMcpUrl;}
    if(typeof entry.connectorId==='string'){v.connectorId=entry.connectorId;}
    result[id]=v;
  }
  return result;
}
function profileProvider(host:Store,id:string):string{
  if(typeof id!=='string'){throw new Error('Invalid AI connection profile.');}
  const profile=listLocalConnections(host.globalState).find(x=>x.id===id);
  if(!profile){throw new Error('AI connection no longer exists.');}
  return profile.provider;
}
function validateValue(field:OnboardingFieldId,value:string):string{
  if(nonSecretFields.has(field)){
    if(field==='connectorId'){
      if(value.length>120||!(/^[\p{L}\p{N} _.\-:]*$/u.test(value))){
        throw new Error('Invalid connector identifier.');
      }
      return value.trim();
    }
    if(!value){return '';}
    if(value.length>2048||value!==value.trim()){throw new Error('Invalid MCP URL.');}
    let uri:URL;
    try{uri=new URL(value);}
    catch{throw new Error('Enter a valid public HTTPS MCP URL.');}
    if(uri.protocol!=='https:'||!uri.hostname||
      uri.username||uri.password||uri.hash||uri.search||
      ['localhost','127.0.0.1','[::1]','::1'].includes(uri.hostname.toLowerCase())||
      /^(?:10|127|0|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\./.test(uri.hostname)||
      uri.hostname.endsWith('.local')||uri.hostname.endsWith('.internal')){
      throw new Error('MCP endpoint must use public HTTPS without embedded credentials or private addresses.');
    }
    return uri.toString();
  }
  if(!secretFields.has(field)||!value||value.length>8192||
    /[\u0000-\u001f\u007f]/.test(value)||value!==value.trim()){
    throw new Error('Invalid credential. Use a nonempty key without control characters.');
  }
  return value;
}
export async function readProviderStatuses(host:Store):Promise<Record<string,AiProviderStoredStatus>>{
  const form=saved(host);
  const profiles=listLocalConnections(host.globalState);
  // SecretStorage performs independent I/O per profile. Cap concurrency to
  // six profiles (up to 12 secret lookups), without caching secret values.
  const statuses=await mapConcurrent(profiles,6,async profile=>{
    const secrets=host.secrets;
    const [api,bearer]=secrets?await Promise.all([
      secrets.get(SECRET_PREFIX+profile.id+':providerApiKey'),
      secrets.get(SECRET_PREFIX+profile.id+':mcpBearer')
    ]):[undefined,undefined];
    return {
      profileId:profile.id,
      publicMcpUrl:form[profile.id]?.publicMcpUrl,
      connectorId:form[profile.id]?.connectorId,
      hasProviderApiKey:typeof api==='string'&&api.length>0,
      hasMcpBearer:typeof bearer==='string'&&bearer.length>0
    };
  });
  return Object.fromEntries(statuses.map(status=>[status.profileId,status]));
}
/** Credentials arrive from a trusted VS Code Webview only when the user
 * submits a field; the host independently validates the field/provider.
 * Saved keys never go back to Webview and are never written into settings JSON.
 */
export async function saveProviderField(host:Store,profileId:string,field:unknown,value:unknown):Promise<void>{
  const provider=profileProvider(host,profileId);
  const allowed=onboardingGuide(provider)?.fields||[];
  if(typeof field!=='string'||!allowed.some(x=>x.id===field)){
    throw new Error('Unsupported setup field for this provider.');
  }
  if(typeof value!=='string'){throw new Error('Invalid setup field value.');}
  const key=field as OnboardingFieldId;
  const normalized=validateValue(key,value);
  if(secretFields.has(key)){
    if(!host.secrets){throw new Error('VS Code SecretStorage is unavailable.');}
    await host.secrets.store(SECRET_PREFIX+profileId+':'+key,normalized);
  }else{
    const all=saved(host);
    await host.globalState.update(SAVE_KEY,{
      ...all,[profileId]:{...all[profileId],[key]:normalized}
    });
  }
}
export async function clearProviderField(host:Store,profileId:string,field:unknown):Promise<void>{
  const provider=profileProvider(host,profileId);
  // Older versions offered unnecessary API key fields for local clients.
  // Existing secrets remain protected until the user explicitly clears them.
  const legacyLocalApiKey=field==='providerApiKey'&&
    (provider==='gemini-cli'||provider==='claude-code');
  if(typeof field!=='string'){
    throw new Error('Unsupported setup field for this provider.');
  }
  if(!legacyLocalApiKey&&!onboardingGuide(provider)?.fields.some(x=>x.id===field)){
    throw new Error('Unsupported setup field for this provider.');
  }
  if(secretFields.has(field as OnboardingFieldId)){
    await host.secrets?.delete(SECRET_PREFIX+profileId+':'+field);
  }else{
    const all=saved(host);
    const item={...(all[profileId]||{})};
    delete item[field as keyof SavedEntry];
    await host.globalState.update(SAVE_KEY,{...all,[profileId]:item});
  }
}
export async function removeProviderSettings(host:Store,profileId:string):Promise<void>{
  profileProvider(host,profileId);
  const all=saved(host);
  delete all[profileId];
  await host.globalState.update(SAVE_KEY,all);
  for(const field of secretFields){
    await host.secrets?.delete(SECRET_PREFIX+profileId+':'+field);
  }
}