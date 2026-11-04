import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {parse,parseDocument} from 'yaml';
import {randomUUID} from 'crypto';
import {validateProfileName} from './tunnel-release';

export interface ExistingTunnelProfile {
    file:string;name:string;serverUrl:string;
}
/** Only local standard Tunnel Client directories are searched. No recursive
 * traversal, no workspace files, and no arbitrary paths from MCP clients. */
export function existingProfileDirectories(platform=process.platform,
    env:NodeJS.ProcessEnv=process.env,home=os.homedir()):string[]{
    const candidates:string[]=[];
    if(platform==='win32'&&env.APPDATA){
        candidates.push(path.join(env.APPDATA,'tunnel-client'));
    }
    if(env.XDG_CONFIG_HOME&&path.isAbsolute(env.XDG_CONFIG_HOME)){
        candidates.push(path.join(env.XDG_CONFIG_HOME,'tunnel-client'));
    }
    candidates.push(path.join(home,'.config','tunnel-client'));
    if(platform==='darwin'){
        candidates.push(path.join(home,'Library','Application Support','tunnel-client'));
    }
    return [...new Set(candidates.map(candidate=>path.resolve(candidate)))];
}
function isLocalMcpUrl(text:string,port:number):boolean{
    try{
        const url=new URL(text);
        return url.protocol==='http:'&&
            ['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase())&&
            Number(url.port)===port&&url.pathname==='/mcp'&&!url.username&&!url.password&&
            !url.search&&!url.hash;
    }catch{return false;}
}
/** Read an existing profile's local transport target without revealing the
 * Tunnel ID or any credential references in the extension UI or logs. */
export async function inspectExistingProfile(filename:string,port:number):
Promise<ExistingTunnelProfile>{
    const stat=await fs.promises.lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024){
        throw new Error('Tunnel profile must be a regular YAML file under 256 KiB.');
    }
    const name=validateProfileName(path.basename(filename,'.yaml'));
    if(path.extname(filename).toLowerCase()!=='.yaml'){
        throw new Error('Unsupported profile extension.');
    }
    const content=await fs.promises.readFile(filename,'utf8');
    const document=parse(content,{uniqueKeys:true,maxAliasCount:0}) as {
        control_plane?:{api_key?:unknown;base_url?:unknown};
        health?:{listen_addr?:unknown};
        mcp?:{server_urls?:Array<{url?:unknown}>};
    }|null;
    const urls=document?.mcp?.server_urls;
    if(!Array.isArray(urls)||urls.length!==1||
        urls.some(row=>!row||typeof row.url!=='string'||!isLocalMcpUrl(row.url,port))){
        throw new Error('Profile does not exclusively target this local MultiShell MCP port.');
    }
    // Reject untrusted control-plane hosts before passing a SecretStorage key
    // to an imported YAML profile. Do not silently inherit arbitrary endpoints.
    if(document?.control_plane?.base_url!=='https://api.openai.com'){
        throw new Error('Existing profile must use the official OpenAI control-plane host.');
    }
    if(document?.control_plane?.api_key!=='env:CONTROL_PLANE_API_KEY'){
        throw new Error('Profile must use env:CONTROL_PLANE_API_KEY to accept a key stored in VS Code.');
    }
    if(document?.health?.listen_addr!=='127.0.0.1:8080'){
        throw new Error('Existing profile must use the expected loopback health endpoint 127.0.0.1:8080.');
    }
    return {file:path.resolve(filename),name,serverUrl:'http://127.0.0.1:'+port+'/mcp'};
}
export async function discoverExistingProfiles(port:number,
    platform=process.platform,env:NodeJS.ProcessEnv=process.env,
    home=os.homedir()):Promise<ExistingTunnelProfile[]>{
    const result:ExistingTunnelProfile[]=[];
    for(const directory of existingProfileDirectories(platform,env,home)){
        let entries:fs.Dirent[];
        try{entries=await fs.promises.readdir(directory,{withFileTypes:true});}
        catch{continue;}
        for(const entry of entries.slice(0,512)){
            if(!entry.isFile()||!entry.name.endsWith('.yaml')){continue;}
            try{result.push(await inspectExistingProfile(path.join(directory,entry.name),port));}
            catch{/* Other software and remote profiles must not be offered. */}
        }
    }
    return result.sort((a,b)=>a.name.localeCompare(b.name)||a.file.localeCompare(b.file));
}

/** Update an extension-owned YAML profile only. Imported profiles must never
 * be rewritten. Validate the old profile first and the new file before an
 * atomic rename; failures leave the old profile untouched. */
export async function syncManagedProfilePort(filename:string,oldPort:number,
    newPort:number):Promise<boolean>{
    if(oldPort===newPort){return false;}
    await inspectExistingProfile(filename,oldPort);
    const original=await fs.promises.readFile(filename,'utf8');
    const document=parseDocument(original,{uniqueKeys:true});
    if(document.errors.length){throw new Error('Invalid managed tunnel YAML.');}
    document.setIn(['mcp','server_urls',0,'url'],
        'http://127.0.0.1:'+newPort+'/mcp');
    const directory=path.dirname(filename);
    const temp=path.join(directory,'sync-'+randomUUID().replace(/-/g,'').slice(0,24)+'.yaml');
    try{
        await fs.promises.writeFile(temp,document.toString(),
            {flag:'wx',mode:0o600});
        await inspectExistingProfile(temp,newPort);
        // Refuse to overwrite a profile edited by another window meanwhile.
        if(await fs.promises.readFile(filename,'utf8')!==original){
            throw new Error('Managed tunnel profile changed during port synchronization.');
        }
        await fs.promises.rename(temp,filename);
        return true;
    }finally{
        await fs.promises.rm(temp,{force:true}).catch(()=>{});
    }
}