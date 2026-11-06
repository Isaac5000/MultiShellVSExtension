import * as vscode from 'vscode';
import { MCPServer, ToolConfiguration } from './server';
import {listWorkspaceSkills} from './tools/agent-skills';
import {getPreferredPaths} from './tools/skill-preferences';
import { MultiWindowController, WindowRouter, getSecret } from './multi-window';
import { MultiShellPanel } from './panel';
import type { SavedIdleProof } from './shell-manager';
import { logger } from './utils/logger';
import {TunnelManager} from './tunnel-manager';
import {AiGatewayManager} from './ai-gateway-manager';

export { MCPServer };

const SETTING='multi-shell-mcp';
const STATE='multiShellMcpEnabled';
type StoredUserShell={shell_id:string;initial_cwd:string;alias?:string};
let userSessionWrites:Promise<void>=Promise.resolve();
/** Memento writes are asynchronous; serialize updates to avoid losing parallel sessions. */
function updateUserSessions(context:vscode.ExtensionContext,
    modify:(current:StoredUserShell[])=>StoredUserShell[]):Promise<void>{
    const work=userSessionWrites.catch(()=>{}).then(async()=>{
        const key='multiShellUserSessions';
        const previous=context.workspaceState.get<StoredUserShell[]>(key,[]);
        const next=modify(previous);
        if(JSON.stringify(previous)!==JSON.stringify(next)){
            await context.workspaceState.update(key,next);
        }
    });
    userSessionWrites=work.catch(error=>{
        logger.error('MultiShell user session persistence error: '+String(error));
    });
    return work;
}
let controller:MultiWindowController|undefined;
let tunnelManager:TunnelManager|undefined;
let aiGatewayManager:AiGatewayManager|undefined;
let statusBar:vscode.StatusBarItem|undefined;
let panel:MultiShellPanel|undefined;
let starting:Promise<void>|undefined;
let roleInfo='Off';
let syncingTunnelPort=false;
let applyingConfiguration=false;
let pendingConfigurationChange=false;
let activeTools:ToolConfiguration|undefined;
let extensionContext:vscode.ExtensionContext|undefined;
let deactivating=false;
let idleProofRevision=0;
let idleProofWrites:Promise<void>=Promise.resolve();
let idleProofTicker:ReturnType<typeof setInterval>|undefined;

/** Save idle evidence after real shell activity, even if Reload Window skips
 * deactivate(). Never write an older snapshot over a newer state transition. */
function queueIdleProofSnapshot(context:vscode.ExtensionContext,owner:MultiWindowController):void {
    const revision=++idleProofRevision;
    const write=idleProofWrites.catch(()=>{}).then(async()=>{
        if(controller!==owner||deactivating||revision!==idleProofRevision){return;}
        const proofs=await owner.snapshotSafeIdleProofs();
        if(controller!==owner||deactivating||revision!==idleProofRevision){return;}
        await context.workspaceState.update('multiShellSafeIdleProofs',proofs);
    });
    idleProofWrites=write.catch(error=>
        logger.warn('Could not persist terminal idle state: '+String(error)));
}

