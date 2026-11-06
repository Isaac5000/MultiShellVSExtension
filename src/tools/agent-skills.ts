import * as fs from 'node:fs';
import {skillRegularFileStamp} from './skill-stat';
import * as path from 'node:path';
import * as os from 'node:os';
import YAML from 'yaml';
import {ResourceTemplate} from '@modelcontextprotocol/server';
import {ToolRegistry} from './tool-registry';
import { z } from 'zod';
import type {CallToolResult} from '@modelcontextprotocol/server';
import type { ShellApi } from '../shell-api';
import type { ShellDescription } from '../shell-manager';

/** Global Codex access is opt-in: when enabled it exposes the invoking
 * OS user's personal skills to the connected MCP client (including tunnels).
 * Skills are always read only; this never grants script execution.
 */
const SOURCES={
    agents:{folder:'.agents/skills',scope:'project'},
    github:{folder:'.github/skills',scope:'project'},
    claude:{folder:'.claude/skills',scope:'project'},
    'global-agents':{folder:'.agents/skills',scope:'global'},
    'global-codex':{folder:'.codex/skills',scope:'global'},
    'codex-system':{folder:'.codex/skills/.system',scope:'global'}
} as const;
export type SkillSource=keyof typeof SOURCES;
export type SkillScope='project'|'global';
export type SkillScopeFilter='all'|SkillScope;
export interface SkillOptions {
    includeGlobal?:boolean;
    homeDir?:string; // Test injection; defaults to the OS user running VS Code.
    scope?:SkillScopeFilter;
    query?:string;
    /** Name-only lookup must paginate after filtering by NAME, not description. */
    nameOnly?:boolean;
    cursor?:string;
    limit?:number;
}
const MAX_SKILLS=100;
const MAX_SKILL_BYTES=128*1024;
const MAX_RESOURCE_BYTES=16*1024*1024;
/** Bound metadata reuse; these entries contain no raw file resources or secrets.
 * Every lookup still validates the filesystem path and current file identity. */
const MAX_FRONTMATTER_CACHE=2048;
const MAX_FRONTMATTER_CACHE_BYTES=8*1024*1024;
let frontmatterCachedBytes=0;
const frontmatterCache=new Map<string,{stamp:string;content:string;frontmatter:Record<string,unknown>}>();
/** Per-directory index. On each discovery we still validate its canonical
 * parent, its directory identity and the SKILL.md identity; only redundant
 * per-skill realpath traversals and YAML parsing are omitted. */
const MAX_SKILL_PATH_CACHE=4096;
const skillPathCache=new Map<string,{
    directoryStamp:string;fileStamp:string;source:SkillSource;name:string;metadata:SkillInfo
}>();
const NAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_ROOT=/^(\.agents|\.github|\.claude)\/skills\/([a-z0-9-]{1,64})$/;
const GLOBAL_ROOT=/^@global\/(agents|codex|system)\/([a-z0-9-]{1,64})$/;

export interface SkillInfo {
    name:string;
    description:string;
    skill_path:string;
    source:SkillSource;
    scope:SkillScope;
    shell_id?:string;
    uri?:string;
}
function validName(name:string):boolean{
    return name.length<=64&&NAME.test(name);
}
function segments(value:string):string[]{
    if(typeof value!=='string'||!value||value.includes('\\')||
        value.includes('\0')||value.startsWith('/')||/^[a-z]:/i.test(value)){
        throw new Error('Only relative forward-slash paths are permitted.');
    }
    const parts=value.split('/');
    if(parts.some(part=>!part||part==='.'||part==='..')){
        throw new Error('Invalid path segment or directory traversal.');
    }
    return parts;
}
function contained(root:string,real:string):boolean{
    const relative=path.relative(root,real);
    return relative!== '..' && !relative.startsWith('..'+path.sep) &&
        !path.isAbsolute(relative);
}
/** Validate each component after canonical resolution. Global symlinks are
 * accepted only when every target stays inside the user's home directory. */
