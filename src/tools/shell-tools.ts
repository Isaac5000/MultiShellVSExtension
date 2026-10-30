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
export function registerShellTools(server: McpServer, shells: ShellApi): void {
    server.tool('create_shell_code',
        'Create a dedicated terminal with a UNIQUE user-assigned shell_id. Separate Git worktrees are recommended if two chats edit the same repository.',
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
        'Close the explicitly selected shell ID or alias, interrupting its running command.',
        { shell_id: z.string().describe('Exact identifier to close') },
        async ({ shell_id }): Promise<CallToolResult> => {
            try { await shells.close(shell_id); return message({ closed: shell_id }); }
            catch (error) { return errorOf(error); }
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
                return message(await shells.execute(shell_id, command, timeout));
            }
            catch (error) { return errorOf(error); }
        });
}