function config():{port:number;tools:ToolConfiguration;defaultEnabled:boolean;interactiveAutoExit:boolean}{
    const cfg=vscode.workspace.getConfiguration(SETTING);
    const enabled=cfg.get<Record<string,boolean>>('enabledTools')||{};
    return {
        port:cfg.get<number>('port') ?? 3000,
        defaultEnabled:cfg.get<boolean>('defaultEnabled')??false,
        interactiveAutoExit:cfg.get<boolean>('interactiveAutoExit')??true,
        tools:{
            file:enabled.file??true,edit:enabled.edit??true,shell:enabled.shell??true,
            globalSkills:cfg.get<boolean>('globalCodexSkills')??false
        }
    };
}
export function statusIndicator(online:boolean,port?:number):{text:string;color:vscode.ThemeColor}{
    return {text:online&&port?'MultiShell MCP: ON · '+port:online?'MultiShell MCP: ON':'MultiShell MCP: OFF',
        color:new vscode.ThemeColor(online?'testing.iconPassed':'editorWarning.foreground')};
}
async function restoreTunnelOwnership():Promise<void>{
    const manager=tunnelManager;
    if(!manager||!extensionContext?.secrets||syncingTunnelPort){return;}
    try{
        await manager.adoptDetached();
        await manager.startIfEnabled();
    }catch(error){
        logger.warn('Tunnel recovery deferred: '+String(error));
    }
    void panel?.refresh();
}
function refreshStatus():void{
    if(!statusBar){return;}
    const online=Boolean(controller);
    const indicator=statusIndicator(online,controller?.listeningPort);
    statusBar.text=indicator.text;
    statusBar.color=indicator.color;
    statusBar.tooltip=online?'Detener MultiShell MCP · Puerto '+controller!.listeningPort:'Iniciar MultiShell MCP';
    statusBar.show();
    void panel?.refresh();
}
async function start(context:vscode.ExtensionContext):Promise<void>{
    // Defense in depth: block MCP even if Workspace Trust restrictions are overridden.
    if(vscode.workspace.isTrusted===false){
        throw new Error('El espacio de trabajo no es de confianza. Autoriza Workspace Trust antes de iniciar MultiShell MCP.');
    }
    if(controller || starting){return starting;}
    const op=(async()=>{
        const {port,tools}=config();
        if(port!==3000){logger.warn('Nonstandard MultiShell MCP port: '+port);}
        const workspace=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if(!workspace){throw new Error('Open a project folder in this VSCode window first.');}
        const tokenPath=context.globalStorageUri.fsPath;

        const token=getSecret(tokenPath);
        const next=new MultiWindowController(port,token,workspace,async(router:WindowRouter)=>{
            const server=new MCPServer(port,'127.0.0.1',router,tools,router,{localToken:token});
            await server.start();
            return server;
        },(role,id)=>{
            roleInfo=role+' ('+id+')';
            refreshStatus();
            // A worker can become hub after a crash; auto-recover the tunnel
            // only when the new owner has an explicitly enabled profile.
            if(role==='hub'&&controller){
                void restoreTunnelOwnership();
                void aiGatewayManager?.startIfEnabled();
            }else if(role==='worker'){
                // A worker must not retain a gateway pointing at a stale
                // hub/router after an election or takeover.
                void aiGatewayManager?.stopAll();
            }
        },context.workspaceState.get<string>('multiShellPrimaryAlias'),
          context.workspaceState.get<string>('multiShellPrimaryId'),
          context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>('multiShellUserSessions',[]),
          async(id,alias)=>{
              if(id.startsWith('main-')){
                  await context.workspaceState.update('multiShellPrimaryAlias',alias);
              }else{
                  await updateUserSessions(context,previous=>previous.map(s=>
                      s.shell_id===id?{...s,alias}:s));
              }
          },
          async(shell)=>{
              // A user terminal created on the AI's request must remain
              // recoverable even when the VSCode sidebar is never opened.
              await updateUserSessions(context,previous=>[
                  ...previous.filter(s=>s.shell_id!==shell.shell_id),
                  {shell_id:shell.shell_id,initial_cwd:shell.initial_cwd,alias:shell.alias}
              ]);
          },
          context.workspaceState.get<boolean>('multiShellWindowAutoExit',config().interactiveAutoExit),
          context.workspaceState.get<Record<string,boolean>>('multiShellInteractiveShellOverrides',{}),
          context.workspaceState.get<Record<string,SavedIdleProof>>('multiShellSafeIdleProofs',{}),
          async id=>context.workspaceState.update('multiShellPrimaryId',id),
          ()=>getPreferredPaths(context.workspaceState,context.globalState,
              config().tools.globalSkills===true));
        try {
            await next.start();
            // A failed workspace-state write must not orphan the already-open hub.
            await context.workspaceState.update('multiShellPrimaryId',next.primaryShellId);
            // Idle evidence applies to this one restoration only; the next
            // unload will collect a fresh process-ID-matched snapshot.
            await context.workspaceState.update('multiShellSafeIdleProofs',{});
            controller=next;
            activeTools=tools;
            next.localShells?.setIdleStateListener?.(()=>
                queueIdleProofSnapshot(context,next));
            // Record a baseline immediately, not only on shutdown. Some VS Code
            // reload paths do not await the extension's deactivate() callback.
            queueIdleProofSnapshot(context,next);
            // Keep the proof fresh during long idle periods, even if VS Code
            // later reloads without waiting for deactivate().
            if(idleProofTicker){clearInterval(idleProofTicker);}
            idleProofTicker=setInterval(()=>
                queueIdleProofSnapshot(context,next),15_000);
            refreshStatus();
            // Only the elected local hub may manage this machine's tunnel.
            // Opt-in is OFF by default; existing external processes are untouched.
            if(roleInfo.startsWith('hub')){
                void restoreTunnelOwnership();
                void aiGatewayManager?.startIfEnabled();
            }
            logger.info('MultiShell MCP '+roleInfo+' started');
        } catch (error) {
            if (controller===next) {controller=undefined;}
            activeTools=undefined;
            roleInfo='Off';
            try {await next.stop(true);}
            catch (cleanupError) {
                logger.error('MultiShell MCP startup rollback failed: '+String(cleanupError));
            }
            refreshStatus();
            throw error;
        }
    })();
    starting=op;
    try{await op;}finally{starting=undefined;}
}
/** Restart on port or tool-permission changes, restoring the working configuration on failure. */
function sameTools(a:ToolConfiguration,b:ToolConfiguration):boolean{
    return a.file===b.file && a.edit===b.edit && a.shell===b.shell &&
        (a.globalSkills??false)===(b.globalSkills??false);
}
async function applyConfigurationChange(context:vscode.ExtensionContext):Promise<void>{
    if(applyingConfiguration){pendingConfigurationChange=true;return;}
    if(!controller){return;}
    const requested=config();
    const oldPort=controller.listeningPort;
    const oldTools=activeTools||requested.tools;
    if(oldPort===requested.port && sameTools(oldTools,requested.tools)){
        refreshStatus();
        return;
    }
    applyingConfiguration=true;
    if(oldPort!==requested.port){syncingTunnelPort=true;}
    try{
        if(oldPort!==requested.port){
            await tunnelManager?.assertPortChangeSafe(oldPort,requested.port);
        }
        await stop(true);
        await start(context);
        if(oldPort!==requested.port){
            await tunnelManager?.syncPort(oldPort,requested.port);
        }
        logger.info('MultiShell MCP configuration reloaded on port '+config().port);
    }catch(error){
        const cfg=vscode.workspace.getConfiguration(SETTING);
        try{
            // Never overwrite a newer user change with the old rollback.
            if(config().port===requested.port &&
                sameTools(config().tools,requested.tools)){
                if(requested.port!==oldPort){
                    await cfg.update('port',oldPort,vscode.ConfigurationTarget.Global);
                }
                if(!sameTools(requested.tools,oldTools)){
                    const changedPermissions=requested.tools.file!==oldTools.file||
                        requested.tools.edit!==oldTools.edit||
                        requested.tools.shell!==oldTools.shell;
                    if(changedPermissions){
                        await cfg.update('enabledTools',{
                            file:oldTools.file,edit:oldTools.edit,shell:oldTools.shell
                        },vscode.ConfigurationTarget.Global);
                    }
                    if((requested.tools.globalSkills??false)!==(oldTools.globalSkills??false)){
                        await cfg.update('globalCodexSkills',oldTools.globalSkills??false,
                            vscode.ConfigurationTarget.Global);
                    }
                }
            }
        }catch(rollbackError){
            logger.error('Configuration rollback failed: '+String(rollbackError));
        }
        try{await start(context);}
        catch(recoveryError){logger.error('Configuration recovery failed: '+String(recoveryError));}
        vscode.window.showErrorMessage('MultiShell MCP: could not apply port '+requested.port+' or tool permissions. Previous settings restored where possible. '+String(error));
    }finally{
        syncingTunnelPort=false;
        if(roleInfo.startsWith('hub')){void restoreTunnelOwnership();}
        applyingConfiguration=false;
        refreshStatus();
        if(pendingConfigurationChange){
            pendingConfigurationChange=false;
            // The first restart may have failed while another setting arrived.
            // Resume with the newest configuration instead of losing that event.
            void (async()=>{
                if(!controller){
                    try{await start(context);}
                    catch(recoveryError){
                        logger.error('Latest configuration could not start: '+String(recoveryError));
                        return;
                    }
                }
                await applyConfigurationChange(context);
            })();
        }
    }
}
async function stop(preserveTerminals=false):Promise<void>{
    if(starting){try{await starting;}catch{}}
    const previous=controller;controller=undefined;activeTools=undefined;roleInfo='Off';
    await aiGatewayManager?.stopAll();
    if(idleProofTicker){clearInterval(idleProofTicker);idleProofTicker=undefined;}
    if(previous){
        previous.localShells?.setIdleStateListener?.(undefined);
        ++idleProofRevision;
        // Serialized state writes must not overwrite the final shutdown proof.
        await idleProofWrites.catch(()=>{});
        if(preserveTerminals&&extensionContext){
            try{
                const proofs=await previous.snapshotSafeIdleProofs?.()||{};
                await extensionContext.workspaceState.update('multiShellSafeIdleProofs',proofs);
            }catch(error){
                // Never resume from a stale proof if the snapshot failed.
                try{await extensionContext.workspaceState.update('multiShellSafeIdleProofs',{});}catch{}
                logger.warn('Could not save safe terminal recovery evidence: '+String(error));
            }
        }
        await previous.stop(preserveTerminals);
    }
    refreshStatus();
}
/** User-invoked, read-only skill picker. Page through the complete catalog
 * without treating different providers with the same name as one skill. */