function safeExisting(root:string,relative:string,allowContainedLinks=false):string{
    const parts=segments(relative);
    const canonical=fs.realpathSync(root);
    let current=canonical;
    for(const part of parts){
        const next=path.join(current,part);
        if(fs.lstatSync(next).isSymbolicLink()&&!allowContainedLinks){
            throw new Error('Symbolic links are not allowed in workspace skill paths.');
        }
        current=fs.realpathSync(next);
        if(!contained(canonical,current)){
            throw new Error('Skill path leaves its authorized root.');
        }
    }
    return current;
}
function sourceRoot(workspace:string,source:SkillSource,options:SkillOptions):string{
    if(SOURCES[source].scope==='project'){return workspace;}
    if(!options.includeGlobal){
        throw new Error('Global Codex skills are disabled. Enable multi-shell-mcp.globalCodexSkills in VS Code settings.');
    }
    return options.homeDir||os.homedir();
}
export function skillPath(source:SkillSource,name:string):string{
    if(!validName(name)){throw new Error('Invalid skill name.');}
    if(source==='global-agents'){return '@global/agents/'+name;}
    if(source==='global-codex'){return '@global/codex/'+name;}
    if(source==='codex-system'){return '@global/system/'+name;}
    return SOURCES[source].folder+'/'+name;
}
export function parseSkillPath(value:string):{
    source:SkillSource;name:string;relative:string
}{
    const glob=GLOBAL_ROOT.exec(value);
    if(glob&&validName(glob[2])){
        const source=glob[1]==='agents'?'global-agents':
            glob[1]==='codex'?'global-codex':'codex-system';
        return {source,name:glob[2],relative:SOURCES[source].folder+'/'+glob[2]};
    }
    const project=PROJECT_ROOT.exec(value);
    if(project&&validName(project[2])){
        const source=(Object.keys(SOURCES) as SkillSource[])
            .find(k=>SOURCES[k].scope==='project'&&
                SOURCES[k].folder===project[1]+'/skills');
        if(source){return {source,name:project[2],relative:skillPath(source,project[2])};}
    }
    throw new Error('Select an exact skill_path returned by list_skills_code.');
}
export function resolveSkillDirectory(root:string,selected:string,options:SkillOptions={}):{
    absolute:string;containmentRoot:string;source:SkillSource;name:string;scope:SkillScope
}{
    const {source,name,relative}=parseSkillPath(selected);
    const base=sourceRoot(root,source,options);
    const absolute=safeExisting(base,relative,SOURCES[source].scope==='global');
    return {
        absolute,containmentRoot:absolute,
        source,name,scope:SOURCES[source].scope
    };
}
/** Bound allocations and reads even if a file grows after validation. A file
 * descriptor pins the opened file; no-follow also rejects a replaced leaf link
 * on platforms that support it. Never wait while opening a special file. */
