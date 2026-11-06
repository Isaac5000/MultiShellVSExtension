import {McpServer, ResourceTemplate} from '@modelcontextprotocol/server';
import type {CallToolResult,ReadResourceResult} from '@modelcontextprotocol/server';
import {z} from 'zod';

/** Typed registration convenience over the MCP SDK v2 API.
 * No v1 SDK objects or protocol transports enter this layer. */
export class ToolRegistry {
    constructor(private readonly server:McpServer){}

    tool<S extends z.ZodRawShape>(
        name:string,description:string,shape:S,
        handler:(args:z.output<z.ZodObject<S>>)=>Promise<CallToolResult>,
        annotations?:{
            readOnlyHint?:boolean;
            destructiveHint?:boolean;
            idempotentHint?:boolean;
            openWorldHint?:boolean;
        }
    ):void{
        this.server.registerTool(name,{
            description,inputSchema:z.object(shape),
            ...(annotations?{annotations}:{})
        },async args=>{
            const result=await handler(args as z.output<z.ZodObject<S>>);
            return {resultType:'complete' as const,ttlMs:0,
                cacheScope:'private' as const,...result};
        });
    }

    registerResource(
        name:string,resource:string|ResourceTemplate,
        details:{description?:string;mimeType?:string},
        handler:(uri:URL,variables:Record<string,string>)=>Promise<ReadResourceResult>
    ):void{
        const deliver=async(uri:URL,variables:Record<string,string>)=>{
            const result=await handler(uri,variables);
            return {...result,ttlMs:0,cacheScope:'private' as const};
        };
        if(typeof resource==='string'){
            this.server.registerResource(name,resource,details,
                async uri=>deliver(uri,{}));
        }else{
            this.server.registerResource(name,resource,details,
                async(uri,variables)=>deliver(uri,variables as Record<string,string>));
        }
    }
}