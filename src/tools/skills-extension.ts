import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {skillRegularFileStamp} from './skill-stat';
import {z} from 'zod';
import {ProtocolError} from '@modelcontextprotocol/server';
import type {McpServer} from '@modelcontextprotocol/server';
import type {ShellApi} from '../shell-api';
import {readWorkspaceSkill,readSkillBytes,parseSkillUri,skillUri,resolveSkillDirectory,catalogForShell,skillDiscoveryShells} from './agent-skills';
import type {SkillOptions} from './agent-skills';

const MAX_ENTRIES=512;
const MAX_SKILL_BYTES=16*1024*1024;
const MAX_WALK_ENTRIES=4096;
const PAGE=20;
const CACHE={resultType:'complete' as const,ttlMs:0,cacheScope:'private' as const};
/** SHA-256 memoization is stat-validated on *every* manifest traversal.
 * Resource additions/deletions are detected by readdir, including nested
 * directories. No bytes or credentials are retained. */
const MAX_HASH_CACHE=8192;
const resourceHashCache=new Map<string,{stamp:string;digest:string}>();

export interface ServedSkillFile {uri:string;digest:string;size:number}
export interface ServedSkill {
    uri:string;
    frontmatter:Record<string,unknown>;
    resources:ServedSkillFile[];
}

/** Build a complete, immutable manifest snapshot from the same raw bytes
 * resources/read serves. Any later change becomes detectable by the client.
 * Reject symlinks and oversize trees instead of issuing partial manifests. */
