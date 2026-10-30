import * as vscode from 'vscode';
import { MCPServer, ToolConfiguration } from './server';
import { MultiWindowController, WindowRouter, getSecret } from './multi-window';
import { MultiShellPanel } from './panel';
import { logger } from './utils/logger';

export { MCPServer };

const SETTING='multi-shell-mcp';
const STATE='multiShellMcpEnabled';
let controller:MultiWindowController|undefined;
let statusBar:vscode.StatusBarItem|undefined;
let panel:MultiShellPanel|undefined;
let starting:Promise<void>|undefined;
let roleInfo='Off';
let restartingPort=false;

function config():{port:number;tools:ToolConfiguration;defaultEnabled:boolean}{
    const cfg=vscode.workspace.getConfiguration(SETTING);
    const enabled=cfg.get<Record<string,boolean>>('enabledTools')||{};
    return {
        port:cfg.get<number>('port') ?? 3000,
        defaultEnabled:cfg.get<boolean>('defaultEnabled')??false,
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
          context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>('multiShellUserSessions',[]));
        await next.start();
        await context.workspaceState.update('multiShellPrimaryId',next.primaryShellId);
        controller=next;
        refreshStatus();
        logger.info('MultiShell MCP '+roleInfo+' started');
    })();
    starting=op;
    try{await op;}finally{starting=undefined;}
}
/** Apply a shared port change to this window; revert if the new listener cannot start. */
async function applyPortChange(context:vscode.ExtensionContext):Promise<void>{
    if(restartingPort){return;}
    if(!controller||controller.listeningPort===config().port){
        refreshStatus();
        return;
    }
    restartingPort=true;
    const oldPort=controller.listeningPort;
    const nextPort=config().port;
    try{
        await stop(true);
        try{
            await start(context);
        }catch(error){
            await vscode.workspace.getConfiguration(SETTING).update('port',oldPort,vscode.ConfigurationTarget.Global);
            try{await start(context);}
            catch(recoveryError){logger.error('Port rollback failed: '+String(recoveryError));}
            throw error;
        }
        logger.info('MultiShell MCP port switched from '+oldPort+' to '+nextPort);
    }catch(error){
        vscode.window.showErrorMessage('MultiShell MCP: no se pudo activar el puerto '+nextPort+
            '. Se ha restaurado '+oldPort+'. '+String(error));
    }finally{
        restartingPort=false;
        refreshStatus();
    }
}
async function stop(preserveTerminals=false):Promise<void>{
    if(starting){try{await starting;}catch{}}
    const previous=controller;controller=undefined;roleInfo='Off';
    if(previous){await previous.stop(preserveTerminals);}
    refreshStatus();
}
export async function activate(context:vscode.ExtensionContext):Promise<void>{
    statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,95);
    statusBar.command='multi-shell-mcp.toggleServer';
    context.subscriptions.push(statusBar);
    panel=new MultiShellPanel(context,()=>controller);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(MultiShellPanel.viewType,panel));
    // A deliberate VSCode terminal close is final: forget its saved identity.
    // Reload Window keeps terminal instances alive and does not trigger this path.
    if(typeof vscode.window.onDidCloseTerminal==='function'){
        context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal=>{
            const found=/^MCP \[([A-Za-z][A-Za-z0-9_-]{1,39})\]$/.exec(terminal.name);
            if(!found){return;}
            const key='multiShellUserSessions';
            const saved=context.workspaceState.get<Array<{shell_id:string;initial_cwd:string;alias?:string}>>(key,[]);
            const next=saved.filter(shell=>shell.shell_id!==found[1]);
            if(next.length!==saved.length){void context.workspaceState.update(key,next);}
        }));
    }
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{
        if(event.affectsConfiguration(SETTING+'.port')){void applyPortChange(context);}
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
    // VSCode restores terminals after a full window restart. Keep their processes alive.
    await stop(true);
    statusBar?.dispose();
    statusBar=undefined;
    panel?.dispose();
    panel=undefined;
    logger.dispose();
}