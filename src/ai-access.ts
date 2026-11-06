import {timingSafeEqual} from 'crypto';
import * as path from 'path';
import type {ShellApi} from './shell-api';
import type {ToolConfiguration} from './server';
import type {NativeKind,NativeArgs} from './tools/native-window-tools';

export type AiAccessLevel='read'|'edit'|'shell'|'full';
export const AI_ACCESS_LEVELS=['read','edit','shell','full'] as const;

export function validAiAccessLevel(value:unknown):value is AiAccessLevel{
    return typeof value==='string'&&AI_ACCESS_LEVELS.includes(value as AiAccessLevel);
}
export function scopedTools(level:AiAccessLevel,server:ToolConfiguration):ToolConfiguration{
    return {
        file:server.file!==false,
        edit:(level==='edit'||level==='full')&&server.edit===true,
        shell:(level==='shell'||level==='full')&&server.shell===true,
        globalSkills:false
    };
}
function denied():never{
    throw new Error('AI connection policy denies access to this shell or operation.');
}
/** Restrict the actual ShellApi used by the MCP tool factory, not UI-visible
 * metadata or any untrusted tool-call argument. Shell IDs are exact, not
 * aliases that could be retargeted or reused across windows.
 */
export function restrictedShellApi(shells:ShellApi,shellId:string,level:AiAccessLevel,initialRoot?:string):ShellApi{
    if(typeof shellId!=='string'||!shellId||shellId.length>160){throw new Error('Invalid allowed shell ID.');}
    const normalize=(root:string)=>process.platform==='win32'
        ?path.resolve(root).toLowerCase():path.resolve(root);
    const check=(id:string)=>{
        if(id!==shellId){denied();}
        if(initialRoot&&normalize(shells.root(id))!==normalize(initialRoot)){denied();}
    };
    const checkAsync=async(id:string)=>{
        check(id);
        const live=await shells.list();
        if(!live.some(x=>x.shell_id===id&&
            (!initialRoot||normalize(x.initial_cwd)===normalize(initialRoot)))){denied();}
    };
    const execute=level==='shell'||level==='full';
    return {
        create:()=>denied(),
        createUserWithApproval:async()=>denied(),
        list:async()=>{
            const entries=await shells.list();
            return entries.filter(item=>item.shell_id===shellId&&
                (!initialRoot||normalize(item.initial_cwd)===normalize(initialRoot)));
        },
        close:()=>denied(),
        root:id=>{check(id);return shells.root(id);},
        execute:async(id,command,timeout,signal)=>{
            await checkAsync(id);if(!execute){denied();}
            return shells.execute(id,command,timeout,signal);
        },
        executeIsolated:async(id,command,timeout,signal)=>{
            await checkAsync(id);if(!execute||!shells.executeIsolated){denied();}
            return shells.executeIsolated(id,command,timeout,signal);
        },
        startBackground:async(id,command,timeout,signal)=>{
            await checkAsync(id);if(!execute||!shells.startBackground){denied();}
            return shells.startBackground(id,command,timeout,signal);
        },
        backgroundStatus:async(id,jobId,maxOutput)=>{
            await checkAsync(id);if(!execute||!shells.backgroundStatus){denied();}
            return shells.backgroundStatus(id,jobId,maxOutput);
        },
        listBackgroundJobs:async(id,max)=>{
            await checkAsync(id);if(!execute||!shells.listBackgroundJobs){denied();}
            return shells.listBackgroundJobs(id,max);
        },
        cancelBackground:async(id,jobId)=>{
            await checkAsync(id);if(!execute||!shells.cancelBackground){denied();}
            return shells.cancelBackground(id,jobId);
        },
        setAlias:async()=>denied(),
        // Remote gateways must not enumerate unrelated workspaces.
        windows:()=>[],
        native:async(id:string,kind:NativeKind,args:NativeArgs)=>{
            await checkAsync(id);
            if(!shells.native){denied();}
            // Native tools implemented by MultiShell are read-only.
            return shells.native(id,kind,args);
        },
        skillList:async(id,scope,_includeGlobal,options)=>{
            await checkAsync(id);if(!shells.skillList){denied();}
            return shells.skillList(id,scope,false,{...options,includeGlobal:false});
        },
        skillRead:async(id,skillPath,options)=>{
            check(id);if(!shells.skillRead){denied();}
            return shells.skillRead(id,skillPath,{...options,includeGlobal:false});
        },
        skillFile:async(id,skillPath,file,encoding,options)=>{
            check(id);if(!shells.skillFile){denied();}
            return shells.skillFile(id,skillPath,file,encoding,{...options,includeGlobal:false});
        },
        skillManifest:async(id,skillPath,options)=>{
            check(id);if(!shells.skillManifest){denied();}
            return shells.skillManifest(id,skillPath,{...options,includeGlobal:false});
        }
    };
}
/** Constant-time comparison for bearer values. Reject malformed/multi-value
 * headers; never emit secrets to logs or send them to the Webview snapshot.
 */
export function validBearer(header:unknown,secret:string):boolean{
    if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)||
        typeof secret!=='string'||secret.length!==43){return false;}
    const presented=Buffer.from(header.slice(7),'ascii');
    const expected=Buffer.from(secret,'ascii');
    return presented.length===expected.length&&timingSafeEqual(presented,expected);
}