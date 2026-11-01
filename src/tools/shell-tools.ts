import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ShellApi } from '../shell-api';

function message(data: unknown, failed = false): CallToolResult {
    return { isError: failed, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function errorOf(e: unknown): CallToolResult {
    return message({ error: e instanceof Error ? e.message : String(e) }, true);
}

/** Every operation is explicitly named: no default terminal or inferred ChatGPT conversation. */
export function registerShellTools(server: McpServer, shells: ShellApi, requestSignal?: AbortSignal): void {
    server.tool('create_shell_code',
        'Create a TEMPORARY MCP-owned terminal for parallel work, NOT a persistent user terminal. A unique shell_id is required. Use a separate Git worktree for concurrent edits.',
        {
            shell_id: z.string().describe('REQUIRED shell ID, explicitly chosen by the user.'),
            cwd: z.string().optional().describe('Absolute or relative to the selected VSCode window workspace; empty defaults to that workspace.'),
            window_id: z.string().optional().describe('Required when several VSCode windows are connected. Get it from list_windows_code.'),
            allow_shared_directory: z.boolean().optional().default(false).describe('Explicitly allow another shell in the same directory. Dangerous for concurrent builds and Git commands; default false.')
        },
        async ({ shell_id, cwd, window_id, allow_shared_directory }): Promise<CallToolResult> => {
            try { return message({ created: await shells.create(shell_id, cwd, allow_shared_directory, window_id) }); }
            catch (error) { return errorOf(error); }
        });

    server.tool('create_user_shell_code',
        'ONLY call when the human explicitly asks for a persistent USER terminal. Request a new USER terminal for parallel work: creation is forbidden until the human approves the VSCode modal in the owning window. This tool cannot approve itself. If denied or cancelled, no terminal is created. Use create_shell_code for temporary MCP terminals.',
        {
            shell_id:z.string().describe('Unique requested persistent terminal ID. Show the user this exact ID.'),
            cwd:z.string().optional().describe('Working directory in the selected VSCode window; choose a separate Git worktree for parallel edits.'),
            window_id:z.string().optional().describe('Required if several VSCode windows are connected; select using list_windows_code.'),
            allow_shared_directory:z.boolean().optional().default(false).describe('Default false. If true, the user must approve the same-directory concurrency risk in VSCode.')
        },
        async ({shell_id,cwd,window_id,allow_shared_directory}):Promise<CallToolResult>=>{
            try{
                if(!shells.createUserWithApproval){
                    throw new Error('Explicit user-terminal approval is not supported by this connection.');
                }
                return message({created:await shells.createUserWithApproval(shell_id,cwd,allow_shared_directory,window_id,requestSignal)});
            }catch(error){return errorOf(error);}
        });

    server.tool('list_windows_code',
        'List registered VSCode windows and their unique window_id values. Use window_id when creating a shell if several windows are open.',
        {},
        async (): Promise<CallToolResult> => message({ windows: shells.windows?.() || [] }));
    server.tool('list_shells_code',
        'List shell IDs, their SHORT aliases and working directories. Use the alias as shell_id, e.g. 1 or minecraft.',
        {},
        async (): Promise<CallToolResult> => message({ shells: await shells.list() }));

    server.tool('set_shell_alias_code',
        'Give a shell a unique short alias such as 1 or minecraft. Aliases are global to the connected windows.',
        {shell_id:z.string().describe('Existing shell ID or alias'),alias:z.string().describe('Short name, 1-40 letters/digits/-/_')},
        async ({shell_id,alias}):Promise<CallToolResult>=>{
            try{
                if(!shells.setAlias){throw new Error('Alias changes unavailable.');}
                return message(await shells.setAlias(shell_id,alias));
            }catch(error){return errorOf(error);}
        });

    server.tool('close_shell_code',
        'Close an explicitly selected shell. Closing a persistent USER terminal additionally requires local VSCode confirmation; temporary MCP terminals close normally. Running commands will be interrupted.',
        { shell_id: z.string().describe('Exact identifier to close') },
        async ({ shell_id }): Promise<CallToolResult> => {
            try { await shells.close(shell_id); return message({ closed: shell_id }); }
            catch (error) { return errorOf(error); }
        });

    server.tool('execute_isolated_command_code',
        'Run a non-interactive command in a disposable OS process using the selected shell workspace directory. Does NOT touch the integrated terminal or its running process; shell variables and aliases are NOT inherited. Suitable for builds, git checks and automated tests. Never use for interactive prompts. Timeout or cancellation terminates the isolated process tree.',
        {
            shell_id:z.string().describe('Required existing shell ID or alias; determines the owner window and working directory.'),
            command:z.string().describe('Non-interactive command. PowerShell on Windows, /bin/sh on Linux.'),
            timeout:z.number().int().min(1000).max(3600000).optional().default(120000)
        },
        async ({shell_id,command,timeout}):Promise<CallToolResult>=>{
            try{
                if(!shells.executeIsolated){throw new Error('Isolated execution is not available on this connection.');}
                return message(await shells.executeIsolated(shell_id,command,timeout,requestSignal));
            }catch(error){return errorOf(error);}
        });

    server.tool('execute_shell_command_code',
        'Run a command in the explicitly chosen shell_id OR short alias (e.g. shell_id=1 or minecraft). Parallel across shells, FIFO within each. Never choose a default.',
        {
            shell_id: z.string().optional().describe('REQUIRED shell ID or short alias, e.g. 1, minecraft. Every request must identify its shell.'),
            command: z.string().describe('Command using the system-integrated terminal (PowerShell on Windows, bash/zsh on Linux).'),
            timeout: z.number().int().min(1000).max(3600000).optional().default(120000).describe('Timeout in milliseconds.')
        },
        async ({ shell_id, command, timeout }): Promise<CallToolResult> => {
            try {
                if (!shell_id) {throw new Error('Missing shell_id. Reconnect/refresh the VSCode connector in ChatGPT so it sees the updated tool schema.');}
                return message(await shells.execute(shell_id, command, timeout, requestSignal));
            }
            catch (error) { return errorOf(error); }
        });
}