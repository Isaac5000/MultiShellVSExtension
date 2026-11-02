import {McpServer} from '@modelcontextprotocol/server';
import type {ShellApi} from '../shell-api';
import type {ToolConfiguration} from '../server';
import {ToolRegistry} from './tool-registry';
import {registerScopedFileTools} from './scoped-file-tools';
import {registerShellTools} from './shell-tools';
import {registerNativeTools} from './native-mcp-tools';
import {registerSkillTools} from './agent-skills';
import {registerSkillsExtension} from './skills-extension';

/** One SDK v2 server factory for the 2025 and 2026 protocol eras.
 * Session-independent state remains in ShellApi and WindowRouter. */
export function createMcpServer(shells:ShellApi,config:ToolConfiguration,
    signal?:AbortSignal):McpServer{
    const server=new McpServer({name:'multi-shell-mcp-server',
        version:(require('../../package.json') as {version:string}).version});
    const tools=new ToolRegistry(server);
    if(config.file||config.edit){
        registerScopedFileTools(tools,shells,config);
        if(config.file){registerSkillTools(tools,shells,{includeGlobal:config.globalSkills===true});}
    }
    if(config.shell){registerShellTools(tools,shells,signal);}
    registerNativeTools(tools,shells);
    if(config.file){registerSkillsExtension(server,shells,{includeGlobal:config.globalSkills===true});}
    return server;
}
