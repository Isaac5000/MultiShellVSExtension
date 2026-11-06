import {ToolRegistry} from './tool-registry';
import type {CallToolResult} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ShellApi } from '../shell-api';
import { NativeKind, NativeArgs } from './native-window-tools';

function response(value:unknown,isError=false):CallToolResult {
    return {isError,content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]};
}
export function registerNativeTools(server:ToolRegistry,shells:ShellApi):void {
    const selected=z.string().optional().describe(
        'Shell ID or short alias; only omitted when exactly one shell exists.');
    async function action(shell_id:string|undefined,kind:NativeKind,args:NativeArgs):Promise<CallToolResult>{
        try{
            if(!shells.native){throw new Error('Native VSCode tools are unavailable in this window.');}
            const available=await shells.list();
            const chosen=shell_id||(available.length===1?available[0].shell_id:undefined);
            if(!chosen){throw new Error('Explicit shell_id required when zero or multiple shells are present.');}
            return response(await shells.native(chosen,kind,args));
        }catch(error){return response({error:error instanceof Error?error.message:String(error)},true);}
    }
    server.tool('get_diagnostics_code','Read VSCode diagnostics only from the explicitly selected shell/window.',
        {shell_id:selected,path:z.string().optional(),maxResults:z.number().int().min(1).max(200).optional(),
            severities:z.array(z.number().int().min(0).max(3)).optional().default([0,1]),
            format:z.enum(['text','json']).optional().default('text'),
            includeSource:z.boolean().optional().default(true)},
        async ({shell_id,path,maxResults,severities,format,includeSource})=>
            action(shell_id,'diagnostics',{file:path,maxResults,severities,format,includeSource}));
    server.tool('search_symbols_code','Search VSCode workspace symbols inside the selected shell root.',
        {shell_id:selected,query:z.string(),maxResults:z.number().int().min(1).max(200).optional().default(10)},
        async ({shell_id,query,maxResults})=>action(shell_id,'symbols',{query,maxResults}));
    server.tool('get_document_symbols_code','Get native VSCode symbols for a relative file inside the selected shell root.',
        {shell_id:selected,path:z.string(),maxResults:z.number().int().min(1).max(200).optional(),
            maxDepth:z.number().int().min(0).max(20).optional()},
        async ({shell_id,path,maxDepth,maxResults})=>action(shell_id,'document',{file:path,maxDepth,maxResults}));
    server.tool('get_symbol_definition_code','Resolve a named symbol on a 1-based line or supply a column; scoped to the selected shell.',
        {shell_id:selected,path:z.string(),line:z.number().int().positive(),
            symbol:z.string().optional(),column:z.number().int().positive().optional(),
            maxResults:z.number().int().min(1).max(200).optional()},
        async ({shell_id,path,line,symbol,column,maxResults})=>
            action(shell_id,'definition',{file:path,line,symbol,column,maxResults}));
}