async function pickAvailableSkills():Promise<void>{
    const spanish=vscode.env.language.toLowerCase().startsWith('es');
    if(vscode.workspace.isTrusted===false){
        vscode.window.showWarningMessage(spanish
            ?'MultiShell MCP: confía en el proyecto antes de consultar skills.'
            :'MultiShell MCP: trust the workspace before listing skills.');
        return;
    }
    const workspace=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    // An empty VS Code window must not scan the extension host's cwd as
    // though it were an explicitly trusted project.
    if(!workspace){
        vscode.window.showWarningMessage(spanish
            ?'MultiShell MCP: abre una carpeta de proyecto para consultar sus skills.'
            :'MultiShell MCP: open a workspace folder before listing project skills.');
        return;
    }
    const cfg=vscode.workspace.getConfiguration(SETTING);
    if((cfg.get<Record<string,boolean>>('enabledTools')||{}).file===false){
        vscode.window.showWarningMessage(spanish
            ?'MultiShell MCP: la lectura de archivos está desactivada.'
            :'MultiShell MCP: file reading is disabled.');
        return;
    }
    for(;;){
        const includeGlobal=cfg.get<boolean>('globalCodexSkills')??false;
        const skills:ReturnType<typeof listWorkspaceSkills>['skills']=[];
        const warnings:string[]=[];
        let cursor:string|undefined;
        const seenCursors=new Set<string>();
        // A page is capped at 100 by the MCP catalog; the picker must not
        // silently hide valid matches after the first hundred entries.
        do{
            const page=listWorkspaceSkills(workspace,{includeGlobal,cursor,limit:100});
            skills.push(...page.skills);
            warnings.push(...page.warnings.filter(w=>!w.startsWith('More skills available;')));
            cursor=page.next_cursor;
            if(!cursor){break;}
            if(seenCursors.has(cursor)||skills.length>=4096){
                warnings.push('Skill picker reached its catalog limit.');
                break;
            }
            seenCursors.add(cursor);
            // Avoid monopolizing the VS Code extension host on larger catalogs.
            await new Promise<void>(resolve=>setImmediate(resolve));
        }while(cursor);
        if(warnings.length){logger.warn('Skill discovery warnings: '+warnings.slice(0,10).join('; '));}
        const counts=new Map<string,number>();
        for(const skill of skills){
            const key=skill.name.toLowerCase();
            counts.set(key,(counts.get(key)||0)+1);
        }
        const items=skills.map(skill=>({
            label:'$(book) '+skill.name,
            description:(skill.scope==='global'?'Codex · Global':
                (spanish?'Proyecto':'Workspace')+' · '+skill.source)+' · '+skill.skill_path,
            detail:skill.description,
            name:skill.name,
            skillPath:skill.skill_path,
            duplicate:(counts.get(skill.name.toLowerCase())||0)>1,
            enableGlobal:false
        }));
        if(!includeGlobal){
            items.unshift({
                label:'$(shield) '+(spanish?'Habilitar skills globales de Codex':'Enable global Codex skills'),
                description:spanish?'Requiere autorizar la lectura de archivos personales':
                    'Requires authorization to read personal skill files',
                detail:'~/.agents/skills · ~/.codex/skills · ~/.codex/skills/.system',
                name:'',skillPath:'',duplicate:false,enableGlobal:true
            });
        }
        if(!items.length){
            vscode.window.showInformationMessage(spanish
                ?'MultiShell MCP: no hay skills disponibles en este proyecto.'
                :'MultiShell MCP: no skills are available in this workspace.');
            return;
        }
        const chosen=await vscode.window.showQuickPick(items,{
            title:spanish?'MultiShell MCP · Skills disponibles':'MultiShell MCP · Available skills',
            placeHolder:spanish?'Selecciona una skill para copiar su nombre o ruta':
                'Select a skill to copy its name or unambiguous path',
            matchOnDescription:true,
            matchOnDetail:true
        });
        if(!chosen){return;}
        if(chosen.enableGlobal){
            const accept=spanish?'Habilitar lectura global':'Enable global reading';
            const approved=await vscode.window.showWarningMessage(
                spanish
                    ?'Los clientes MCP conectados, incluso por túnel, podrán leer tus skills globales (también los scripts como archivos). No se ejecutarán automáticamente.'
                    :'Connected MCP clients, including tunnel clients, will be able to read your global skills (including scripts as files). Scripts will not run automatically.',
                {modal:true},accept);
            if(approved===accept){
                await cfg.update('globalCodexSkills',true,vscode.ConfigurationTarget.Global);
                continue;
            }
            return;
        }
        // A bare name is convenient only when it identifies exactly one
        // skill. Duplicates require the full skill_path for load_skill_code.
        const selected=chosen.duplicate?chosen.skillPath:chosen.name;
        await vscode.env.clipboard.writeText(selected);
        vscode.window.showInformationMessage((spanish?'Skill copiada: ':'Skill copied: ')+selected);
        return;
    }
}
/** Register tunnel UI commands after the manager has been initialized. */
function registerTunnelCommands(context:vscode.ExtensionContext):void{
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelInstall',async()=>{
        try{
            await vscode.window.withProgress({
                location:vscode.ProgressLocation.Notification,
                title:'MultiShell: verifying bundled Tunnel Client v0.0.19'
            },async progress=>{
                await tunnelManager!.install();
                progress.report({message:'Verified against official SHA-256'});
            });
            vscode.window.showInformationMessage('MultiShell: bundled Tunnel Client v0.0.19 verified.');
        }catch(e){vscode.window.showErrorMessage('MultiShell tunnel verification: '+String(e));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelConfigure',async()=>{
        if(vscode.workspace.isTrusted===false){
            vscode.window.showWarningMessage('MultiShell: trust this workspace before configuring the tunnel.');
            return;
        }
        const id=await vscode.window.showInputBox({
            title:'MultiShell · Tunnel ID',
            prompt:'Existing OpenAI Platform tunnel ID (tunnel_..., including namespaces when applicable)',
            ignoreFocusOut:true,
            validateInput:value=>!value.trim()?'Tunnel ID required':undefined
        });
        if(!id){return;}
        const apiKey=await vscode.window.showInputBox({
            title:'MultiShell · Tunnel runtime API key',
            password:true,ignoreFocusOut:true,
            prompt:'Stored in VS Code SecretStorage. Never written to settings.json or Git.'
        });
        if(!apiKey){return;}
        try{
            await tunnelManager!.configure(id,apiKey);
            vscode.window.showInformationMessage('MultiShell: tunnel profile configured. Run Tunnel: Start when ready.');
        }catch(e){vscode.window.showErrorMessage('MultiShell tunnel configuration: '+String(e));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelReuseProfile',async()=>{
        if(vscode.workspace.isTrusted===false){
            vscode.window.showWarningMessage('MultiShell: trust the workspace before selecting a tunnel profile.');
            return;
        }
        try{
            const profiles=await tunnelManager!.findExistingProfiles();
            if(!profiles.length){
                vscode.window.showInformationMessage(
                    'No compatible existing Tunnel Client profiles were found for the current MCP port.');
                return;
            }
            const selected=await vscode.window.showQuickPick(profiles.map(profile=>({
                label:profile.name,description:profile.file,profile
            })),{title:'MultiShell · Reuse an existing tunnel profile without editing it'});
            if(!selected){return;}
            const key=await vscode.window.showInputBox({
                title:'MultiShell · Tunnel runtime API key',
                password:true,ignoreFocusOut:true,
                prompt:'Enter the runtime key; legacy DPAPI files are never decrypted automatically.'
            });
            if(!key){return;}
            await tunnelManager!.reuseExistingProfile(selected.profile,key);
            vscode.window.showInformationMessage(
                'MultiShell: existing profile selected read-only. Current external tunnels remain untouched.');
        }catch(error){vscode.window.showErrorMessage('MultiShell reuse profile: '+String(error));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelUpdateKey',async()=>{
        if(vscode.workspace.isTrusted===false){
            vscode.window.showWarningMessage('MultiShell: trust the workspace before updating the tunnel key.');
            return;
        }
        const key=await vscode.window.showInputBox({
            title:'MultiShell · Replace tunnel API key',
            password:true,ignoreFocusOut:true,
            prompt:'Only VS Code SecretStorage is updated; no profile or external tunnel is changed.'
        });
        if(!key){return;}
        try{
            await tunnelManager!.updateApiKey(key);
            vscode.window.showInformationMessage('MultiShell: runtime API key updated securely.');
        }catch(error){vscode.window.showErrorMessage('MultiShell tunnel key: '+String(error));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelStart',async()=>{
        try{
            const result=await tunnelManager!.start();
            vscode.window.showInformationMessage(result==='started'
                ?'MultiShell: Tunnel Client started without an integrated terminal.'
                :result==='occupied'
                    ?'MultiShell: health port 8080 is occupied. External process left untouched.'
                    :'MultiShell: a managed or detached tunnel instance already exists.');
        }catch(e){vscode.window.showErrorMessage('MultiShell tunnel: '+String(e));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelStop',async()=>{
        try{
            await tunnelManager!.stop();
            vscode.window.showInformationMessage('MultiShell: stop requested for extension-owned tunnel.');
        }catch(e){vscode.window.showWarningMessage('MultiShell tunnel: '+String(e));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelStatus',async()=>{
        try{
            const status=await tunnelManager!.status();
            vscode.window.showInformationMessage(
                'Tunnel v'+status.version+': '+(status.installed?'installed':'not installed')+
                ', '+(status.configured?'configured':'not configured')+
                ', health port '+(status.listenerOccupied?'occupied':'free')+
                ', ready '+status.ready+
                ', owner '+status.owner+', source '+status.source+
                ', autostart '+(status.autostart?'ON':'OFF')+
                (status.retryPaused?', automatic retries paused':'')+'.');
        }catch(e){vscode.window.showErrorMessage('MultiShell tunnel status: '+String(e));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.tunnelAutoStart',async()=>{
        try{
            const current=await tunnelManager!.status();
            const next=!current.autostart;
            if(next){
                const approved=await vscode.window.showWarningMessage(
                    'Enable automatic tunnel start when this trusted VS Code window becomes the MCP hub? '+
                    'This uses the saved runtime API key. No remote tunnel will be created.',
                    {modal:true},'Enable');
                if(approved!=='Enable'){return;}
            }
            await tunnelManager!.setAutostart(next);
            if(next){await tunnelManager!.startIfEnabled();}
            vscode.window.showInformationMessage('MultiShell tunnel autostart: '+(next?'ON':'OFF'));
        }catch(e){vscode.window.showErrorMessage('MultiShell tunnel autostart: '+String(e));}
    }));

}

export async function activate(context:vscode.ExtensionContext):Promise<void>{
    extensionContext=context;
    deactivating=false;
    idleProofRevision=0;
    idleProofWrites=Promise.resolve();
    if(idleProofTicker){clearInterval(idleProofTicker);}
    idleProofTicker=undefined;
    context.subscriptions.push(vscode.commands.registerCommand(
        'multi-shell-mcp.listSkills',pickAvailableSkills));
    aiGatewayManager=new AiGatewayManager(context,
        ()=>controller&&roleInfo.startsWith('hub')?controller.router:undefined,
        ()=>vscode.workspace.isTrusted!==false&&Boolean(controller)&&roleInfo.startsWith('hub'),
        ()=>activeTools||config().tools,
        ()=>vscode.workspace.isTrusted!==false);
    tunnelManager=new TunnelManager(context,
        ()=>controller?.listeningPort,
        async()=>vscode.workspace.isTrusted!==false&&Boolean(controller)&&roleInfo.startsWith('hub'),
        message=>logger.info(message),
        ()=>getSecret(context.globalStorageUri.fsPath));
    registerTunnelCommands(context);

    statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,95);
    statusBar.command='multi-shell-mcp.toggleServer';
    context.subscriptions.push(statusBar);
    panel=new MultiShellPanel(context,()=>controller,
        async shell=>updateUserSessions(context,previous=>[
            ...previous.filter(s=>s.shell_id!==shell.shell_id),
            {shell_id:shell.shell_id,initial_cwd:shell.initial_cwd,alias:shell.alias}
        ]),
        async id=>updateUserSessions(context,previous=>previous.filter(s=>s.shell_id!==id)),
        ()=>tunnelManager,
        ()=>aiGatewayManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(MultiShellPanel.viewType,panel));
    // A deliberate VSCode terminal close is final: forget its saved identity.
    // Reload Window keeps terminal instances alive and does not trigger this path.
    if(typeof vscode.window.onDidCloseTerminal==='function'){
        context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal=>{
            if(deactivating){return;}
            const found=/^MCP \[([A-Za-z][A-Za-z0-9_-]{1,39})\]$/.exec(terminal.name);
            if(!found){return;}
            void updateUserSessions(context,saved=>saved.filter(shell=>shell.shell_id!==found[1]));
        }));
    }
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{
        if(event.affectsConfiguration(SETTING+'.port') || event.affectsConfiguration(SETTING+'.enabledTools') ||
            event.affectsConfiguration(SETTING+'.globalCodexSkills')){
            void applyConfigurationChange(context);
        }
        if(event.affectsConfiguration(SETTING+'.interactiveAutoExit') &&
            context.workspaceState.get<boolean>('multiShellWindowAutoExit')===undefined){
            controller?.panelSetWindowAutoExit(config().interactiveAutoExit);
            void panel?.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.toggleServer',async()=>{
        try{
            if(controller){
                await stop();
                await context.globalState.update(STATE,false);
            }else{
                await start(context);
                await context.globalState.update(STATE,true);
            }
        }catch(error){vscode.window.showErrorMessage('MultiShell MCP: '+String(error));}
    }));
    context.subscriptions.push(vscode.commands.registerCommand('multi-shell-mcp.showServerInfo',()=>{
        vscode.window.showInformationMessage(controller?
            'MultiShell MCP: '+roleInfo+'. Hub at 127.0.0.1:'+config().port :
            'MultiShell MCP is off in this window.');
    }));
    refreshStatus();
    if(vscode.workspace.isTrusted===false){
        logger.warn('MultiShell MCP desactivado: Workspace Trust no concedido.');
    }else if(context.globalState.get<boolean>(STATE,config().defaultEnabled)){
        try{await start(context);}
        catch(e){vscode.window.showErrorMessage('MultiShell MCP startup failed: '+String(e));}
    }
}
export async function deactivate():Promise<void>{
    deactivating=true;
    // VSCode restores terminals after a full window restart. Keep their processes alive.
    await stop(true);
    statusBar?.dispose();
    statusBar=undefined;
    panel?.dispose();
    panel=undefined;
    tunnelManager?.dispose();
    tunnelManager=undefined;
    extensionContext=undefined;
    logger.dispose();
}