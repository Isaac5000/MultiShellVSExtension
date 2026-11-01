import * as vscode from 'vscode';
import { MCPServer, ToolConfiguration } from './server';
import { MultiWindowController, WindowRouter, getSecret } from './multi-window';
import { MultiShellPanel } from './panel';
import type { SavedIdleProof } from './shell-manager';
import { logger } from './utils/logger';

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
let statusBar:vscode.StatusBarItem|undefined;
let panel:MultiShellPanel|undefined;
let starting:Promise<void>|undefined;
let roleInfo='Off';
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
            file:enabled.file??true,edit:enabled.edit??true,shell:enabled.shell??true
        }
    };
}
export function statusIndicator(online:boolean,port?:number):{text:string;color:vscode.ThemeColor}{
    return {text:online&&port?'MultiShell MCP: ON · '+port:online?'MultiShell MCP: ON':'MultiShell MCP: OFF',
        color:new vscode.ThemeColor(online?'testing.iconPassed':'editorWarning.foreground')};
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
            const server=new MCPServer(port,'127.0.0.1',router,tools,router);
            await server.start();
            return server;
        },(role,id)=>{
            roleInfo=role+' ('+id+')';
            refreshStatus();
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
          async id=>context.workspaceState.update('multiShellPrimaryId',id));
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
    return a.file===b.file && a.edit===b.edit && a.shell===b.shell;
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
    try{
        await stop(true);
        await start(context);
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
                    await cfg.update('enabledTools',oldTools,vscode.ConfigurationTarget.Global);
                }
            }
        }catch(rollbackError){
            logger.error('Configuration rollback failed: '+String(rollbackError));
        }
        try{await start(context);}
        catch(recoveryError){logger.error('Configuration recovery failed: '+String(recoveryError));}
        vscode.window.showErrorMessage('MultiShell MCP: could not apply port '+requested.port+' or tool permissions. Previous settings restored where possible. '+String(error));
    }finally{
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
export async function activate(context:vscode.ExtensionContext):Promise<void>{
    extensionContext=context;
    deactivating=false;
    idleProofRevision=0;
    idleProofWrites=Promise.resolve();
    if(idleProofTicker){clearInterval(idleProofTicker);}
    idleProofTicker=undefined;
    statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,95);
    statusBar.command='multi-shell-mcp.toggleServer';
    context.subscriptions.push(statusBar);
    panel=new MultiShellPanel(context,()=>controller,
        async shell=>updateUserSessions(context,previous=>[
            ...previous.filter(s=>s.shell_id!==shell.shell_id),
            {shell_id:shell.shell_id,initial_cwd:shell.initial_cwd,alias:shell.alias}
        ]),
        async id=>updateUserSessions(context,previous=>previous.filter(s=>s.shell_id!==id)));
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
        if(event.affectsConfiguration(SETTING+'.port') || event.affectsConfiguration(SETTING+'.enabledTools')){
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
    extensionContext=undefined;
    logger.dispose();
}