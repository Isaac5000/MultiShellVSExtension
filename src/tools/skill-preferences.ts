import {parseSkillPath} from './agent-skills';

/** Preferences are metadata only. No skill contents, scripts or secrets are persisted.
 * workspaceState is scoped to this VS Code workspace; globalState is per user.
 * Invalid/stale entries never grant access or become executable instructions. */
export const PROJECT_PREFERRED_SKILLS='multiShellPreferredProjectSkills';
export const GLOBAL_PREFERRED_SKILLS='multiShellPreferredGlobalSkills';
export const MAX_PREFERRED_SKILLS=24;

export interface SkillPreferenceStorage {
    get<T>(key:string,defaultValue:T):T;
    update(key:string,value:unknown):Thenable<void>|Promise<void>;
}
export function safePreferredPaths(raw:unknown,scope:'project'|'global'):string[]{
    if(!Array.isArray(raw)){return [];}
    const paths:string[]=[];
    for(const value of raw.slice(0,MAX_PREFERRED_SKILLS*4)){
        if(typeof value!=='string'||value.length>200){continue;}
        try{
            const {source}=parseSkillPath(value);
            const actual=source.startsWith('global-')||source==='codex-system'?'global':'project';
            if(actual===scope&&!paths.includes(value)){
                paths.push(value);
                if(paths.length>=MAX_PREFERRED_SKILLS){break;}
            }
        }catch{/* A malformed path cannot become a preference. */}
    }
    return paths;
}
export function getPreferredPaths(project:SkillPreferenceStorage,
    global:SkillPreferenceStorage|undefined,includeGlobal:boolean):string[]{
    const local=safePreferredPaths(project.get(PROJECT_PREFERRED_SKILLS,[]),'project');
    return includeGlobal&&global
        ?local.concat(safePreferredPaths(global.get(GLOBAL_PREFERRED_SKILLS,[]),'global'))
        :local;
}
export async function setPreferredPath(storage:SkillPreferenceStorage,
    skillPath:string,scope:'project'|'global',enabled:boolean):Promise<string[]>{
    if(typeof enabled!=='boolean'){throw new Error('Invalid preference value.');}
    const {source}=parseSkillPath(skillPath);
    const actual=source.startsWith('global-')||source==='codex-system'?'global':'project';
    if(actual!==scope){throw new Error('Skill scope does not match preference scope.');}
    const key=scope==='global'?GLOBAL_PREFERRED_SKILLS:PROJECT_PREFERRED_SKILLS;
    const paths=safePreferredPaths(storage.get(key,[]),scope);
    const next=enabled
        ?paths.includes(skillPath)?paths:[...paths,skillPath]
        :paths.filter(path=>path!==skillPath);
    if(next.length>MAX_PREFERRED_SKILLS){throw new Error('Only 24 preferred skills per scope are supported.');}
    if(JSON.stringify(paths)!==JSON.stringify(next)){
        await storage.update(key,next);
    }
    return next;
}
