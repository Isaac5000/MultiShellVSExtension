import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { MultiWindowController, UserShellRequest } from './multi-window';

interface Snapshot {
    running: boolean;
    role?: 'hub' | 'worker';
    windowId?: string;
    workspace?: string;
    primary?: string;
    port?: number;
    activePort?: number;
    windowAutoExit?: boolean;
    requests?: UserShellRequest[];
    shells?: Array<{ shell_id: string; alias?: string; initial_cwd: string; origin?: 'user'|'mcp'|'automatic'; timed_out_running?: boolean; recovery_required?: boolean; busy: boolean; queued: number; auto_exit_interactive?:boolean; auto_exit_override?:boolean }>;
    windows?: Array<{ window_id: string; workspace: string; online: boolean }>;
}
interface UIMessage {
    type: 'refresh' | 'toggle' | 'create' | 'show' | 'close' | 'confirm_restore' | 'copy' | 'alias' | 'port' | 'window_interactive' | 'shell_interactive' | 'request_decision';
    id?: unknown;
    cwd?: unknown;
    share?: unknown;
    value?: unknown;
}
function safeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** Native-theme-aware, compact multi-window terminal sidebar. */
export class MultiShellPanel implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'multi-shell-mcp.sessions';
    private view?: vscode.WebviewView;
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;
    private lastSnapshot?: string;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly getController: () => MultiWindowController | undefined,
        private readonly persistUserShell?: (shell:NonNullable<Snapshot['shells']>[number])=>Promise<void>,
        private readonly deleteUserShell?: (id:string)=>Promise<void>
    ) {
    }
    private locale(): 'es' | 'en' {
        return vscode.env.language.toLowerCase().startsWith('es') ? 'es' : 'en';
    }
    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        this.lastSnapshot = undefined;
        const assets = vscode.Uri.joinPath(this.context.extensionUri, 'media');
        const js = view.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'panel.js'));
        const css = view.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'panel.css'));
        const nonce = randomBytes(16).toString('base64');
        view.webview.options = { enableScripts: true, localResourceRoots: [assets] };
        // Only bundled code; no inline scripts or external network assets.
        // Dynamic text from workspaces and shell IDs is inserted with textContent.
        view.webview.html = [
            '<!DOCTYPE html><html><head><meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<meta http-equiv="Content-Security-Policy" content="default-src ',
            "'none'; img-src ", view.webview.cspSource,
            '; style-src ', view.webview.cspSource,
            "; script-src 'nonce-", nonce, "' ", view.webview.cspSource, ';">',
            '<link href="', css.toString(), '" rel="stylesheet"></head><body>',
            '<div class="app" id="app">',
                '<header class="masthead">',
                    '<div class="masthead-title">',
                        '<span class="brand-icon" aria-hidden="true">&gt;_</span>',
                        '<div><h1>MultiShell MCP Server</h1><p class="subline" data-i18n="subtitle"></p></div>',
                    '</div>',
                    '<button class="icon-button refresh-button" id="refresh" type="button" data-icon="refresh" data-aria-i18n="refresh"></button>',
                '</header>',
                '<div class="connection" id="connection">',
                    '<span class="status-indicator" aria-hidden="true"></span>',
                    '<div class="connection-text">',
                        '<strong id="role"></strong>',
                        '<span id="connectionDetail" class="subline"></span>',
                    '</div>',
                    '<button type="button" id="toggle" class="connection-action"></button>',
                '</div>',
                '<form class="port-settings" id="portForm">',
                    '<label for="portInput" data-i18n="portLabel"></label>',
                    '<div class="port-controls">',
                        '<input id="portInput" type="number" inputmode="numeric" min="1024" max="65535" step="1" required>',
                        '<button id="savePort" type="submit" data-i18n="savePort"></button>',
                    '</div>',
                    '<p class="port-help" data-i18n="portHelp"></p>',
                '</form>',
                '<div class="interactive-settings">',
                    '<label class="checkline" for="windowInteractive">',
                        '<input type="checkbox" id="windowInteractive">',
                        '<span data-i18n="windowInteractive"></span>',
                    '</label>',
                    '<p class="field-help" data-i18n="windowInteractiveHelp"></p>',
                '</div>',
                '<div class="local-window" id="localWindow">',
                    '<div class="eyebrow" data-i18n="currentWindow"></div>',
                    '<div class="window-inline">',
                        '<span class="workspace-glyph" data-icon="folder" aria-hidden="true"></span>',
                        '<div class="workspace-text"><strong id="workspaceName"></strong><span id="workspace" class="subline path"></span></div>',
                        '<button id="copyWindow" type="button" class="icon-button" data-icon="copy" data-aria-i18n="copyWindow"></button>',
                    '</div>',
                    '<div class="window-token" id="windowToken"><span data-i18n="windowIdShort"></span><code id="windowId"></code></div>',
                '</div>',
                '<nav class="tabs" aria-label="MultiShell MCP">',
                    '<button type="button" role="tab" id="tabShells" aria-selected="true" aria-controls="shellsPage">',
                        '<span data-i18n="shells"></span><span id="shellCount" class="count"></span>',
                    '</button>',
                    '<button type="button" role="tab" id="tabWindows" aria-selected="false" aria-controls="windowsPage">',
                        '<span data-i18n="connectedWindows"></span><span id="windowCount" class="count"></span>',
                    '</button>',
                    '<button type="button" role="tab" id="tabRequests" aria-selected="false" aria-controls="requestsPage">',
                        '<span data-i18n="requests"></span><span id="requestsCount" class="count"></span>',
                    '</button>',
                '</nav>',
                '<main>',
                    '<section role="tabpanel" id="shellsPage" aria-labelledby="tabShells">',
                        '<div class="toolbar">',
                            '<div class="toolbar-title"><h2 data-i18n="shellsLabel"></h2><span id="shellMeta" class="subline"></span></div>',
                            '<button id="newShell" type="button" class="add-button" aria-expanded="false" aria-controls="createPanel">',
                                '<span data-icon="plus" aria-hidden="true"></span><span data-i18n="new"></span>',
                            '</button>',
                        '</div>',
                        '<div class="create-panel" id="createPanel" hidden>',
                            '<div class="form-title"><strong data-i18n="createTitle"></strong>',
                            '<button type="button" id="cancelCreate" class="icon-button" data-icon="x" data-aria-i18n="cancel"></button></div>',
                            '<form id="shellForm">',
                                '<label for="shellId" data-i18n="identifier"></label>',
                                '<input id="shellId" autocomplete="off" required minlength="2" maxlength="40" ',
                                    'pattern="[A-Za-z][A-Za-z0-9_-]+" placeholder="fallout">',
                                '<label for="cwd" data-i18n="directory"></label>',
                                '<input id="cwd" autocomplete="off" type="text" data-placeholder-i18n="directoryPlaceholder">',
                                '<p class="field-help" data-i18n="directoryHelp"></p>',
                                '<label class="checkline" for="share"><input type="checkbox" id="share">',
                                    '<span data-i18n="allowShare"></span></label>',
                                '<div class="form-actions"><button type="button" id="formCancel" class="quiet" data-i18n="cancel"></button>',
                                    '<button type="submit" id="create" data-i18n="create"></button></div>',
                            '</form>',
                        '</div>',
                        '<div class="search-row" id="searchRow" hidden><span data-icon="search" aria-hidden="true"></span>',
                            '<input type="search" id="searchShells" data-placeholder-i18n="search" aria-label="Filter shells"></div>',
                        '<div id="shells" class="shell-list" role="list"></div>',
                        '<div id="shellEmpty" class="empty-state" hidden><div class="empty-icon" data-icon="terminal"></div>',
                            '<strong id="shellEmptyTitle"></strong><span id="shellEmptyHint"></span></div>',
                    '</section>',
                    '<section role="tabpanel" id="windowsPage" aria-labelledby="tabWindows" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="connectedWindows"></h2>',
                            '<span data-i18n="windowsHelp" class="subline"></span></div></div>',
                        '<div id="windows" class="windows-list" role="list"></div>',
                        '<div id="windowEmpty" class="empty-state" hidden><div class="empty-icon" data-icon="monitor"></div>',
                            '<strong data-i18n="noWindows"></strong></div>',
                    '</section>',
                    '<section role="tabpanel" id="requestsPage" aria-labelledby="tabRequests" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="pendingRequests"></h2>',
                            '<span class="subline" data-i18n="requestsHelp"></span></div></div>',
                        '<div id="requestsList" class="request-list" role="list"></div>',
                        '<div id="requestsEmpty" class="empty-state" hidden>',
                            '<strong data-i18n="noRequests"></strong></div>',
                    '</section>',
                '</main>',
                '<footer class="footer">',
                    '<details class="help"><summary><span data-icon="info" aria-hidden="true"></span>',
                        '<span data-i18n="usageTitle"></span><span class="arrow" data-icon="chevron"></span></summary>',
                        '<p data-i18n="isolation"></p></details>',
                '</footer>',
            '</div>',
            '<div id="notice" role="status" aria-live="polite" hidden></div>',
            '<script nonce="', nonce, '" src="', js.toString(), '"></script>',
            '</body></html>'
        ].join('');
        view.webview.onDidReceiveMessage((raw: UIMessage) => { void this.message(raw); },
            undefined, this.context.subscriptions);
        view.onDidDispose(() => {
            this.view = undefined;
            this.lastSnapshot = undefined;
            if (this.timer) {clearInterval(this.timer);}
            this.timer = undefined;
        }, undefined, this.context.subscriptions);
        if (this.timer) {clearInterval(this.timer);}
        this.timer = setInterval(() => { void this.refresh(false); }, 3000);
        void this.refresh();
    }
    private async rememberUserShells(shells:Readonly<NonNullable<Snapshot['shells']>>):Promise<void> {
        if(this.persistUserShell){
            for(const shell of shells){
                if(shell.origin==='user'){await this.persistUserShell(shell);}
            }
            return;
        }
        const key='multiShellUserSessions';
        const previous=this.context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>(key,[]);
        const updated=new Map(previous.map(x=>[x.shell_id,x]));
        for(const shell of shells){
            if(shell.origin==='user'){
                updated.set(shell.shell_id,{shell_id:shell.shell_id,initial_cwd:shell.initial_cwd,alias:shell.alias});
            }
        }
        const next=[...updated.values()];
        if(JSON.stringify(previous)!==JSON.stringify(next)){
            await this.context.workspaceState.update(key,next);
        }
    }
    private async forgetUserShell(id:string):Promise<void> {
        if(this.deleteUserShell){await this.deleteUserShell(id);return;}
        const key='multiShellUserSessions';
        const previous=this.context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>(key,[]);
        const next=previous.filter(x=>x.shell_id!==id);
        if(previous.length!==next.length){await this.context.workspaceState.update(key,next);}
    }
    async refresh(force = true): Promise<void> {
        if (!this.view || this.busy) {return;}
        this.busy = true;
        try {
            const manager = this.getController();
            let snapshot: Snapshot = { running: false };
            if (manager) {
                snapshot = { running: true, ...(await manager.panelState()) };
                await this.rememberUserShells(snapshot.shells||[]);
            }
            snapshot.port = vscode.workspace.getConfiguration('multi-shell-mcp').get<number>('port') ?? 3000;
            snapshot.activePort=manager?.listeningPort;
            const state={type:'state',snapshot,language:this.locale()};
            const serialized=JSON.stringify(state);
            if(force || this.lastSnapshot!==serialized){
                const received=await this.view.webview.postMessage(state);
                if(received!==false){this.lastSnapshot=serialized;}
            }
        } catch (e) {
            await this.view?.webview.postMessage({ type: 'error', text: safeError(e) });
        } finally {
            this.busy = false;
        }
    }
    private async message(raw: UIMessage): Promise<void> {
        if (!raw || typeof raw.type !== 'string') {return;}
        try {
            if (raw.type === 'refresh') { await this.refresh(); return; }
            if (raw.type === 'port') {
                const port=Number(raw.value);
                if(!Number.isInteger(port)||port<1024||port>65535){
                    throw new Error(this.locale()==='es'?'Puerto válido: entre 1024 y 65535.':'Valid port: 1024–65535.');
                }
                const cfg=vscode.workspace.getConfiguration('multi-shell-mcp');
                if(cfg.get<number>('port')!==port){
                    await cfg.update('port',port,vscode.ConfigurationTarget.Global);
                    if(cfg.get<number>('port')!==port){
                        throw new Error(this.locale()==='es'
                            ? 'Un ajuste del proyecto tiene prioridad sobre el puerto global.'
                            : 'A workspace-level setting overrides the global port.');
                    }
                }
                await this.view?.webview.postMessage({type:'notice',key:'portSaved'});
                await this.refresh();
                return;
            }
            if(raw.type==='window_interactive'){
                if(typeof raw.value!=='boolean'){return;}
                const live=this.getController();
                if(!live){throw new Error('MultiShell MCP is not running.');}
                live.panelSetWindowAutoExit(raw.value);
                await this.context.workspaceState.update('multiShellWindowAutoExit',raw.value);
                await this.refresh();return;
            }
            if (raw.type === 'toggle') {
                await vscode.commands.executeCommand('multi-shell-mcp.toggleServer');
                await this.refresh(); return;
            }
            if (raw.type === 'copy') {
                if (typeof raw.value !== 'string' || raw.value.length > 5000) {return;}
                await vscode.env.clipboard.writeText(raw.value);
                await this.view?.webview.postMessage({ type: 'notice', key: 'copied' });
                return;
            }
            const manager = this.getController();
            if (!manager) {throw new Error('MultiShell MCP is not running in this window.');}
            if(raw.type==='request_decision'){
                if(typeof raw.id!=='string'||typeof raw.value!=='boolean'){return;}
                if(!manager.panelDecideUserRequest(raw.id,raw.value)){
                    throw new Error(this.locale()==='es'?'La solicitud ha caducado.':'Request expired.');
                }
                await this.refresh();return;
            }
            if(raw.type==='shell_interactive'){
                if(typeof raw.id!=='string'||!(typeof raw.value==='boolean'||raw.value===null)){return;}
                manager.panelSetShellAutoExit(raw.id,raw.value===null?undefined:raw.value);
                await this.context.workspaceState.update(
                    'multiShellInteractiveShellOverrides',manager.panelGetShellOverrides());
                await this.refresh();return;
            }
            if (raw.type === 'alias') {
                if(typeof raw.id!=='string'){throw new Error('Invalid shell ID');}
                const shell=(await manager.panelState()).shells.find(s=>s.shell_id===raw.id);
                if(!shell){throw new Error('Shell does not belong to this window.');}
                const alias=await vscode.window.showInputBox({
                    title:this.locale()==='es'?'Alias de terminal':'Terminal alias',
                    prompt:this.locale()==='es'?'Nombre corto: shell=1, shell=minecraft...':'Short selector: shell=1, shell=minecraft...',
                    value:shell.alias||'',
                    validateInput: v=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(v)
                        ? undefined : (this.locale()==='es'?'Usa 1-40 letras, números, - o _.':'Use 1-40 letters, numbers, - or _.')
                });
                if(alias===undefined){return;}
                const updated=await manager.panelSetAlias(raw.id,alias);
                if(raw.id===manager.primaryShellId){
                    await this.context.workspaceState.update('multiShellPrimaryAlias',updated.alias);
                }else if(shell.origin==='user'){
                    if(this.persistUserShell){await this.persistUserShell({...shell,alias:updated.alias});}
                    else{
                        const key='multiShellUserSessions';
                        const stored=this.context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>(key,[]);
                        await this.context.workspaceState.update(key,stored.map(item=>item.shell_id===raw.id?{...item,alias:updated.alias}:item));
                    }
                }
                await this.view?.webview.postMessage({type:'notice',key:'aliasSaved'});
            } else if (raw.type === 'create') {
                if (typeof raw.id !== 'string') {throw new Error('Invalid shell ID');}
                const cwd = typeof raw.cwd === 'string' ? raw.cwd.trim() : undefined;
                const created=await manager.panelCreateShell(raw.id.trim(), cwd || undefined, raw.share === true);
                await this.rememberUserShells([created]);
                await this.view?.webview.postMessage({ type: 'notice', key: 'created' });
            } else if(raw.type === 'confirm_restore') {
                if(typeof raw.id!=='string'){throw new Error('Invalid shell ID');}
                const answer=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                    ? 'Confirma que el comando anterior ha terminado. Si sigue ejecutándose, espera o interrúmpelo en la terminal antes de reactivar MCP.'
                    : 'Confirm the previous command has finished. If it is still running, wait or interrupt it in the terminal before re-enabling MCP.',
                    {modal:true},this.locale()==='es'?'Confirmar disponible':'Confirm idle');
                if(!answer){return;}
                await manager.panelConfirmRestoredShell(raw.id);
                await this.view?.webview.postMessage({type:'notice',key:'restoredReady'});
            } else if (raw.type === 'show' || raw.type === 'close') {
                if (typeof raw.id !== 'string') {throw new Error('Invalid shell ID');}
                if (raw.type === 'show') {manager.panelShowShell(raw.id);}
                else {
                    const shell=(await manager.panelState()).shells.find(item=>item.shell_id===raw.id);
                    if(!shell || raw.id===manager.primaryShellId){
                        throw new Error('This terminal cannot be closed from the panel.');
                    }
                    if(shell.origin!=='user'){
                        const choice=this.locale()==='es'?'Cerrar terminal':'Close terminal';
                        const confirmed=await vscode.window.showWarningMessage(
                            this.locale()==='es'
                                ? '¿Cerrar la terminal '+shell.shell_id+'? Se interrumpirán los comandos que siga ejecutando.'
                                : 'Close terminal '+shell.shell_id+'? Any running commands will be interrupted.',
                            {modal:true},choice);
                        if(confirmed!==choice){
                            await this.view?.webview.postMessage({type:'closeCancelled',id:raw.id});
                            return;
                        }
                    }
                    try{
                        // Persistent user shells are confirmed in the owning worker.
                        // Do not show a second prompt from the sidebar.
                        await manager.panelCloseShell(raw.id);
                    }catch(error){
                        if(shell.origin==='user' && /not approved/i.test(safeError(error))){
                            await this.view?.webview.postMessage({type:'closeCancelled',id:raw.id});
                            return;
                        }
                        throw error;
                    }
                    await this.forgetUserShell(raw.id);
                    await this.view?.webview.postMessage({ type: 'notice', key: 'closed' });
                }
            }
            await this.refresh();
        } catch (e) {
            await this.view?.webview.postMessage({ type: 'error', text: safeError(e) });
        }
    }
    dispose(): void {
        this.lastSnapshot=undefined;
        if (this.timer) {clearInterval(this.timer);}
        this.timer = undefined;
        this.view = undefined;
    }
}