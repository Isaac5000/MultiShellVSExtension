/**
 * Compatibility adapter for a ChatGPT VSCode connector that cached the original
 * tool schemas and does not advertise shell_id / list_windows_code.
 *
 * This bridge NEVER chooses a default shell:
 *  execute_shell_command_code({command, cwd:'@shell:my_shell'})
 *  read_file_code({path:'@shell:my_shell/src/index.ts'})
 *  execute_shell_command_code({command:'shells',cwd:'@mcp'}) for discovery.
 *
 * No command executes for a missing or malformed selector.
 */
type Dict = Record<string, unknown>;
export type Adaptation =
    | { kind: 'pass' }
    | { kind: 'rewrite'; request: Dict }
    | { kind: 'control'; command: 'windows' | 'shells' | 'help'; requestId: unknown }
    | { kind: 'error'; message: string; requestId: unknown };

const ID = '[A-Za-z0-9][A-Za-z0-9_-]{0,39}';
const SHELL_SELECTOR = new RegExp('^@shell:(' + ID + ')$');
const FILE_SELECTOR = new RegExp('^@shell:(' + ID + ')(?:/(.*))?$', 's');
const PATH_FIELDS: Readonly<Record<string, string[]>> = {
    list_files_code: ['path'],
    read_file_code: ['path'],
    create_file_code: ['path'],
    replace_lines_code: ['path'],
    copy_file_code: ['sourcePath', 'targetPath'],
    move_file_code: ['sourcePath', 'targetPath'],
    rename_file_code: ['filePath'],
    get_document_symbols_code: ['path'],
    get_symbol_definition_code: ['path']
};
function obj(value: unknown): value is Dict {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function failure(message: string, id: unknown): Adaptation {
    return { kind: 'error', message, requestId: id };
}
export function adaptLegacyToolCall(request: unknown): Adaptation {
    if (!obj(request) || request.method !== 'tools/call' || !obj(request.params)) {
        return { kind: 'pass' };
    }
    const params = request.params;
    const name = params.name;
    if (typeof name !== 'string' || !obj(params.arguments)) {return { kind: 'pass' };}
    const args = { ...params.arguments };
    if (typeof args.shell_id === 'string' && args.shell_id.length > 0) {
        return { kind: 'pass' };
    }

    if (name === 'execute_shell_command_code') {
        if (args.cwd === '@mcp') {
            if (args.command === 'windows' || args.command === 'shells' || args.command === 'help') {
                return { kind:'control', command:args.command, requestId:request.id };
            }
            return failure('Use cwd="@mcp" with command="windows", "shells" or "help".', request.id);
        }
        const match = typeof args.cwd === 'string' ? SHELL_SELECTOR.exec(args.cwd) : null;
        if (!match) {
            return failure('No shell selected. Set cwd="@shell:<shell_id>" or use cwd="@mcp" for discovery. No default shell.', request.id);
        }
        delete args.cwd;
        args.shell_id = match[1];
        return { kind:'rewrite', request:{...request, params:{...params, arguments:args}} };
    }
    if(name==='search_symbols_code' && typeof args.query==='string'){
        const value=args.query.match(/^@shell:([A-Za-z0-9][A-Za-z0-9_-]{0,39})\s+([\s\S]+)$/);
        if(!value){return failure('Explicit shell required. Use query="@shell:<alias> name".',request.id);}
        args.shell_id=value[1];args.query=value[2];
        return {kind:'rewrite',request:{...request,params:{...params,arguments:args}}};
    }
    if(name==='get_diagnostics_code' && typeof args.path==='string'){
        const value=FILE_SELECTOR.exec(args.path);
        if(!value){return failure('Explicit shell required in diagnostic path.',request.id);}
        args.shell_id=value[1];args.path=value[2]||undefined;
        return {kind:'rewrite',request:{...request,params:{...params,arguments:args}}};
    }
    const fields = PATH_FIELDS[name];
    if (fields) {
        let chosenId:string|undefined;
        for(const field of fields) {
            const value = args[field];
            const match = typeof value === 'string' ? FILE_SELECTOR.exec(value) : null;
            if (!match) {
                return failure('Explicit shell required. Use '+field+'="@shell:<shell_id>/relative/path".',request.id);
            }
            if (chosenId && chosenId !== match[1]) {
                return failure('All paths must belong to the same shell.',request.id);
            }
            chosenId=match[1];
            args[field]=match[2]||'.';
        }
        args.shell_id=chosenId;
        return {kind:'rewrite',request:{...request,params:{...params,arguments:args}}};
    }
    return {kind:'pass'};
}