export function buildSkillEntry(root:string,shellId:string,selected:string,
    options:SkillOptions={}):ServedSkill {
    const {metadata,frontmatter,content}=readWorkspaceSkill(root,selected,options);
    const {absolute:skillRoot,containmentRoot:canonical}=resolveSkillDirectory(root,selected,options);
    const files:ServedSkillFile[]=[];
    let totalBytes=0;
    let visited=0;
    function visit(absolute:string,parts:string[]):void {
        if(parts.length>32){throw new Error('Skill tree nesting exceeds the safety limit.');}
        const entries=fs.readdirSync(absolute,{withFileTypes:true});
        for(const entry of entries){
            if(++visited>MAX_WALK_ENTRIES){throw new Error('Skill tree too large.');}
            if(!entry.name||entry.name==='.'||entry.name==='..'){throw new Error('Invalid skill file.');}
            const real=path.join(absolute,entry.name);
            // File-system entries may change between readdir and lstat.
            // A symlink or special file makes the manifest unverifiable.
            const stat=fs.lstatSync(real);
            if(stat.isSymbolicLink()){throw new Error('Symlinks are not allowed in skill manifests.');}
            const route=path.relative(canonical,fs.realpathSync(real));
            if(route==='..'||route.startsWith('..'+path.sep)||path.isAbsolute(route)){
                throw new Error('Skill resource leaves its workspace.');
            }
            if(stat.isDirectory()){
                visit(real,[...parts,entry.name]);
            }else if(stat.isFile()){
                if(files.length>=MAX_ENTRIES){throw new Error('Skill exceeds 512 files.');}
                if(totalBytes+stat.size>MAX_SKILL_BYTES){throw new Error('Skill exceeds 16 MiB.');}
                const stamp=skillRegularFileStamp(real);
                const cached=resourceHashCache.get(real);
                let digest:string;
                if(cached?.stamp===stamp){
                    digest=cached.digest;
                }else{
                    const bytes=readSkillBytes(real,MAX_SKILL_BYTES-totalBytes);
                    if(bytes.length!==stat.size||skillRegularFileStamp(real)!==stamp){
                        throw new Error('Skill resource changed during manifest snapshot.');
                    }
                    digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
                    resourceHashCache.delete(real);
                    resourceHashCache.set(real,{stamp,digest});
                    if(resourceHashCache.size>MAX_HASH_CACHE){
                        resourceHashCache.delete(resourceHashCache.keys().next().value!);
                    }
                }
                totalBytes+=stat.size;
                if(parts.length===0&&entry.name==='SKILL.md'&&
                    digest!=='sha256:'+createHash('sha256').update(content,'utf8').digest('hex')){
                    throw new Error('SKILL.md changed during manifest snapshot.');
                }
                files.push({
                    uri:skillUri(shellId,metadata,[...parts,entry.name].join('/')),
                    digest,size:stat.size
                });
            }else{
                throw new Error('Special files are not allowed in skill manifests.');
            }
        }
    }
    const stat=fs.lstatSync(skillRoot);
    if(!stat.isDirectory()||stat.isSymbolicLink()){
        throw new Error('Invalid skill directory.');
    }
    visit(skillRoot,[]);
    const uri=skillUri(shellId,metadata);
    if(!files.some(f=>f.uri===uri)){throw new Error('SKILL.md missing from its manifest.');}
    files.sort((a,b)=>a.uri===uri?-1:b.uri===uri?1:a.uri.localeCompare(b.uri));
    return {uri,frontmatter,resources:files};
}
function invalid(message:string):never {throw new ProtocolError(-32602,message);}
async function manifestForShell(shells:ShellApi,id:string,selected:string,options:SkillOptions):Promise<ServedSkill>{
    if(shells.skillManifest){return shells.skillManifest(id,selected,options);}
    return buildSkillEntry(shells.root(id),id,selected,options);
}
async function listCandidates(shells:ShellApi,options:SkillOptions):Promise<Array<{
    shellId:string;selected:string;uri:string;preferred:boolean
}>>{
    const active=skillDiscoveryShells(await shells.list());
    const batches=await Promise.all(active.map(async shell=>{
        try{
            const {skills}=await catalogForShell(shells,shell.shell_id,options);
            // Discover metadata first. File hashing belongs only to the page
            // requested by the client, not to every skill on every page.
            return skills.map(skill=>({shellId:shell.shell_id,
                selected:skill.skill_path,uri:skillUri(shell.shell_id,skill),
                preferred:skill.preferred===true}));
        }catch{return [];}
    }));
    return batches.flat().sort((a,b)=>Number(b.preferred)-Number(a.preferred)||
        a.uri.localeCompare(b.uri));
}
export function registerSkillsExtension(mcp:McpServer,shells:ShellApi,options:SkillOptions={}):void {
    const skillFile=z.object({uri:z.string(),digest:z.string(),size:z.number().int().nonnegative()});
    const entry=z.object({uri:z.string(),frontmatter:z.record(z.string(),z.unknown()),
        resources:z.array(skillFile)});
    const outputCommon={resultType:z.literal('complete'),ttlMs:z.number(),
        cacheScope:z.enum(['private','public'])};
    // This is a 2026-07-28 extension. Its capabilities must only be
    // advertised by the modern v2 transport, never the legacy v1 transport.
    mcp.server.registerCapabilities({
        resources:{},
        extensions:{'io.modelcontextprotocol/skills':{directoryRead:false}}
    });
    mcp.server.setRequestHandler('skills/list',{
        params:z.object({cursor:z.string().optional()}).passthrough(),
        result:z.object({...outputCommon,skills:z.array(entry),nextCursor:z.string().optional()})
    },async ({cursor})=>{
        const start=cursor===undefined?0:Number(cursor);
        if(!Number.isSafeInteger(start)||start<0||String(start)!==String(cursor??0)){
            invalid('Invalid skills cursor.');
        }
        const all=await listCandidates(shells,options);
        if(start>all.length){invalid('Invalid skills cursor.');}
        const skills:ServedSkill[]=[];
        for(const candidate of all.slice(start,start+PAGE)){
            // Yield between bounded manifest reads so control requests and
            // cancellation can be observed by the host's event loop.
            await new Promise<void>(resolve=>setImmediate(resolve));
            try{skills.push(await manifestForShell(shells,candidate.shellId,candidate.selected,options));}
            catch{/* Invalid or disconnected skills are not advertised. */}
        }
        const next=start+PAGE<all.length?String(start+PAGE):undefined;
        return {...CACHE,skills,...(next?{nextCursor:next}:{})};
    });
    mcp.server.setRequestHandler('skills/get',{
        params:z.object({uri:z.string().min(1)}).passthrough(),
        result:z.object({...outputCommon,skill:entry})
    },async ({uri})=>{
        let parsed:ReturnType<typeof parseSkillUri>;
        try{parsed=parseSkillUri(uri);}
        catch{invalid('No skill is served at '+uri);}
        if(parsed.file!=='SKILL.md'){invalid('Expected the skill SKILL.md URI.');}
        try{
            const skill=await manifestForShell(shells,parsed.shellId,parsed.selected,options);
            if(skill.uri!==uri){invalid('No skill is served at '+uri);}
            return {...CACHE,skill};
        }catch(e){
            if(e instanceof ProtocolError){throw e;}
            invalid('No skill is served at '+uri);
        }
    });
}
