import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type {TunnelManager,TunnelStatus} from './tunnel-manager';
import {addLocalConnection,listLocalConnections,removeLocalConnection,
    localConnectionInstructions,LocalAiConnection} from './ai-connections';
import {connectionConfigStatus,disconnectClient,ownsClientProfile,
    integrationLocation,ClientConfigState} from './ai-client-config';
import {clientCapabilitiesForUi,getAiClientCapability,AiClientCapability} from './ai-provider-catalog';
import {onboardingGuide,onboardingGuidesForUi,AiOnboardingGuide} from './ai-provider-onboarding';
import {readProviderStatuses,saveProviderField,clearProviderField,removeProviderSettings,
    AiProviderStoredStatus} from './ai-provider-settings';
import {AiGatewayManager,AiGatewayStatus} from './ai-gateway-manager';
import {validAiAccessLevel} from './ai-access';
import { MultiWindowController, UserShellRequest } from './multi-window';
import { listWorkspaceSkills, readWorkspaceSkill, SkillOptions } from './tools/agent-skills';

interface Snapshot {
    running: boolean;
    tunnel?:TunnelStatus;
    aiConnections?:LocalAiConnection[];
    aiLinkStates?:Record<string,ClientConfigState>;
    aiProviders?:AiClientCapability[];
    aiOnboarding?:AiOnboardingGuide[];
    aiProviderSaved?:Record<string,AiProviderStoredStatus>;
    aiGateways?:AiGatewayStatus[];
    tunnelTrusted?:boolean;
    role?: 'hub' | 'worker';
    windowId?: string;
    workspace?: string;
    primary?: string;
    port?: number;
    activePort?: number;
    windowAutoExit?: boolean;
    requests?: UserShellRequest[];
    skillsEnabled?: boolean;
    globalSkillsEnabled?: boolean;
    shells?: Array<{ shell_id: string; alias?: string; initial_cwd: string; origin?: 'user'|'mcp'|'automatic'; timed_out_running?: boolean; recovery_required?: boolean; recovery_reason?: string; external_busy?: boolean; execution_phase?: string; input_wait_hint?: string; output_silent_seconds?: number; busy: boolean; queued: number; auto_exit_interactive?:boolean; auto_exit_override?:boolean }>;
    windows?: Array<{ window_id: string; workspace: string; online: boolean }>;
}
interface UIMessage {
    type: string;
    id?: unknown;
    key?: unknown;
    profile?: unknown;
    provider?:unknown;
    field?:unknown;
    commandIndex?:unknown;
    linkIndex?:unknown;
    shellId?:unknown;
    level?:unknown;
    cwd?: unknown;
    share?: unknown;
    value?: unknown;
    query?: unknown;
    cursor?: unknown;
    scope?: unknown;
    requestId?: unknown;
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
    private tunnelCache?:{value:TunnelStatus;at:number};

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly getController: () => MultiWindowController | undefined,
        private readonly persistUserShell?: (shell:NonNullable<Snapshot['shells']>[number])=>Promise<void>,
        private readonly deleteUserShell?: (id:string)=>Promise<void>,
        private readonly getTunnelManager?:()=>TunnelManager|undefined,
        private readonly getAiGatewayManager?:()=>AiGatewayManager|undefined
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

                '<details class="navigation" id="navDisclosure" open>',
                    '<summary class="navigation-summary"><span data-icon="menu" aria-hidden="true"></span>',
                        '<span data-i18n="navTitle"></span><strong id="activeViewLabel"></strong><span data-icon="chevron" aria-hidden="true"></span></summary>',
                    '<nav class="nav-list" role="tablist" aria-label="MultiShell MCP">',
                        '<span class="nav-heading" data-i18n="navWorkspace"></span>',
                        '<button type="button" role="tab" id="tabOverview" aria-selected="true" aria-controls="overviewPage"><span data-icon="grid"></span><span data-i18n="overview"></span></button>',
                        '<button type="button" role="tab" id="tabShells" aria-selected="false" aria-controls="shellsPage"><span data-icon="terminal"></span><span data-i18n="shells"></span><span id="shellCount" class="count"></span></button>',
                        '<button type="button" role="tab" id="tabWindows" aria-selected="false" aria-controls="windowsPage"><span data-icon="monitor"></span><span data-i18n="connectedWindows"></span><span id="windowCount" class="count"></span></button>',
                        '<button type="button" role="tab" id="tabRequests" aria-selected="false" aria-controls="requestsPage"><span data-icon="inbox"></span><span data-i18n="requests"></span><span id="navRequestsCount" class="count"></span></button>',
                        '<button type="button" role="tab" id="tabSkills" aria-selected="false" aria-controls="skillsPage"><span data-icon="book"></span><span data-i18n="skills"></span><span id="skillCount" class="count"></span></button>',
                        '<span class="nav-heading" data-i18n="navAi"></span>',
                        '<button type="button" role="tab" id="tabConnections" aria-selected="false" aria-controls="connectionsPage"><span data-icon="network"></span><span data-i18n="aiConnections"></span><span id="connectionsCount" class="count"></span></button>',
                        '<button type="button" role="tab" id="tabTunnel" aria-selected="false" aria-controls="tunnelPage"><span data-icon="lock"></span><span data-i18n="tunnelTab"></span></button>',
                        '<span class="nav-heading" data-i18n="navAdministration"></span>',
                        '<button type="button" role="tab" id="tabSettings" aria-selected="false" aria-controls="settingsPage"><span data-icon="settings"></span><span data-i18n="settings"></span></button>',
                    '</nav>',
                '</details>',
                '<main>',

