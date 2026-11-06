import { ShellDescription, ShellExecutionResult, ShellOrigin } from './shell-manager';
import type {BackgroundJobSnapshot} from './background-jobs';
import type { NativeKind, NativeArgs } from './tools/native-window-tools';
import type {SkillOptions,SkillScopeFilter,SkillInfo} from './tools/agent-skills';
import type {ServedSkill} from './tools/skills-extension';

/** Used by MCP tools regardless of which VSCode window owns the terminal. */
export interface ShellRequestOptions {signal?:AbortSignal;}
export interface ShellApi {
    create(id: string, cwd?: string, allowSharedDirectory?: boolean, windowId?: string, origin?:ShellOrigin, options?:ShellRequestOptions): ShellDescription | Promise<ShellDescription>;
    createUserWithApproval?(id:string,cwd?:string,allowSharedDirectory?:boolean,windowId?:string,signal?:AbortSignal):Promise<ShellDescription>;
    list(): ShellDescription[] | Promise<ShellDescription[]>;
    close(id: string, options?:ShellRequestOptions): void | Promise<void>;
    root(id: string): string;
    /** Optional skill actions are implemented by WindowRouter so all skill
     * reads run in their owning VS Code worker, never in the hub filesystem. */
    skillList?(id:string,scope:SkillScopeFilter,includeGlobal:boolean,options?:SkillOptions):Promise<{skills:SkillInfo[];warnings:string[];next_cursor?:string}>;
    skillRead?(id:string,skillPath:string,options:SkillOptions):Promise<{metadata:SkillInfo;content:string;frontmatter:Record<string,unknown>}>;
    skillFile?(id:string,skillPath:string,file:string,encoding:'utf-8'|'base64',options:SkillOptions):Promise<{skill_path:string;file:string;encoding:'utf-8'|'base64';content:string}>;
    skillManifest?(id:string,skillPath:string,options:SkillOptions):Promise<ServedSkill>;
    execute(id: string, command: string, timeoutMs?: number, signal?: AbortSignal): Promise<ShellExecutionResult>;
    executeIsolated?(id: string, command: string, timeoutMs?: number, signal?: AbortSignal): Promise<ShellExecutionResult>;
    /** Non-interactive jobs live in the owning VS Code worker, not a request transport. */
    startBackground?(id:string,command:string,timeoutMs?:number,signal?:AbortSignal):Promise<BackgroundJobSnapshot>;
    backgroundStatus?(id:string,jobId:string,maxChars?:number):Promise<BackgroundJobSnapshot>;
    listBackgroundJobs?(id:string,max?:number):Promise<BackgroundJobSnapshot[]>;
    cancelBackground?(id:string,jobId:string):Promise<BackgroundJobSnapshot>;
    windows?(): Array<{window_id:string; workspace:string; online:boolean; machine_id?:string}>;
    setAlias?(id: string, alias: string, options?:ShellRequestOptions): Promise<{shell_id:string;alias:string}>;
    native?(id:string,kind:NativeKind,args:NativeArgs):Promise<unknown>;
}