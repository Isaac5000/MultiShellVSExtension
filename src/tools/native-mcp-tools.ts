import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ShellApi } from '../shell-api';
import { NativeKind, NativeArgs } from './native-window-tools';

function response(value:unknown,isError=false):CallToolResult {
    return {isError,content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,2)}]};
}
export function registerNativeTools(server:McpServer,shells:ShellApi):void {
    const selected=z.string().describe('REQUIRED shell ID or short alias; never defaults to another window.');
    async function action(shell_id:string,kind:NativeKind,args:NativeArgs):Promise<CallToolResult>{
        try{
            if(!shells.native){throw new Error('Native VSCode tools are unavailable in this window.');}
            return response(await shells.native(shell_id,kind,args));
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