export function readSkillBytes(file:string,limit:number):Buffer{
    const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0);
    const descriptor=fs.openSync(file,flags);
    try{
        const stat=fs.fstatSync(descriptor);
        if(!stat.isFile()){throw new Error('Skill resource is not a regular file.');}
        if(stat.size>limit){throw new Error('Skill file exceeds its read limit.');}
        const bytes=Buffer.alloc(stat.size+1);
        let size=0;
        while(size<bytes.length){
            const count=fs.readSync(descriptor,bytes,size,bytes.length-size,null);
            if(count===0){break;}
            size+=count;
        }
        const current=fs.fstatSync(descriptor);
        if(size!==stat.size||current.size!==stat.size||
            current.mtimeMs!==stat.mtimeMs||current.ctimeMs!==stat.ctimeMs){
            throw new Error('Skill resource changed during its bounded read.');
        }
        return bytes.subarray(0,size);
    }finally{fs.closeSync(descriptor);}
}
function inspectSkill(root:string,source:SkillSource,name:string,options:SkillOptions):{
    metadata:SkillInfo;content:string;frontmatter:Record<string,unknown>
}{
    const base=sourceRoot(root,source,options);
    const relative=SOURCES[source].folder+'/'+name;
    const directory=safeExisting(base,relative,SOURCES[source].scope==='global');
    return inspectSkillDirectory(directory,source,name);
}
function inspectSkillDirectory(directory:string,source:SkillSource,name:string):{
    metadata:SkillInfo;content:string;frontmatter:Record<string,unknown>
}{
    // Installation directories may link to another skill inside the authorized
    // home, but files inside that selected skill must not link elsewhere.
    const file=safeExisting(directory,'SKILL.md');
    const stamp=skillRegularFileStamp(file);
    const hit=frontmatterCache.get(file);
    let content:string;
    let fields:Record<string,unknown>;
    if(hit?.stamp===stamp){
        content=hit.content;
        fields=hit.frontmatter;
    }else{
        content=readSkillBytes(file,MAX_SKILL_BYTES).toString('utf8').replace(/^\uFEFF/,'');
        const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
        if(!match){throw new Error('Missing YAML frontmatter in SKILL.md.');}
        const parsed=YAML.parseDocument(match[1],{strict:true,uniqueKeys:true});
        if(parsed.errors.length){throw new Error('Invalid SKILL.md YAML frontmatter.');}
        const front=parsed.toJS({maxAliasCount:0}) as unknown;
        if(!front||typeof front!=='object'||Array.isArray(front)){
            throw new Error('Skill frontmatter must be a mapping.');
        }
        fields=front as Record<string,unknown>;
        if(skillRegularFileStamp(file)!==stamp){
            throw new Error('Skill metadata changed during its bounded read.');
        }
    }
    if(fields.name!==name){throw new Error('Skill name must match the directory name.');}
    if(typeof fields.description!=='string'||!fields.description.trim()||
        fields.description.length>1024){
        throw new Error('Skill description must contain 1â€“1024 characters.');
    }
    if(hit?.stamp!==stamp){
        if(hit){frontmatterCachedBytes-=Buffer.byteLength(hit.content);}
        frontmatterCache.delete(file);
        const bytes=Buffer.byteLength(content);
        if(bytes<=MAX_FRONTMATTER_CACHE_BYTES){
            frontmatterCache.set(file,{stamp,content,frontmatter:fields});
            frontmatterCachedBytes+=bytes;
            while(frontmatterCache.size>MAX_FRONTMATTER_CACHE||
                frontmatterCachedBytes>MAX_FRONTMATTER_CACHE_BYTES){
                const oldest=frontmatterCache.keys().next().value!;
                frontmatterCachedBytes-=Buffer.byteLength(frontmatterCache.get(oldest)!.content);
                frontmatterCache.delete(oldest);
            }
        }
    }
    return {
        metadata:{name,description:fields.description.trim(),
            skill_path:skillPath(source,name),source,scope:SOURCES[source].scope},
        content,frontmatter:structuredClone(fields)
    };
}
function directoryIdentity(file:string):string{
    const stat=fs.lstatSync(file,{bigint:true});
    if(!stat.isDirectory()||stat.isSymbolicLink()){
        throw new Error('Skill directory is not a regular directory.');
    }
    return [stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,
        stat.mtimeNs,stat.ctimeNs].join(':');
}
function indexedSkillInfo(root:string,folder:string,source:SkillSource,
    entry:fs.Dirent,options:SkillOptions):SkillInfo{
    // Global skill directory symlinks are supported only after the full
    // home-root containment check by inspectSkill; never fast-path links.
    if(entry.isSymbolicLink()){
        return inspectSkill(root,source,entry.name,options).metadata;
    }
    const directory=path.join(folder,entry.name);
    const beforeDir=directoryIdentity(directory);
    const file=path.join(directory,'SKILL.md');
    const beforeFile=skillRegularFileStamp(file);
    const cached=skillPathCache.get(directory);
    if(cached?.directoryStamp===beforeDir&&cached.fileStamp===beforeFile&&
        cached.source===source&&cached.name===entry.name){
        return {...cached.metadata};
    }
    const metadata=inspectSkill(root,source,entry.name,options).metadata;
    if(directoryIdentity(directory)!==beforeDir||skillRegularFileStamp(file)!==beforeFile){
        throw new Error('Skill directory changed during discovery.');
    }
    skillPathCache.delete(directory);
    skillPathCache.set(directory,{directoryStamp:beforeDir,fileStamp:beforeFile,
        source,name:entry.name,metadata});
    if(skillPathCache.size>MAX_SKILL_PATH_CACHE){
        skillPathCache.delete(skillPathCache.keys().next().value!);
    }
    return {...metadata};
}
export function listWorkspaceSkills(root:string,options:SkillOptions={}):{
    skills:SkillInfo[];warnings:string[];next_cursor?:string
}{
    const skills:SkillInfo[]=[];
    const warnings:string[]=[];
    const start=options.cursor===undefined?0:Number(options.cursor);
    const limit=options.limit??MAX_SKILLS;
    if(!Number.isSafeInteger(start)||start<0||String(start)!==String(options.cursor??0)||
        !Number.isInteger(limit)||limit<1||limit>MAX_SKILLS){throw new Error('Invalid skill catalog cursor or limit.');}
    const query=options.query?.trim().toLowerCase();
    if(query&&query.length>100){throw new Error('Skill search query exceeds 100 characters.');}
    let matched=0,visited=0;
    for(const source of Object.keys(SOURCES) as SkillSource[]){
        const def=SOURCES[source];
        if(options.scope&&options.scope!=='all'&&def.scope!==options.scope){continue;}
        if(def.scope==='global'&&!options.includeGlobal){continue;}
        let entries:fs.Dirent[];
        let folder:string;
        try{
            folder=safeExisting(sourceRoot(root,source,options),
                def.folder,def.scope==='global');
            if(!fs.statSync(folder).isDirectory()){continue;}
            entries=fs.readdirSync(folder,{withFileTypes:true});
        }catch(error){
            if((error as NodeJS.ErrnoException).code==='ENOENT'){continue;}
            warnings.push(def.folder+': '+String(error));
            continue;
        }
        for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
            if(++visited>4096){warnings.push('Skill scan limited to 4096 entries. Narrow the scope.');return {skills,warnings};}
            if(source==='global-codex' && entry.name==='.system'){continue;}
            if(!entry.isDirectory()&&!(def.scope==='global'&&entry.isSymbolicLink())){continue;}
            if(!validName(entry.name)){
                warnings.push(def.folder+'/'+entry.name+': invalid skill name');
                continue;
            }
            try{
                const info=indexedSkillInfo(root,folder,source,entry,options);
                if(query&&!info.name.toLowerCase().includes(query)&&
                    (options.nameOnly||!info.description.toLowerCase().includes(query))){continue;}
                if(matched++<start){continue;}
                if(skills.length===limit){
                    warnings.push('More skills available; continue with next_cursor and the same scope/query.');
                    return {skills,warnings,next_cursor:String(start+limit)};
                }
                skills.push(info);
            }
            catch(e){
                warnings.push(def.folder+'/'+entry.name+': '+
                    (e instanceof Error?e.message:String(e)));
            }
        }
    }
    return {skills,warnings};
}
export function readWorkspaceSkill(root:string,selected:string,options:SkillOptions={}):{
    metadata:SkillInfo;content:string;frontmatter:Record<string,unknown>
}{
    const {source,name}=parseSkillPath(selected);
    return inspectSkill(root,source,name,options);
}
export function readWorkspaceSkillFile(root:string,selected:string,file:string,
    encoding:'utf-8'|'base64'='utf-8',options:SkillOptions={}):{
        skill_path:string;file:string;encoding:'utf-8'|'base64';content:string
    }{
    const {source,name,absolute:directory}=resolveSkillDirectory(root,selected,options);
    inspectSkillDirectory(directory,source,name);
    const pieces=segments(file);
    const absolute=safeExisting(directory,pieces.join('/'));
    const contents=readSkillBytes(absolute,MAX_RESOURCE_BYTES);
    return {
        skill_path:skillPath(source,name),file:pieces.join('/'),encoding,
        content:contents.toString(encoding==='base64'?'base64':'utf8')
    };
}
export function skillUri(shellId:string,info:SkillInfo,file='SKILL.md'):string{
    const tail=[shellId,info.source,info.name,...segments(file)]
        .map(encodeURIComponent).join('/');
    return 'skill://workspace/'+tail;
}
export function parseSkillUri(raw:string):{
    shellId:string;selected:string;file:string
}{
    const uri=new URL(raw);
    if(uri.protocol!=='skill:'||uri.hostname!=='workspace'||uri.search||uri.hash){
        throw new Error('Unsupported skill resource URI.');
    }
    const parts=uri.pathname.slice(1).split('/').map(decodeURIComponent);
    if(parts.length<4||parts.some(part=>!part||part==='.'||part==='..'||
        part.includes('/')||part.includes('\\'))){
        throw new Error('Invalid skill resource URI.');
    }
    const [shellId,sourceName,name,...rest]=parts;
    if(!(sourceName in SOURCES)){throw new Error('Invalid skill source.');}
    const source=sourceName as SkillSource;
    return {shellId,selected:skillPath(source,name),file:rest.join('/')};
}
function reply(value:unknown,failed=false):CallToolResult {
    // Clients parse JSON; whitespace-only formatting inflates token and
    // transport costs for large skill catalogs without adding information.
    return {isError:failed,content:[{type:'text',text:JSON.stringify(value)}]};
}
function fail(e:unknown):CallToolResult {
    return reply({error:e instanceof Error?e.message:String(e)},true);
}
/** The hub has no authority to open a different window's filesystem.
 * WindowRouter forwards these reads to the worker that owns shell_id.
 * Fallback applies only to standalone local ShellApi implementations. */
