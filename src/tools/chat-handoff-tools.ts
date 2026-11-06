import type {CallToolResult} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {ShellApi} from '../shell-api';
import {ChatHandoffStore,ChatHandoffScope} from '../chat-handoff-store';
import {ToolRegistry} from './tool-registry';

function result(value:unknown,isError=false):CallToolResult{
    return {isError,content:[{type:'text',text:JSON.stringify(value)}]};
}
function error(error:unknown):CallToolResult{
    return result({error:error instanceof Error?error.message:String(error)},true);
}
async function exactScope(shells:ShellApi,shellId:string):Promise<ChatHandoffScope>{
    // No implicit shell, aliases or inferred conversation ID.
    const matches=(await shells.list()).filter(row=>row.shell_id===shellId);
    if(matches.length!==1){
        throw new Error('Exact shell_id not found. Use list_shells_code first.');
    }
    const shell=matches[0];
    if(!shell.machine_id||!shell.initial_cwd){
        throw new Error('Machine and workspace identity unavailable; no handoff stored.');
    }
    return {shellId,workspace:shell.initial_cwd,machineId:shell.machine_id};
}
function nextChatPrompt(id:string):string{
    return 'Abre manualmente otro chat del mismo proyecto de ChatGPT y escribe: '+
        '«Continúa mi tarea de MultiShell MCP. Primero llama a list_shells_code '+
        'para identificar la shell ACTUAL de este proyecto; después llama a '+
        'chat_handoff_load_code con esa shell_id y handoff_id='+id+
        '. Verifica los resultados y comandos pendientes antes de repetirlos. '+
        'No uses APIs de pago ni otros modelos». '+
        'MultiShell no puede abrir chats ni enviar mensajes a ChatGPT por sí solo.';
}
export function registerChatHandoffTools(
    tools:ToolRegistry,shells:ShellApi,allowWrite:boolean,
    store=new ChatHandoffStore()
):void{
    const shell=z.string().min(1).max(160).describe(
        'Exact shell_id returned by list_shells_code. Never infer from chat content.');
    const id=z.string().uuid().describe(
        'Opaque handoff ID returned when the checkpoint was created.');
    const candidates=(scope:ChatHandoffScope)=>store.list(scope).map(row=>({
        handoffId:row.handoffId,revision:row.revision,status:row.status,
        objective:row.objective.slice(0,220),nextAction:row.nextAction.slice(0,250),
        updatedAt:row.updatedAt
    }));
    tools.tool('chat_handoff_list_code',
        'List up to 24 scoped ChatGPT task checkpoints. Read-only. Use before '+
        'recovering a task if several tasks may exist in the same workspace.',
        {shell_id:shell},
        async({shell_id}):Promise<CallToolResult>=>{
            try{
                const scope=await exactScope(shells,shell_id);
                return result({tasks:candidates(scope),
                    instruction:'Choose the intended handoffId explicitly. '+ 
                    'This list is local task metadata, not proof of execution.'});
            }catch(e){return error(e);}
        },{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
    tools.tool('chat_handoff_load_code',
        'Recover a bounded checkpoint from a ChatGPT conversation. '+ 
        'When multiple unfinished checkpoints exist, an explicit handoff_id '+
        'is REQUIRED to avoid resuming the wrong task. Read-only; creates no chats.',
        {shell_id:shell,handoff_id:id.optional()},
        async({shell_id,handoff_id}):Promise<CallToolResult>=>{
            try{
                const scope=await exactScope(shells,shell_id);
                if(!handoff_id){
                    const tasks=store.list(scope);
                    const unfinished=tasks.filter(row=>row.status!=='claimed_complete');
                    if(unfinished.length!==1){
                        return result({found:false,
                            ambiguous:unfinished.length>1,
                            completedOnly:tasks.length>0&&unfinished.length===0,
                            candidates:candidates(scope),
                            instruction:unfinished.length>1?
                                'Multiple unfinished tasks. Choose an explicit handoff_id '+ 
                                'using chat_handoff_list_code before resuming.':
                                tasks.length?
                                    'Only completed checkpoints exist; do not resume '+ 
                                    'without selecting an explicit task ID.':
                                    'No checkpoint saved for this workspace. '+ 
                                    'Ask for context rather than inventing progress.'});
                    }
                    handoff_id=unfinished[0].handoffId;
                }
                const record=store.get(scope,handoff_id);
                if(!record){return result({found:false,instruction:
                    'Checkpoint not found. Do not infer or invent the missing state.'});}
                return result({found:true,checkpoint:record,
                    warning:'This is assistant-written progress, NOT independent proof. '+
                    'Inspect the actual working tree, tests, and pending commands. '+ 
                    'Do not repeat uncertain side effects without human review.',
                    claimedComplete:record.status==='claimed_complete',
                    nextAction:record.nextAction});
            }catch(e){return error(e);}
        },{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
    if(!allowWrite){return;}
    const item=z.string().min(1).max(500);
    tools.tool('chat_handoff_save_code',
        'Create or update a small verified-progress handoff for a future ChatGPT chat. '+
        'Use after significant milestones or before running out of context. '+
        'Never include passwords, tokens or raw chat transcripts. Does not create chats.',
        {
            shell_id:shell,
            handoff_id:id.optional(),
            expected_revision:z.number().int().min(1).optional().describe(
                'Required when updating an existing handoff. Use revision from load result.'),
            objective:z.string().min(1).max(1400),
            verification:z.string().min(1).max(1000).describe(
                'Objective acceptance criteria; not a claim of passing.'),
            summary:z.string().min(1).max(2800),
            completed:z.array(item).max(24),
            remaining:z.array(item).max(24),
            artifacts:z.array(z.string().min(1).max(300)).max(24),
            risks:z.array(z.string().min(1).max(400)).max(12),
            next_action:z.string().min(1).max(850),
            status:z.enum(['working','blocked','claimed_complete']).default('working'),
            verification_evidence:z.string().max(1200).optional()
        },
        async({shell_id,handoff_id,expected_revision,objective,verification,
            summary,completed,remaining,artifacts,risks,next_action,status,
            verification_evidence}):Promise<CallToolResult>=>{
            try{
                const scope=await exactScope(shells,shell_id);
                const saved=store.save(scope,{
                    objective,verification,summary,completed,remaining,
                    artifacts,risks,nextAction:next_action,status,
                    ...(verification_evidence!==undefined?{
                        verificationEvidence:verification_evidence}:{})
                },handoff_id,expected_revision);
                return result({
                    saved:true,handoffId:saved.handoffId,
                    revision:saved.revision,updatedAt:saved.updatedAt,
                    checkpointBytes:Buffer.byteLength(JSON.stringify(saved),'utf8'),
                    nextChatPrompt:nextChatPrompt(saved.handoffId),
                    reminder:'Checkpoint saved locally. ChatGPT must create new chats '+
                        'through its own UI; no automatic chat launch occurred.'
                });
            }catch(e){return error(e);}
        },{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false});
    // No deletion MCP tool: the model cannot authenticate a human gesture.
    // Deletion remains a local store-maintenance operation, never a
    // model-supplied "human_confirmed: true" flag.
}