                    '<section role="tabpanel" id="overviewPage" aria-labelledby="tabOverview">',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="overviewTitle"></h2>',
                            '<span class="subline" data-i18n="overviewHelp"></span></div></div>',
                        '<div class="overview-stats">',
                            '<div class="overview-stat"><strong id="overviewShells">0</strong><span data-i18n="shells"></span></div>',
                            '<div class="overview-stat"><strong id="overviewWindows">0</strong><span data-i18n="connectedWindows"></span></div>',
                            '<div class="overview-stat"><strong id="overviewRequests">0</strong><span data-i18n="requests"></span></div>',
                        '</div>',
                        '<div class="section-heading" data-i18n="currentWindow"></div>',
                '<div class="local-window" id="localWindow">',
                    '<div class="eyebrow" data-i18n="currentWindow"></div>',
                    '<div class="window-inline">',
                        '<span class="workspace-glyph" data-icon="folder" aria-hidden="true"></span>',
                        '<div class="workspace-text"><strong id="workspaceName"></strong><span id="workspace" class="subline path"></span></div>',
                        '<button id="copyWindow" type="button" class="icon-button" data-icon="copy" data-aria-i18n="copyWindow"></button>',
                    '</div>',
                    '<div class="window-token" id="windowToken"><span data-i18n="windowIdShort"></span><code id="windowId"></code></div>',
                '</div>',

                        '<div class="overview-actions">',
                            '<button type="button" id="overviewTerminals" data-i18n="shells"></button>',
                            '<button type="button" id="overviewConnections" data-i18n="aiConnections"></button>',
                        '</div>',
                        '<p class="overview-note" data-i18n="overviewSecurity"></p>',
                    '</section>',

                    '<section role="tabpanel" id="requestsPage" aria-labelledby="tabRequests" hidden>',
                        '<div class="toolbar"><div class="toolbar-title">',
                            '<div class="requests-heading"><h2 data-i18n="pendingRequests"></h2>',
                                '<span id="requestsCount" class="count" aria-live="polite"></span></div>',
                            '<span data-i18n="requestsHelp" class="subline"></span></div></div>',
                        '<div id="requestsList" class="request-list" role="list"></div>',
                        '<div id="requestsEmpty" class="requests-empty" role="status">',
                            '<span data-icon="check-circle" aria-hidden="true"></span>',
                            '<span data-i18n="noRequests"></span>',
                        '</div>',
                    '</section>',
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
                    '<section role="tabpanel" id="skillsPage" aria-labelledby="tabSkills" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="windowSkills"></h2>',
                            '<span class="subline" data-i18n="skillsHelp"></span></div>',
                            '<button id="refreshSkills" type="button" class="icon-button" data-icon="refresh" data-aria-i18n="refreshSkills"></button></div>',
                        '<div class="search-row"><span data-icon="search" aria-hidden="true"></span>',
                            '<input type="search" id="searchSkills" maxlength="100" data-placeholder-i18n="searchSkills" data-aria-i18n="searchSkills"></div>',
                        '<div class="skills-scope"><label for="skillsScope" data-i18n="skillScope"></label>',
                            '<select id="skillsScope"><option value="all" data-i18n="allSkills"></option>',
                                '<option value="project" data-i18n="project"></option><option value="global" data-i18n="personalSkills"></option></select></div>',
                        '<p class="skills-help" id="skillsPermission"></p>',
                        '<button id="skillSettings" class="skill-settings" type="button" data-i18n="skillSettings"></button>',
                        '<p class="skills-help" id="skillsStatus" role="status" aria-live="polite"></p>',
                        '<div id="skillsList" class="skills-list" role="list" aria-busy="false"></div>',
                        '<button id="moreSkills" type="button" class="skill-more" data-i18n="moreSkills" hidden></button>',
                        '<p class="skills-help" id="skillsWarnings"></p>',
                    '</section>',
                    '<section role="tabpanel" id="tunnelPage" aria-labelledby="tabTunnel" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="tunnelHeading"></h2>',
                            '<span class="subline" data-i18n="tunnelHelp"></span></div>',
                            '<button type="button" id="tunnelRefresh" class="icon-button" data-icon="refresh" data-aria-i18n="refresh"></button></div>',
                        '<div class="tunnel-status" role="status" aria-live="polite">',
                            '<span id="tunnelIndicator" class="status-indicator" aria-hidden="true"></span>',
                            '<div><strong id="tunnelStatus"></strong><p id="tunnelDetails" class="field-help"></p></div>',
                        '</div>',
                        '<p id="tunnelWarning" class="field-help tunnel-warning"></p>',
                        '<div class="tunnel-actions">',
                            '<button type="button" id="tunnelInstall" data-i18n="tunnelInstall"></button>',
                            '<button type="button" id="tunnelReuse" data-i18n="tunnelReuse"></button>',
                        '</div>',
                        '<form id="tunnelForm" autocomplete="off">',
                            '<label for="tunnelId" data-i18n="tunnelId"></label>',
                            '<input type="text" id="tunnelId" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="60" required placeholder="tunnel_…">',
                            '<label for="tunnelProfile" data-i18n="tunnelProfile"></label>',
                            '<input type="text" id="tunnelProfile" spellcheck="false" autocomplete="off" maxlength="40" required value="vscode-local">',
                            '<label for="tunnelApiKey" data-i18n="tunnelKey"></label>',
                            '<input type="password" id="tunnelApiKey" autocomplete="new-password" maxlength="8192" required>',
                            '<p class="field-help" data-i18n="tunnelKeyHelp"></p>',
                            '<div class="tunnel-actions">',
                                '<button type="submit" id="tunnelConfigure" data-i18n="tunnelConfigure"></button>',
                                '<button type="button" id="tunnelUpdateKey" data-i18n="tunnelUpdateKey"></button>',
                            '</div>',
                        '</form>',
                        '<div class="tunnel-controls">',
                            '<div class="tunnel-actions">',
                                '<button type="button" id="tunnelStart" data-i18n="tunnelStart"></button>',
                                '<button type="button" id="tunnelStop" data-i18n="tunnelStop"></button>',
                            '</div>',
                            '<label class="checkline" for="tunnelAutostart">',
                                '<input type="checkbox" id="tunnelAutostart"><span data-i18n="tunnelAutostart"></span>',
                            '</label>',
                            '<p class="field-help" data-i18n="tunnelAutostartHelp"></p>',
                        '</div>',
                    '</section>',

