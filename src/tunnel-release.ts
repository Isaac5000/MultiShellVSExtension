import * as path from 'path';
import * as fs from 'fs';
import {createHash} from 'crypto';
import {spawn} from 'child_process';

export const TUNNEL_VERSION='0.0.19';
export const TUNNEL_RELEASE_URL='https://github.com/openai/tunnel-client/releases/tag/v0.0.19';
/** Digests from v0.0.19/SHA256SUMS.txt (manifest SHA-256:
 * 797c7a4e5790fad997739d5b520a7f4e5530d2d5886badfa1539142e3b048aac). */
export const OFFICIAL_SHA256:Readonly<Record<string,string>>=Object.freeze({
    'win32-x64':'1d0ecc3a54f2a51e27a635ac155f40fbb95df58c52cdeddf6c75532cc0bbeb25',
    'win32-arm64':'a054bfb19d72b446cc9802a7987a17eab517502355d27b18e51814bbb0b32731',
    'linux-x64':'9ee9448592345a9dd1517fb79791ab54d24f051142eb92bcbe8cd355effc9142',
    'linux-arm64':'5a19e556c4a8736ab7a6fde6f0568f6e7411fa2dff21186fc15bc30e9b98a603',
    'darwin-x64':'dff97674c77cac59e6ab3d901e6cff50fb17a5784c01d8959d1f4adb3afdf4bf',
    'darwin-arm64':'2243d024b77af8ee4b4ab7a1447949e5fc8d82bcd2d51b178927f2da9e47ecfd'
});

export interface TunnelAsset {
    platform:string; arch:string; platformTag:string; filename:string;
    sha256:string; url:string; binary:string;
}
export function tunnelAsset(platform=process.platform,arch=process.arch):TunnelAsset{
    const lookup=platform+'-'+arch;
    const sha256=OFFICIAL_SHA256[lookup];
    if(!sha256){throw new Error('Tunnel Client '+TUNNEL_VERSION+' does not support '+lookup);}
    const tag=(platform==='win32'?'windows':platform==='darwin'?'darwin':'linux')+
        '-'+(arch==='x64'?'amd64':'arm64');
    const filename='tunnel-client-v'+TUNNEL_VERSION+'-'+tag+'.zip';
    return {platform,arch,platformTag:tag,filename,sha256,
        url:'https://github.com/openai/tunnel-client/releases/download/v'+TUNNEL_VERSION+'/'+filename,
        binary:platform==='win32'?'tunnel-client.exe':'tunnel-client'};
}
export function validateTunnelId(id:string):string{
    const value=id.trim();
    // Enforced by official Tunnel Client v0.0.19. Reject nested path syntax
    // and malformed IDs before invoking an external executable.
    if(!/^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$/.test(value)){
        throw new Error('Tunnel ID must contain 32 lowercase letters/digits, with an optional 4-character namespace.');
    }
    return value;
}
export function validateProfileName(name:string):string{
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(name)){
        throw new Error('Profile must contain 1-40 letters, digits, underscore or hyphen.');
    }
    return name;
}
export function sha256(buffer:Buffer):string{
    return createHash('sha256').update(buffer).digest('hex');
}
export async function hashFile(file:string):Promise<string>{
    const hash=createHash('sha256');
    const stream=fs.createReadStream(file);
    for await(const chunk of stream){hash.update(chunk);}
    return hash.digest('hex');
}
export async function execChecked(binary:string,args:string[],cwd:string,timeout=12000,
    env?:NodeJS.ProcessEnv):Promise<string>{
    return new Promise((resolve,reject)=>{
        const child=spawn(binary,args,{cwd,env:env??process.env,
            windowsHide:true,stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='',size=0;
        const limit=256*1024;
        const timer=setTimeout(()=>{child.kill();reject(new Error('Tunnel command timed out.'));},timeout);
        const append=(chunk:Buffer,which:'out'|'err')=>{
            size+=chunk.length;
            if(size>limit){child.kill();reject(new Error('Tunnel command exceeded output limit.'));return;}
            if(which==='out'){stdout+=chunk.toString('utf8');}
            else{stderr+=chunk.toString('utf8');}
        };
        child.stdout?.on('data',(chunk:Buffer)=>append(chunk,'out'));
        child.stderr?.on('data',(chunk:Buffer)=>append(chunk,'err'));
        child.once('error',error=>{clearTimeout(timer);reject(error);});
        child.once('close',code=>{
            clearTimeout(timer);
            if(code===0){resolve(stdout.trim());}
            else{reject(new Error('Tunnel command failed (exit '+code+').'+
                // CLI errors may echo secrets; never include raw stderr.
                (stderr?' See Tunnel Client diagnostics.':'')));}
        });
    });
}
interface InstalledMetadata {
    release:string; filename:string; archiveSha256:string;
    executableSha256:string; companionSha256:string;
}
export async function verifiedExecutable(directory:string,asset:TunnelAsset):Promise<string|undefined>{
    const folder=path.join(directory,'tunnel-client','v'+TUNNEL_VERSION,asset.platformTag);
    try{
        const marker=JSON.parse(await fs.promises.readFile(path.join(folder,'verified.json'),'utf8')) as InstalledMetadata;
        if(marker.release!==TUNNEL_VERSION||marker.filename!==asset.filename||
            marker.archiveSha256!==asset.sha256){return undefined;}
        const exe=path.join(folder,asset.binary);
        const companion=path.join(folder,asset.platform==='win32'?'cloudflared.exe':'cloudflared');
        const [a,b]=await Promise.all([hashFile(exe),hashFile(companion)]);
        if(a!==marker.executableSha256||b!==marker.companionSha256){return undefined;}
        return exe;
    }catch{return undefined;}
}
