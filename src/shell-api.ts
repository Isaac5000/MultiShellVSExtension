import { ShellDescription, ShellExecutionResult, ShellOrigin } from './shell-manager';
import type { NativeKind, NativeArgs } from './tools/native-window-tools';

/** Used by MCP tools regardless of which VSCode window owns the terminal. */
export interface ShellApi {
    create(id: string, cwd?: string, allowSharedDirectory?: boolean, windowId?: string, origin?:ShellOrigin): ShellDescription | Promise<ShellDescription>;
    createUserWithApproval?(id:string,cwd?:string,allowSharedDirectory?:boolean,windowId?:string,signal?:AbortSignal):Promise<ShellDescription>;
    list(): ShellDescription[] | Promise<ShellDescription[]>;
    close(id: string): void | Promise<void>;
    root(id: string): string;
    execute(id: string, command: string, timeoutMs?: number, signal?: AbortSignal): Promise<ShellExecutionResult>;
    executeIsolated?(id: string, command: string, timeoutMs?: number, signal?: AbortSignal): Promise<ShellExecutionResult>;
    windows?(): Array<{window_id:string; workspace:string; online:boolean}>;
    setAlias?(id: string, alias: string): Promise<{shell_id:string;alias:string}>;
    native?(id:string,kind:NativeKind,args:NativeArgs):Promise<unknown>;
}