                    '<section role="tabpanel" id="connectionsPage" aria-labelledby="tabConnections" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="aiConnections"></h2>',
                            '<span class="subline" data-i18n="connectionsHelp"></span></div>',
                            '<button type="button" class="add-button" id="newAiConnection" aria-expanded="false" aria-controls="aiFormPanel"><span data-icon="plus" aria-hidden="true"></span><span data-i18n="new"></span></button></div>',
                        '<div class="connection-overview" id="openAiEntry">',
                            '<span data-icon="lock" aria-hidden="true"></span>',
                            '<div><strong data-i18n="chatgpt"></strong><p id="openAiStatus" class="subline"></p></div>',
                            '<button type="button" id="openAiDetails" data-i18n="manage"></button>',
                        '</div>',
                        '<details class="ai-onboarding" id="chatgptGuide">',
                            '<summary class="ai-onboarding-summary"><span class="ai-help-mark" aria-hidden="true">?</span><span data-i18n="chatgptGuideTitle"></span></summary>',
                            '<div class="ai-onboarding-content">',
                                '<p data-i18n="chatgptGuideExplanation"></p>',
                                '<strong class="ai-onboarding-subtitle" data-i18n="chatgptGuidePlatformTitle"></strong>',
                                '<ol class="ai-onboarding-steps">',
                                    '<li data-i18n="chatgptGuidePlatformTunnel"></li>',
                                    '<li data-i18n="chatgptGuidePlatformKey"></li>',
                                '</ol>',
                                '<div class="ai-onboarding-links">',
                                    '<button type="button" id="chatgptOpenTunnels" data-i18n="chatgptOpenTunnels"></button>',
                                    '<button type="button" id="chatgptOpenRuntimeKeys" data-i18n="chatgptOpenRuntimeKeys"></button>',
                                '</div>',
                                '<strong class="ai-onboarding-subtitle" data-i18n="chatgptGuideLocalTitle"></strong>',
                                '<p data-i18n="chatgptGuideLocalSetup"></p>',
                                '<strong class="ai-onboarding-subtitle" data-i18n="chatgptGuidePluginTitle"></strong>',
                                '<ol class="ai-onboarding-steps">',
                                    '<li data-i18n="chatgptGuidePluginOpen"></li>',
                                    '<li data-i18n="chatgptGuidePluginFields"></li>',
                                    '<li data-i18n="chatgptGuidePluginAuth"></li>',
                                    '<li data-i18n="chatgptGuidePluginCreate"></li>',
                                '</ol>',
                                '<div class="ai-onboarding-links">',
                                    '<button type="button" id="chatgptOpenChat" data-i18n="chatgptOpenChat"></button>',
                                    '<button type="button" id="chatgptOpenMcpGuide" data-i18n="chatgptOpenMcpGuide"></button>',
                                '</div>',
                                '<p class="field-help" data-i18n="chatgptGuideWarning"></p>',
                            '</div>',
                        '</details>',
                        '<p class="connections-warning" data-i18n="connectionsSecurity"></p>',
                        '<div class="create-panel" id="aiFormPanel" hidden>',
                            '<div class="form-title"><strong data-i18n="newAiTitle"></strong>',
                                '<button type="button" id="cancelAiForm" class="icon-button" data-icon="x" data-aria-i18n="cancel"></button></div>',
                            '<form id="aiForm" autocomplete="off">',
                                '<label for="aiProvider" data-i18n="aiProvider"></label>',
                                '<select id="aiProvider" required>',
                                    '<optgroup id="aiLocalGroup" label="Local">',
                                    '<option value="vscode" data-i18n="providerVscode"></option>',
                                    '<option value="claude-code" data-i18n="providerClaude"></option>',
                                    '<option value="gemini-cli" data-i18n="providerGemini"></option>',
                                    '<option value="cursor" data-i18n="providerCursor"></option>',
                                    '<option value="other" data-i18n="providerOther"></option>',
                                    '</optgroup>',
                                    '<optgroup id="aiRemoteGroup" label="Cloud / API">',
                                        '<option value="claude-web">Claude web / Cowork</option>',
                                        '<option value="grok-web">Grok web</option>',
                                        '<option value="gemini-api">Gemini Interactions API</option>',
                                        '<option value="mistral-work">Mistral Work / Studio</option>',
                                        '<option value="cursor-remote">Cursor remoto</option>',
                                    '</optgroup>',
                                '</select>',
                                '<label for="aiName" data-i18n="aiName"></label>',
                                '<input id="aiName" required maxlength="48" autocomplete="off" data-placeholder-i18n="aiNamePlaceholder">',
                                '<p id="aiFormHelp" class="field-help" data-i18n="aiFormHelp"></p>',
                                '<div class="form-actions"><button type="button" id="cancelAiForm2" class="quiet" data-i18n="cancel"></button>',
                                    '<button type="submit" id="saveAi" data-i18n="saveAi"></button></div>',
                            '</form>',
                        '</div>',
                        '<div class="section-heading" data-i18n="localClients"></div>',
                        '<div id="aiList" class="ai-list" role="list"></div>',
                        '<p id="aiEmpty" class="empty-state-message" data-i18n="aiEmpty"></p>',
                    '</section>',

