import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import {renderPanelMarkup} from './panel-markup';
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
import {mapConcurrent} from './bounded-map';
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
    shells?: Array<{ shell_id: string; alias?: string; initial_cwd: string; origin?: 'user'|'mcp'|'automatic'; timed_out_running?: boolean; recovery_required?: boolean; recovery_reason?: string; external_busy?: boolean; execution_phase?: string; input_wait_hint?: string; output_silent_seconds?: number; busy: boolean; queued: number; auto_exit_interactive?:boolean; auto_exit_override?:boolean; background_jobs?:Array<{job_id:string;status:string;command_label:string;elapsed_ms:number;input_hint?:string}> }>;
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
    jobId?:unknown;
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
        view.webview.html = renderPanelMarkup(view.webview.cspSource,js.toString(),css.toString(),nonce);
        view.webview.onDidReceiveMessage((raw: UIMessage) => { void this.message(raw); },
            undefined, this.context.subscriptions);
        view.onDidDispose(() => {
            this.view = undefined;
            this.lastSnapshot = undefined;
            if (this.timer) {clearInterval(this.timer);}
            this.timer = undefined;
        }, undefined, this.context.subscriptions);
        // Hidden views should not poll profiles, files or SecretStorage.
        // Reopen refreshes immediately rather than waiting for the next tick.
        view.onDidChangeVisibility?.(() => {
            if(view.visible){void this.refresh(true);}
        },undefined,this.context.subscriptions);
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
        if (!this.view || this.busy || (!force && this.view.visible===false)) {return;}
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
            // Client config files are independent. Check up to six profiles at
            // once, with results kept in profile order. Re-evaluate on every
            // refresh so external changes are never hidden by a stale cache.
            const linkEntries=await mapConcurrent(snapshot.aiConnections,6,async profile=>{
                let status:ClientConfigState;
                try{
                    status=await connectionConfigStatus(
                        profile,manager?.listeningPort||snapshot.port||3000,profileStore,snapshot.workspace);
                }catch{
                    status={configured:false,managed:false,scope:'unsupported',
                        detail:'Configuration unavailable'};
                }
                return [profile.id,status] as const;
            });
            snapshot.aiLinkStates=Object.fromEntries(linkEntries);
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
            if(raw.type==='cancel_background'){
                if(typeof raw.id!=='string'||typeof raw.jobId!=='string'){
                    throw new Error('Invalid background job identifier.');
                }
                const local=(await manager.panelState()).shells.find(shell=>shell.shell_id===raw.id);
                const job=local?.background_jobs.find(item=>item.job_id===raw.jobId);
                if(!job||!['running','cancelling'].includes(job.status)){
                    throw new Error('No active local background job with this identifier.');
                }
                const confirmation=this.locale()==='es'?'Cancelar trabajo':'Cancel job';
                const answer=await vscode.window.showWarningMessage(
                    this.locale()==='es'
                        ?'¿Cancelar el proceso aislado de '+raw.id+'? No se interrumpirá la terminal integrada.'
                        :'Cancel the isolated process for '+raw.id+'? The integrated terminal will not be interrupted.',
                    {modal:true},confirmation);
                if(answer===confirmation){manager.panelCancelBackgroundJob(raw.id,raw.jobId);}
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