export async function listSkillsForShell(shells:ShellApi,id:string,options:SkillOptions={}):Promise<{
    skills:SkillInfo[];warnings:string[];next_cursor?:string
}>{
    if(shells.skillList){
        return shells.skillList(id,options.scope||'all',options.includeGlobal===true,options);
    }
    return listWorkspaceSkills(shells.root(id),options);
}
export async function readSkillForShell(shells:ShellApi,id:string,selected:string,options:SkillOptions={}){
    if(shells.skillRead){return shells.skillRead(id,selected,options);}
    return readWorkspaceSkill(shells.root(id),selected,options);
}
export async function catalogForShell(shells:ShellApi,id:string,options:SkillOptions={}){
    const skills:SkillInfo[]=[],warnings:string[]=[];
    let cursor:string|undefined;
    const seen=new Set<string>();
    do{
        const page=await listSkillsForShell(shells,id,{...options,cursor,limit:100});
        skills.push(...page.skills);warnings.push(...page.warnings);
        cursor=page.next_cursor;
        if(cursor){
            if(seen.has(cursor)){throw new Error('Skill catalog cursor did not advance.');}
            seen.add(cursor);
        }
    }while(cursor&&skills.length<4096&&seen.size<41);
    return {skills,warnings};
}
export async function readSkillFileForShell(shells:ShellApi,id:string,selected:string,
    file:string,encoding:'utf-8'|'base64'='utf-8',options:SkillOptions={}){
    if(shells.skillFile){return shells.skillFile(id,selected,file,encoding,options);}
    return readWorkspaceSkillFile(shells.root(id),selected,file,encoding,options);
}
/** Reuse discovery only for the exact same root in the exact owner window.
 * Do not canonicalize another worker's filesystem on the coordinator. Without
 * an owner ID, retain every shell instead of guessing they share a machine. */