                    '<section role="tabpanel" id="settingsPage" aria-labelledby="tabSettings" hidden>',
                        '<div class="toolbar"><div class="toolbar-title"><h2 data-i18n="settings"></h2>',
                            '<span class="subline" data-i18n="settingsHelp"></span></div></div>',
                        '<div class="section-heading" data-i18n="mcpConfiguration"></div>',
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

                        '<p class="settings-note" data-i18n="settingsSecurity"></p>',
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
    /** Local window only: never use the hub's shell catalog or process.cwd(). */
    private skillContext():{workspace?:string;enabled:boolean;options:SkillOptions} {
        const config=vscode.workspace.getConfiguration('multi-shell-mcp');
        return {
            workspace:this.getController()?.worker?.workspace || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            enabled:vscode.workspace.isTrusted!==false &&
                (config.get<Record<string,boolean>>('enabledTools')||{}).file!==false,
            options:{includeGlobal:config.get<boolean>('globalCodexSkills')??false}
        };
    }
    private async skillMessage(raw:UIMessage):Promise<void> {
        try {
            const local=this.skillContext();
            if(!local.enabled){throw new Error(this.locale()==='es'
                ? 'Confía en el proyecto y habilita la lectura de archivos para usar skills.'
                : 'Trust the workspace and enable file reading to use skills.');}
            if(!local.workspace){throw new Error(this.locale()==='es'
                ? 'Abre una carpeta de proyecto en esta ventana.' : 'Open a workspace folder in this window.');}
            if(raw.type==='skills'){
                if(typeof raw.requestId!=='number'||!Number.isSafeInteger(raw.requestId)||raw.requestId<0 ||
                    typeof raw.query!=='string'||raw.query.length>100 ||
                    !['all','project','global'].includes(String(raw.scope)) ||
                    (raw.cursor!==undefined && (typeof raw.cursor!=='string'||!/^\d{1,6}$/.test(raw.cursor)))){
                    throw new Error('Invalid skill search.');
                }
                const result=listWorkspaceSkills(local.workspace,{...local.options,
                    scope:raw.scope as 'all'|'project'|'global',query:raw.query,
                    cursor:raw.cursor as string|undefined,limit:40});
                await this.view?.webview.postMessage({type:'skills_result',requestId:raw.requestId,...result});
                return;
            }
            if(typeof raw.value!=='string'||raw.value.length>200){throw new Error('Invalid skill selection.');}
            // Revalidate path, metadata and current permission at click time.
            const {metadata}=readWorkspaceSkill(local.workspace,raw.value,local.options);
            const manager=this.getController();
            if(!manager){throw new Error(this.locale()==='es'
                ? 'Inicia MultiShell MCP en esta ventana antes de copiar la instrucción.'
                : 'Start MultiShell MCP in this window before copying the instruction.');}
            const snapshot=await manager.panelState();
            if(!snapshot.shells.some(shell=>shell.shell_id===manager.primaryShellId)){
                throw new Error('The current window has no available primary shell.');
            }
            const current=this.skillContext();
            if(this.getController()!==manager || current.workspace!==local.workspace || !current.enabled ||
                (metadata.scope==='global'&&!current.options.includeGlobal)){
                throw new Error('The window or skill permissions changed. Refresh the skill list.');
            }
            const args=JSON.stringify({shell_id:manager.primaryShellId,skill:metadata.skill_path,scope:metadata.scope});
            const text=this.locale()==='es'
                ? `Usa la skill ${metadata.name} de esta ventana de MultiShell. Llama a load_skill_code con ${args}. Lee sus instrucciones y los archivos de referencia necesarios antes de aplicarla a mi petición. La lectura de la skill no autoriza ejecutar sus scripts.`
                : `Use the ${metadata.name} skill from this MultiShell window. Call load_skill_code with ${args}. Read its instructions and any needed reference files before applying it to my request. Reading the skill does not authorize running its scripts.`;
            await vscode.env.clipboard.writeText(text);
            await this.view?.webview.postMessage({type:'notice',key:'skillCopied'});
        }catch(error){
            if(raw.type==='skills'){
                await this.view?.webview.postMessage({type:'skills_result',requestId:raw.requestId,error:safeError(error)});
            }else{await this.view?.webview.postMessage({type:'error',text:safeError(error)});}
        }
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
            const local=this.skillContext();
            snapshot.workspace ||= local.workspace;
            snapshot.skillsEnabled=local.enabled;
            snapshot.globalSkillsEnabled=local.options.includeGlobal;
            snapshot.tunnelTrusted=vscode.workspace.isTrusted!==false;
            const profileStore=this.context.globalState||this.context.workspaceState;
            snapshot.aiConnections=listLocalConnections(profileStore);
            snapshot.aiProviders=clientCapabilitiesForUi();
            snapshot.aiOnboarding=onboardingGuidesForUi();
            snapshot.aiProviderSaved=await readProviderStatuses({
                globalState:profileStore,
                secrets:this.context.secrets
            });
            snapshot.aiGateways=this.getAiGatewayManager?.()?.statuses()||[];
            snapshot.aiLinkStates={};
            for(const profile of snapshot.aiConnections){
                try{
                    snapshot.aiLinkStates[profile.id]=await connectionConfigStatus(
                        profile,manager?.listeningPort||snapshot.port,profileStore,snapshot.workspace);
                }catch{
                    snapshot.aiLinkStates[profile.id]={
                        configured:false,managed:false,scope:'unsupported',detail:'Configuration unavailable'
                    };
                }
            }
            const tunnel=this.getTunnelManager?.();
            if(tunnel){
                try{
                    if(!this.tunnelCache||Date.now()-this.tunnelCache.at>10000){
                        this.tunnelCache={value:await tunnel.status(),at:Date.now()};
                    }
                    snapshot.tunnel=this.tunnelCache.value;
                }catch{
                    this.tunnelCache=undefined;
                }
            }
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
    /** Only local webview actions may invoke the manager. Secrets are never returned to the view. */
    private async tunnelMessage(raw:UIMessage):Promise<void>{
        if(vscode.workspace.isTrusted===false){throw new Error('Trust the workspace before managing tunnels.');}
        const tunnel=this.getTunnelManager?.();
        if(!tunnel){throw new Error('Tunnel manager is not available.');}
        let notice:string|undefined;
        switch(raw.type){
            case 'tunnel_refresh':
                break;
            case 'tunnel_install':
                await vscode.window.withProgress({
                    location:vscode.ProgressLocation.Notification,
                    title:'MultiShell: installing verified Tunnel Client'
                },async()=>{await tunnel.install();});
                notice='tunnelInstalled';break;
            case 'tunnel_configure':
                if(typeof raw.id!=='string'||typeof raw.profile!=='string'||
                    typeof raw.key!=='string'||raw.key.length>8192||!raw.key.trim()){
                    throw new Error('Tunnel ID, profile and API key are required.');}
                await tunnel.configure(raw.id,raw.key,raw.profile);
                notice='tunnelConfigured';break;
            case 'tunnel_reuse':
                await vscode.commands.executeCommand('multi-shell-mcp.tunnelReuseProfile');
                break;
            case 'tunnel_update_key':
                if(typeof raw.key!=='string'||!raw.key.trim()||raw.key.length>8192){
                    throw new Error('A new API key is required.');}
                await tunnel.updateApiKey(raw.key);
                notice='tunnelKeyUpdated';break;
            case 'tunnel_start': {
                const started=await tunnel.start();
                notice=started==='started'?'tunnelStarted':started==='occupied'
                    ?'tunnelExternal':'tunnelAlreadyRunning';
                break;
            }
            case 'tunnel_stop': {
                const label=this.locale()==='es'?'Desconectar':'Disconnect';
                const answer=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿Desconectar el túnel gestionado? Podría interrumpir esta conexión de ChatGPT.'
                        :'Disconnect the managed tunnel? This may interrupt your ChatGPT connection.',
                    {modal:true},label);
                if(answer!==label){break;}
                await tunnel.stop();
                notice='tunnelStopped';break;
            }
            case 'tunnel_autostart': {
                if(typeof raw.value!=='boolean'){throw new Error('Invalid autostart value.');}
                if(raw.value){
                    const label=this.locale()==='es'?'Activar':'Enable';
                    const answer=await vscode.window.showWarningMessage(
                        this.locale()==='es'
                            ?'¿Iniciar automáticamente el túnel al activarse esta ventana como coordinadora? Se utilizará la clave guardada.'
                            :'Automatically launch the tunnel when this window becomes the hub? The saved key will be used.',
                        {modal:true},label);
                    if(answer!==label){break;}
                }
                await tunnel.setAutostart(raw.value);
                if(raw.value){await tunnel.startIfEnabled();}
                notice=raw.value?'tunnelAutoOn':'tunnelAutoOff';break;
            }
            default:throw new Error('Unknown tunnel action.');
        }
        this.tunnelCache=undefined;
        await this.refresh(true);
        await this.view?.webview.postMessage({type:'tunnel_done',notice});
    }
    /** Per-provider setup guidance and securely saved credentials are not proof
     * of a live remote connection or an authorized external service. */
    private async aiMessage(raw:UIMessage):Promise<void>{
        if(vscode.workspace.isTrusted===false){
            throw new Error('A trusted workspace is required for local client setup.');
        }
        const storage=this.context.globalState||this.context.workspaceState;
        let notice:string|undefined;
        const openAiGuideLinks:Record<string,string>={
            ai_chatgpt_tunnels:'https://platform.openai.com/settings/organization/tunnels',
            ai_chatgpt_runtime_keys:'https://platform.openai.com/settings/organization/api-keys',
            ai_chatgpt_chat:'https://chatgpt.com/',
            ai_chatgpt_guide:'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt'
        };
        if(Object.prototype.hasOwnProperty.call(openAiGuideLinks,raw.type)){
            await vscode.env.openExternal(vscode.Uri.parse(openAiGuideLinks[raw.type]));
            notice='aiGuideLinkOpened';
        }else if(raw.type==='ai_guide_copy'||raw.type==='ai_guide_open'||
            raw.type==='ai_provider_save'||raw.type==='ai_provider_clear'){
            if(typeof raw.id!=='string'){throw new Error('Invalid profile identifier.');}
            const profile=listLocalConnections(storage).find(p=>p.id===raw.id);
            if(!profile){throw new Error('Unknown connection profile.');}
            const guide=onboardingGuide(profile.provider);
            if(!guide){throw new Error('Provider guide unavailable.');}
            if(raw.type==='ai_guide_copy'){
                if(typeof raw.commandIndex!=='number'||!Number.isInteger(raw.commandIndex)){
                    throw new Error('Invalid guide command.');
                }
                const command=guide.commands[raw.commandIndex];
                if(!command){throw new Error('Unknown guide command.');}
                // No shell execution; safe, catalog-authorized copy only.
                await vscode.env.clipboard.writeText(command.command);
                notice='aiGuideCommandCopied';
            }else if(raw.type==='ai_guide_open'){
                if(typeof raw.linkIndex!=='number'||!Number.isInteger(raw.linkIndex)){
                    throw new Error('Invalid guide link.');
                }
                const link=guide.links[raw.linkIndex];
                if(!link||!link.url.startsWith('https://')){
                    throw new Error('Unknown official guide URL.');
                }
                await vscode.env.openExternal(vscode.Uri.parse(link.url));
                notice='aiGuideLinkOpened';
            }else if(raw.type==='ai_provider_save'){
                if(typeof raw.value!=='string'||raw.value.length>8192){
                    throw new Error('Invalid provider setup value.');
                }
                await saveProviderField(this.context,profile.id,raw.field,raw.value);
                notice='aiProviderFieldSaved';
            }else{
                await clearProviderField(this.context,profile.id,raw.field);
                notice='aiProviderFieldCleared';
            }
        }else if(raw.type.startsWith('ai_gateway_')){
            const gateway=this.getAiGatewayManager?.();
            if(!gateway){throw new Error('Independent gateway manager is unavailable.');}
            if(typeof raw.id!=='string'){throw new Error('Invalid AI connection ID.');}
            const id=raw.id;
            const owner=listLocalConnections(storage).find(p=>p.id===id);
            if(!owner){throw new Error('Unknown AI connection profile.');}
            if(raw.type==='ai_gateway_configure'){
                if(typeof raw.shellId!=='string'||!validAiAccessLevel(raw.level)){
                    throw new Error('Choose a valid terminal and access level.');
                }
                const grant=this.locale()==='es'?'Autorizar acceso':'Authorize access';
                const approved=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿Permitir que '+owner.name+' acceda a '+raw.shellId+' con permisos '+raw.level+'? La pasarela se vinculará solo a esa terminal, exigirá una clave individual y escuchará exclusivamente en localhost. No se creará ningún túnel público.'
                        :'Allow '+owner.name+' to access '+raw.shellId+' with '+raw.level+' permissions? A unique secret will be required and the gateway will listen only on localhost. No public tunnel will be created.',
                    {modal:true},grant);
                if(approved!==grant){await this.view?.webview.postMessage({type:'ai_done'});return;}
                await gateway.provision(id,raw.shellId,raw.level);
                notice='aiGatewayConfigured';
            }else if(raw.type==='ai_gateway_start'){
                await gateway.start(id);
                notice='aiGatewayStarted';
            }else if(raw.type==='ai_gateway_stop'){
                await gateway.stop(id);
                notice='aiGatewayStopped';
            }else if(raw.type==='ai_gateway_autostart'){
                if(typeof raw.value!=='boolean'){throw new Error('Invalid autostart setting.');}
                if(raw.value){
                    const label=this.locale()==='es'?'Activar arranque':'Enable autostart';
                    const approved=await vscode.window.showWarningMessage(
                        this.locale()==='es'
                            ?'¿Activar automáticamente la pasarela LOCAL autenticada de '+owner.name+' cuando esta ventana sea coordinadora? El puerto seguirá limitado a localhost. No se iniciará un túnel público.'
                            :'Automatically start '+owner.name+' authenticated LOCAL gateway when this window becomes the hub? Only localhost will be bound; no public tunnel will start.',
                        {modal:true},label);
                    if(approved!==label){await this.view?.webview.postMessage({type:'ai_done'});return;}
                }
                await gateway.setAutostart(id,raw.value);
                notice=raw.value?'aiGatewayAutoOn':'aiGatewayAutoOff';
            }else if(raw.type==='ai_gateway_copy_key'){
                const allow=this.locale()==='es'?'Copiar clave':'Copy secret';
                const approved=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿Copiar la clave privada de '+owner.name+' al portapapeles? Cualquier aplicación que lea el portapapeles podría capturarla. No la pegues en archivos del proyecto ni en chats.'
                        :'Copy the private key for '+owner.name+' to the clipboard? Other apps may read it. Never paste it into project files or chat messages.',
                    {modal:true},allow);
                if(approved!==allow){await this.view?.webview.postMessage({type:'ai_done'});return;}
                const key=await gateway.secret(id);
                await vscode.env.clipboard.writeText(key);
                notice='aiGatewayKeyCopied';
            }else if(raw.type==='ai_gateway_copy_url'){
                const item=gateway.statuses().find(x=>x.profileId===id);
                if(!item){throw new Error('Configure the gateway first.');}
                await vscode.env.clipboard.writeText(item.endpoint);
                notice='aiGatewayUrlCopied';
            }else if(raw.type==='ai_gateway_rotate'||raw.type==='ai_gateway_revoke'){
                const label=this.locale()==='es'?'Confirmar':'Confirm';
                const approved=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿'+(raw.type==='ai_gateway_rotate'?'Rotar la clave':'Revocar y eliminar la pasarela')+
                            ' de '+owner.name+'? Se desconectarán las sesiones activas de esta conexión, pero no las de otras IAs.'
                        :(raw.type==='ai_gateway_rotate'?'Rotate':'Revoke')+
                            ' the gateway for '+owner.name+'? Active sessions for this connection will be disconnected without affecting other AIs.',
                    {modal:true},label);
                if(approved!==label){await this.view?.webview.postMessage({type:'ai_done'});return;}
                if(raw.type==='ai_gateway_rotate'){
                    await gateway.rotate(id);
                    notice='aiGatewayRotated';
                }else{
                    await gateway.remove(id);
                    notice='aiGatewayRevoked';
                }
            }else{throw new Error('Unknown independent gateway operation.');}
        }else if(raw.type==='ai_add'){
            await addLocalConnection(storage,raw.provider,raw.value);
            notice='aiAdded';
        }else if(raw.type==='ai_install'||raw.type==='ai_uninstall'||raw.type==='ai_check'||raw.type==='ai_open'){
            if(typeof raw.id!=='string'){throw new Error('Invalid connection ID.');}
            const profile=listLocalConnections(storage).find(item=>item.id===raw.id);
            if(!profile){throw new Error('Unknown connection profile.');}
            const capability=getAiClientCapability(profile.provider);
            if(!capability){throw new Error('Unknown AI client.');}
            if(capability.mode!=='local'){
                if(raw.type!=='ai_open'){
                    throw new Error('This provider requires an independently authenticated HTTPS gateway. No public connection is configured.');
                }
                if(!capability.setupUrl){throw new Error('No verified setup page for this provider.');}
                await vscode.env.openExternal(vscode.Uri.parse(capability.setupUrl));
                await this.view?.webview.postMessage({type:'ai_done',notice:'aiProviderOpened'});
                return;
            }
            const manager=this.getController();
            if(!manager){throw new Error('Start MultiShell MCP before configuring another AI client.');}
            const port=manager.listeningPort;
            const workspace=manager.worker?.workspace||vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if(raw.type==='ai_install'){
                // The pre-0.10.51 automatic registration produces URL-only
                // configs. Never write a connection that cannot authenticate.
                throw new Error('Automatic setup requires secure per-client credential provisioning. Configure an authenticated gateway and use Copy configuration instead.');
            }else if(raw.type==='ai_uninstall'){
                const label=this.locale()==='es'?'Desvincular':'Disconnect';
                const answer=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿Retirar la configuración MCP de '+profile.name+'? No se cerrarán sesiones ni se desinstalará la IA.'
                        :'Remove the MCP configuration from '+profile.name+'? Existing sessions and the AI application will not be stopped.',
                    {modal:true},label);
                if(answer!==label){
                    await this.view?.webview.postMessage({type:'ai_done'});
                    return;
                }
                await disconnectClient(profile,port,storage,workspace);
                notice='aiUninstalled';
            }else if(raw.type==='ai_open'){
                const location=integrationLocation(profile.provider,port,workspace);
                const document=await vscode.workspace.openTextDocument(vscode.Uri.file(location.file));
                await vscode.window.showTextDocument(document,{preview:true});
                notice='aiConfigOpened';
            }else{
                notice='aiChecked';
            }
        }else if(raw.type==='ai_remove'){
            if(typeof raw.id!=='string'){throw new Error('Invalid connection ID.');}
            const profile=listLocalConnections(storage).find(item=>item.id===raw.id);
            if(!profile){throw new Error('Unknown connection profile.');}
            if(this.getAiGatewayManager?.()?.configured(profile.id)){
                throw new Error('Revoke the independent gateway before deleting its AI profile.');
            }
            if(ownsClientProfile(storage,profile.id)){
                throw new Error('Disconnect the managed client configuration before deleting its profile.');
            }
            const label=this.locale()==='es'?'Eliminar perfil':'Remove profile';
            const confirmation=await vscode.window.showWarningMessage(
                this.locale()==='es'
                    ?'¿Eliminar el perfil local '+profile.name+'? No se modificará el cliente de IA ni se detendrá MCP.'
                    :'Remove local profile '+profile.name+'? The AI client and MCP server will not be modified.',
                {modal:true},label);
            if(confirmation!==label){
                await this.view?.webview.postMessage({type:'ai_done'});
                return;
            }
            await removeProviderSettings(this.context,profile.id);
            await removeLocalConnection(storage,raw.id);
            notice='aiRemoved';
        }else if(raw.type==='ai_copy'){
            if(typeof raw.id!=='string'){throw new Error('Invalid connection ID.');}
            const profile=listLocalConnections(storage).find(item=>item.id===raw.id);
            if(!profile){throw new Error('Unknown connection profile.');}
            if(getAiClientCapability(profile.provider)?.mode==='remote'){
                throw new Error('Remote providers cannot use a localhost MCP snippet. Configure an authenticated HTTPS gateway first.');
            }
            const manager=this.getController();
            if(!manager){throw new Error('Start local MultiShell MCP before copying a connection configuration.');}
            const gateway=this.getAiGatewayManager?.()?.statuses().find(item=>
                item.profileId===profile.id);
            if(!gateway){
                throw new Error('Configure an authenticated gateway for this AI profile first. Then copy the connection settings and replace the credential placeholder locally.');
            }
            const label=this.locale()==='es'?'Copiar configuración':'Copy configuration';
            const confirmation=await vscode.window.showWarningMessage(
                this.locale()==='es'
                    ?'Se copiará la URL de la pasarela restringida de '+profile.name+' y un MARCADOR de clave, nunca la clave real. Sustituye el marcador con la clave individual usando la configuración segura del cliente. ¿Copiar?'
                    :'Copy the scoped gateway URL for '+profile.name+' with a credential PLACEHOLDER, never the real secret. Replace the placeholder using the client\'s secure credential settings. Copy?',
                {modal:true},label);
            if(confirmation!==label){
                await this.view?.webview.postMessage({type:'ai_done'});
                return;
            }
            const port=manager.listeningPort;
            const instructions=localConnectionInstructions(profile.provider,port,gateway.endpoint);
            await vscode.env.clipboard.writeText(instructions);
            notice='aiCopied';
        }else{throw new Error('Unknown local AI connection operation.');}
        await this.refresh(true);
        await this.view?.webview.postMessage({type:'ai_done',notice});
    }
    private async message(raw: UIMessage): Promise<void> {
        if (!raw || typeof raw.type !== 'string') {return;}
        try {
            if(raw.type.startsWith('tunnel_')){await this.tunnelMessage(raw);return;}
            if(raw.type.startsWith('ai_')){await this.aiMessage(raw);return;}
            if(raw.type==='skills'||raw.type==='skill_copy'){await this.skillMessage(raw);return;}
            if(raw.type==='skill_settings'){
                await vscode.commands.executeCommand('workbench.action.openSettings','multi-shell-mcp.globalCodexSkills');
                return;
            }
            if (raw.type === 'refresh') { await this.refresh(); return; }
            if (raw.type === 'port') {
                const port=Number(raw.value);
                if(!Number.isInteger(port)||port<1024||port>65535){
                    throw new Error(this.locale()==='es'?'Puerto válido: entre 1024 y 65535.':'Valid port: 1024–65535.');
                }
                const cfg=vscode.workspace.getConfiguration('multi-shell-mcp');
                const current=cfg.get<number>('port')??3000;
                if(current!==port){
                    await this.getTunnelManager?.()?.assertPortChangeSafe(current,port);
                }
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