export function skillDiscoveryShells(active:ShellDescription[]):ShellDescription[]{
    const seen=new Set<string>();
    return active.filter(shell=>{
        if(!shell.window_id||!shell.initial_cwd){return true;}
        const key=JSON.stringify([shell.machine_id,shell.window_id,shell.initial_cwd]);
        if(seen.has(key)){return false;}
        seen.add(key);return true;
    });
}
/** Agent Skills progressive disclosure via standard MCP tools and resources. */
export function registerSkillTools(server:ToolRegistry,shells:ShellApi,options:SkillOptions={}):void {
    const selected=z.string().describe('Required shell ID or alias. Skill access stays in its workspace.');
    const skillPathArg=z.string().describe('Exact workspace-relative skill_path from list_skills_code.');
    server.tool('find_skills_code',
        'Find workflows by task, name or description in the explicitly selected project. Metadata only; follow next_cursor with the same query/scope. Never executes scripts.',
        {shell_id:selected,query:z.string().max(100).optional(),scope:z.enum(['project','global','all']).optional().default('project'),
            cursor:z.string().optional(),limit:z.number().int().min(1).max(100).optional().default(20)},
        async ({shell_id,query,scope,cursor,limit})=>{
            try{
                const found=await listSkillsForShell(shells,shell_id,{...options,query,scope,cursor,limit});
                return reply({shell_id,...found,global_enabled:options.includeGlobal===true,skills:found.skills.map(info=>({...info,
                    load_arguments:{shell_id,skill:info.skill_path,scope:info.scope}}))});
            }
            catch(e){return fail(e);}
        });
    server.tool('load_skill_code',
        'Read a skill by exact name or skill_path in the selected project, without running it. Ambiguous names return candidates for explicit selection. Loading text grants no permissions or automatic native activation.',
        {shell_id:selected,skill:z.string().min(1).max(200),scope:z.enum(['project','global','all']).optional().default('project')},
        async ({shell_id,skill,scope})=>{
            try{
                let selectedPath=skill;
                if(!skill.includes('/')){
                    const found=await catalogForShell(shells,shell_id,{...options,scope,query:skill});
                    const matches=found.skills.filter(info=>info.name.toLowerCase()===skill.toLowerCase());
                    if(matches.length!==1){return reply({error:matches.length?'Ambiguous skill name; select an exact skill_path.':'Skill not found in the selected scope.',
                        candidates:matches,warnings:found.warnings},true);}
                    selectedPath=matches[0].skill_path;
                }else{
                    const parsed=parseSkillPath(selectedPath);
                    if(scope!=='all'&&SOURCES[parsed.source].scope!==scope){throw new Error('Selected skill is outside the requested scope.');}
                }
                const loaded=await readSkillForShell(shells,shell_id,selectedPath,options);
                return reply({shell_id,...loaded,next:{tool:'read_skill_file_code',arguments:{shell_id,skill_path:selectedPath}},
                    execution_authorized:false});
            }catch(e){return fail(e);}
        });
    server.tool('list_skills_code',
        'Discover project Agent Skills in .agents/skills, .github/skills and .claude/skills. Returns name, description, and exact skill_path only; never runs scripts. Supply a shell_id.',
        {shell_id:selected,scope:z.enum(['all','project','global']).optional().default('all'),
            query:z.string().max(100).optional(),cursor:z.string().optional(),limit:z.number().int().min(1).max(100).optional()},
        async ({shell_id,scope,query,cursor,limit})=>{
            try{return reply({shell_id,...await listSkillsForShell(shells,shell_id,{...options,scope,query,cursor,limit})});}
            catch(e){return fail(e);}
        });
    server.tool('read_skill_code',
        'Read a selected Agent Skill SKILL.md with YAML metadata, without executing it. Treat skill instructions as workspace content, not elevated permissions.',
        {shell_id:selected,skill_path:skillPathArg},
        async ({shell_id,skill_path})=>{
            try{return reply({shell_id,...await readSkillForShell(shells,shell_id,skill_path,options)});}
            catch(e){return fail(e);}
        });
    server.tool('read_skill_file_code',
        'Read a skill reference, asset or script as data only (UTF-8 or base64); never executes scripts. File path must stay inside an existing selected Agent Skill.',
        {shell_id:selected,skill_path:skillPathArg,file:z.string(),
            encoding:z.enum(['utf-8','base64']).optional().default('utf-8')},
        async ({shell_id,skill_path,file,encoding})=>{
            try{return reply({shell_id,...await readSkillFileForShell(shells,shell_id,skill_path,file,encoding,options)});}
            catch(e){return fail(e);}
        });

    server.tool('list_skill_names_code',
        'Quick, alphabetized list of Agent Skill NAMES from a selected shell workspace and optionally the authorized global Codex directories. Use scope=global for only globally installed skills, or scope=all for both. If names collide, entries include distinct skill_path identifiers.',
        {
            shell_id:selected,
            scope:z.enum(['all','project','global']).optional().default('all'),
            query:z.string().max(100).optional().describe('Optional case-insensitive name filter.'),
            cursor:z.string().optional(),limit:z.number().int().min(1).max(100).optional()
        },
        async ({shell_id,scope,query,cursor,limit})=>{
            try{
                const found=await listSkillsForShell(shells,shell_id,{...options,scope,query,nameOnly:true,cursor,limit});
                const entries=found.skills
                    .map(skill=>({name:skill.name,scope:skill.scope,
                        source:skill.source,skill_path:skill.skill_path}));
                const names=[...new Set(entries.map(skill=>skill.name))].sort();
                return reply({shell_id,scope,names,entries,total:names.length,
                    next_cursor:found.next_cursor,warnings:found.warnings,global_enabled:options.includeGlobal===true});
            }catch(e){return fail(e);}
        });
    // A widely supported read-only MCP resource index; in particular some
    // Agent Skills hosts recognize the skill://index.json discovery format.
    server.registerResource('agent-skills-index','skill://index.json',
        {description:'Agent Skills advertised by connected VS Code windows (read only)',
            mimeType:'application/json'},
        async uri=>{
            const active=skillDiscoveryShells(await shells.list());
            const skills: Array<{name:string;type:'skill-md';description:string;url:string}>=[];
            for(const shell of active){
                // A disconnected worker must not make every other window's
                // skill discovery unavailable.
                let catalog:ReturnType<typeof listWorkspaceSkills>;
                try{catalog=await catalogForShell(shells,shell.shell_id,options);}
                catch{continue;}
                for(const info of catalog.skills){
                    skills.push({name:info.name,type:'skill-md',
                        description:info.description,url:skillUri(shell.shell_id,info)});
                }
            }
            return {contents:[{uri:uri.href,mimeType:'application/json',
                text:JSON.stringify({
                    $schema:'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
                    skills
                })}]};
        });
    server.registerResource('agent-skill-file',
        new ResourceTemplate('skill://workspace/{+skillFile}',{list:undefined}),
        {description:'A workspace-scoped SKILL.md or supporting skill resource',
            mimeType:'text/plain'},
        async (uri,{skillFile})=>{
            if(typeof skillFile!=='string'){throw new Error('Invalid skill URI.');}
            const {shellId,selected,file}=parseSkillUri(uri.href);
            const ext=path.extname(file).toLowerCase();
            const textual=['.md','.txt','.json','.yaml','.yml','.csv','.xml','.js','.ts','.py','.sh','.ps1'].includes(ext);
            // Transfer text directly across worker RPC; base64 costs 33% more
            // bytes and an extra encode/decode. Keep binary byte-exact.
            const actual=await readSkillFileForShell(shells,shellId,selected,file,
                textual?'utf-8':'base64',options);
            if(textual){
                return {contents:[{uri:uri.href,mimeType:ext==='.md'?'text/markdown':'text/plain',
                    text:actual.content}]};
            }
            return {contents:[{uri:uri.href,mimeType:'application/octet-stream',
                blob:actual.content}]};
        });
}