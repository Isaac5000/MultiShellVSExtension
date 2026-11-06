import * as path from 'path';
import * as fs from 'fs';
import {randomUUID} from 'crypto';
import { z } from 'zod';
import {ToolRegistry} from './tool-registry';
import type {CallToolResult} from '@modelcontextprotocol/server';
import { ShellApi } from '../shell-api';

const MAX_FILES = 3000;
/** A line replacement rebuilds the entire file in memory; cap its size. */
const MAX_EDIT_BYTES = 32*1024*1024;
const ignored = new Set(['.git','node_modules','.gradle','build','dist']);
function reply(x: unknown, isError = false): CallToolResult {
    return { isError, content: [{ type: 'text', text: typeof x === 'string' ? x : JSON.stringify(x) }] };
}
/** Reject escapes (including existing symlinks and ancestors for new files). */
export function scopedPath(root: string, file: string): string {
    if (!file || path.isAbsolute(file) || /^[a-zA-Z]:/.test(file)) {
        throw new Error('Only relative paths inside this shell working directory are permitted.');
    }
    const target = path.resolve(root, file);
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error('Path escapes the shell working directory.');
    }
    let ancestor = target;
    // lstat detects dangling links, which existsSync alone would miss.
    while (true) {
        try {
            const stat = fs.lstatSync(ancestor);
            if (stat.isSymbolicLink() && !fs.existsSync(ancestor)) {
                throw new Error('Dangling symbolic link is not allowed.');
            }
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
            const parent = path.dirname(ancestor);
            if (parent === ancestor) { throw new Error('Path cannot be resolved.'); }
            ancestor = parent;
        }
    }
    const realAncestor = fs.realpathSync(ancestor);
    const realRelative = path.relative(fs.realpathSync(root), realAncestor);
    if (realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) {
        throw new Error('Symbolic link escapes the shell working directory.');
    }
    return target;
}
/** Bind scoped reads to an opened descriptor and recheck containment and
 * identity before exposing data. Refuse FIFOs and devices. Native openat2
 * would be required for a complete ancestor-rename guarantee on Linux. */
async function openScopedFile(root:string,file:string):Promise<{
    handle:fs.promises.FileHandle;identity:fs.Stats
}>{
    const absolute=scopedPath(root,file);
    const inspected=await fs.promises.stat(absolute);
    if(!inspected.isFile()){throw new Error('Only regular files may be read.');}
    const flags=fs.constants.O_RDONLY|
        (process.platform==='win32'?0:fs.constants.O_NONBLOCK);
    const handle=await fs.promises.open(absolute,flags);
    try{
        const identity=await handle.stat();
        if(!identity.isFile()){throw new Error('Only regular files may be read.');}
        await validateOpenedFile(root,file,identity);
        return {handle,identity};
    }catch(error){await handle.close();throw error;}
}
async function validateOpenedFile(root:string,file:string,identity:fs.Stats):Promise<void>{
    const absolute=scopedPath(root,file);
    const current=await fs.promises.stat(absolute);
    if(!current.isFile()||current.dev!==identity.dev||current.ino!==identity.ino){
        throw new Error('File path changed during scoped operation; request denied.');
    }
}
/** Read only requested UTF-8 lines from a verified descriptor. */
async function readRange(input: fs.ReadStream, startLine: number, endLine: number, limit: number): Promise<string> {
    const first=startLine>0?startLine:1;
    const last=endLine>0?endLine:Number.POSITIVE_INFINITY;
    if(last<first){throw new Error('Invalid line range.');}
    let line=1,part='',result='',included=0;
    const append=(value:string)=>{
        if(line>=first && line<=last){
            if(result.length+part.length+value.length>limit+1){
                throw new Error('Result exceeds maxCharacters.');
            }
            part+=value;
        }
    };
    const finish=()=>{
        if(line>=first && line<=last){
            const normalized=part.endsWith('\r')?part.slice(0,-1):part;
            const separator=included?1:0;
            if(result.length+separator+normalized.length>limit){
                throw new Error('Result exceeds maxCharacters.');
            }
            if(included){result+='\n';}
            result+=normalized;
            included++;
        }
        part='';
        line++;
    };
    try {
        for await(const chunk of input){
            const text=String(chunk);
            let pos=0;
            while(pos<text.length){
                const newline=text.indexOf('\n',pos);
                if(newline<0){append(text.slice(pos));break;}
                append(text.slice(pos,newline));
                finish();
                if(line>last){return result;}
                pos=newline+1;
            }
        }
        // split(/\r?\n/) includes a final empty line when the file ends in LF.
        finish();
        if(first>=line){throw new Error('Invalid line range.');}
        return result;
    }finally{input.destroy();}
}
/** Serialize competing file edits from requests in this extension process. */
const pendingPaths=new Map<string,Promise<void>>();
async function withFileLocks<T>(paths:readonly string[],operation:()=>Promise<T>):Promise<T>{
    const keys=[...new Set(paths.map(p=>{
        const full=path.resolve(p);
        return process.platform==='win32'?full.toLowerCase():full;
    }))].sort();
    const acquired:Array<{key:string;token:Promise<void>;release:()=>void}>=[];
    try{
        for(const key of keys){
            const previous=pendingPaths.get(key)??Promise.resolve();
            let release:()=>void=()=>{};
            const token=new Promise<void>(done=>{release=done;});
            pendingPaths.set(key,token);
            await previous;
            acquired.push({key,token,release});
        }
        return await operation();
    }finally{
        for(const {key,token,release} of acquired.reverse()){
            if(pendingPaths.get(key)===token){pendingPaths.delete(key);}
            release();
        }
    }
}
/** Publish a complete replacement or leave the original untouched on write failure. */
async function atomicWriteFile(target:string,contents:string,overwrite=true,root?:string):Promise<void>{
    const temporary=path.join(path.dirname(target),
        '.'+path.basename(target)+'.multishell-'+randomUUID()+'.tmp');
    try{
        if(root){scopedPath(root,path.relative(root,temporary));}
        await fs.promises.writeFile(temporary,contents,{flag:'wx',encoding:'utf-8'});
        // Detect a parent swap after staging but BEFORE the final replacement.
        if(root){
            scopedPath(root,path.relative(root,temporary));
            scopedPath(root,path.relative(root,target));
        }
        if(overwrite){await fs.promises.rename(temporary,target);}
        else{await fs.promises.link(temporary,target);}
    }finally{
        await fs.promises.rm(temporary,{force:true}).catch(()=>{});
    }
}
/** A hard link provides a filesystem-level no-replace operation for regular files. */
async function safeMove(source:string,target:string,overwrite:boolean):Promise<void>{
    if(overwrite){await fs.promises.rename(source,target);return;}
    const stat=await fs.promises.lstat(source);
    if(stat.isFile()){
        await fs.promises.link(source,target);
        try{await fs.promises.unlink(source);}
        catch(error){
            await fs.promises.unlink(target).catch(()=>{});
            throw error;
        }
        return;
    }
    // Portable Node.js has no atomic rename-noreplace for directories.
    // Serialize extension requests and reject existing destinations.
    if(fs.existsSync(target)){throw new Error('Target already exists.');}
    await fs.promises.rename(source,target);
}
async function read(s: ShellApi, id: string, file: string): Promise<{ data: string; absolute: string }> {
    const root=s.root(id);
    const absolute=scopedPath(root,file);
    const {handle,identity}=await openScopedFile(root,file);
    try{
        if(identity.size>MAX_EDIT_BYTES){
            throw new Error('File too large for line replacement (32 MiB edit limit).');
        }
        const data=await handle.readFile({encoding:'utf-8'});
        if(Buffer.byteLength(data,'utf8')>MAX_EDIT_BYTES){
            throw new Error('File too large for line replacement (32 MiB edit limit).');
        }
        await validateOpenedFile(root,file,identity);
        return {data,absolute};
    }finally{await handle.close();}
}
async function list(s: ShellApi, id: string, file: string, recursive: boolean) {
    const root = s.root(id);
    const base = scopedPath(root, file);
    const files: Array<{ path: string; type: string }> = [];
    const visit = async (dir: string) => {
        // Do not trust a directory listing if a parent is swapped while an
        // asynchronous readdir is in progress. Check every returned name
        // against the current scoped directory, before returning any names.
        const relativeDir=path.relative(root,dir)||'.';
        scopedPath(root,relativeDir);
        const before=await fs.promises.stat(dir);
        if(!before.isDirectory()){throw new Error('Only directories can be listed.');}
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
            if (files.length >= MAX_FILES) { throw new Error('Too many files. List a smaller directory.'); }
            const full = scopedPath(root, path.relative(root, path.join(dir, entry.name)));
            let actual:fs.Stats;
            try{actual=await fs.promises.lstat(full);}
            catch{throw new Error('Directory contents changed during listing.');}
            if(actual.isDirectory()!==entry.isDirectory()||
                actual.isFile()!==entry.isFile()||
                actual.isSymbolicLink()!==entry.isSymbolicLink()){
                throw new Error('Directory contents changed during listing.');
            }
            const kind = entry.isDirectory() ? 'directory' : 'file';
            files.push({ path: path.relative(root, full).split(path.sep).join('/'), type: kind });
            if (recursive && entry.isDirectory() && !ignored.has(entry.name)) { await visit(full); }
        }
        scopedPath(root,relativeDir);
        const current=await fs.promises.stat(dir);
        if(!current.isDirectory()||before.dev!==current.dev||before.ino!==current.ino){
            throw new Error('Directory changed during listing.');
        }
    };
    await visit(base);
    return files;
}
const shellId = z.string().describe('REQUIRED shell ID or short alias (e.g. 1 or minecraft). Each operation must specify it.');
const relative = z.string().describe('Relative file path inside the selected shell initial working directory. No traversal.');
export function registerScopedFileTools(server: ToolRegistry, s: ShellApi, permissions = {file:true,edit:true}) {
    if (permissions.file) {
    server.tool('list_files_code','List files ONLY under an explicit shell_id root.',
        { shell_id: shellId, path: relative.optional().default('.'), recursive: z.boolean().optional().default(false) },
        async ({ shell_id, path: file, recursive }): Promise<CallToolResult> => {
            try { return reply(await list(s, shell_id, file, recursive)); }
            catch (e) { return reply({ error: String(e) }, true); }
        },{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
    server.tool('read_file_code','Read a file ONLY under the named shell root.',
        { shell_id: shellId, path: relative, encoding: z.string().optional().default('utf-8'),
          maxCharacters: z.number().int().min(1).max(2_000_000).optional().default(100000),
          startLine: z.number().int().optional().default(-1), endLine: z.number().int().optional().default(-1) },
        async ({ shell_id, path: file, encoding, maxCharacters, startLine, endLine }): Promise<CallToolResult> => {
            try {
                if(encoding!=='base64'&&encoding!=='utf-8'&&encoding!=='utf8'){
                    throw new Error('Only utf-8 or base64 encoding supported.');
                }
                const root=s.root(shell_id);
                const {handle,identity}=await openScopedFile(root,file);
                try{
                    if(encoding==='base64'){
                        if(Math.ceil(identity.size/3)*4>maxCharacters){
                            throw new Error('Result exceeds maxCharacters.');
                        }
                        const data=await handle.readFile();
                        await validateOpenedFile(root,file,identity);
                        return reply(data.toString('base64'));
                    }
                    const input=handle.createReadStream({
                        encoding:'utf8',highWaterMark:64*1024,autoClose:false
                    });
                    const data=await readRange(input,startLine,endLine,maxCharacters);
                    await validateOpenedFile(root,file,identity);
                    return reply(data);
                }finally{await handle.close();}
            } catch (e) { return reply({ error: String(e) }, true); }
        },{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
    }
    if (permissions.edit) {
    server.tool('create_file_code','Create or overwrite a file ONLY inside the named shell root. Explicit shell_id required.',
        { shell_id: shellId, path: relative, content: z.string(), overwrite: z.boolean().optional().default(false), ignoreIfExists: z.boolean().optional().default(false) },
        async ({ shell_id, path: file, content, overwrite, ignoreIfExists }): Promise<CallToolResult> => {
            try {
                const absolute=scopedPath(s.root(shell_id),file);
                return await withFileLocks([absolute],async()=>{
                    await fs.promises.mkdir(path.dirname(absolute),{recursive:true});
                    scopedPath(s.root(shell_id),file);
                    if(ignoreIfExists && fs.existsSync(absolute)){return reply({skipped:file});}
                    await atomicWriteFile(absolute,content,overwrite,s.root(shell_id));
                    return reply({shell_id,created:file});
                });
            } catch(e) { return reply({ error: String(e) }, true); }
        });
    server.tool('replace_lines_code','Replace lines after checking their original text. Only within the selected shell root.',
        { shell_id: shellId, path: relative, startLine: z.number().int().min(1), endLine: z.number().int().min(1), content: z.string(), originalCode: z.string() },
        async ({ shell_id, path: file, startLine, endLine, content, originalCode }): Promise<CallToolResult> => {
            try {
                const target=scopedPath(s.root(shell_id),file);
                return await withFileLocks([target],async()=>{
                    const {data,absolute}=await read(s,shell_id,file);
                    const eol=data.includes('\r\n')?'\r\n':'\n';
                    const lines=data.split(/\r?\n/);
                    if(endLine<startLine||endLine>lines.length){throw new Error('Invalid line range.');}
                    const old=lines.slice(startLine-1,endLine).join('\n');
                    if(old!==originalCode.replace(/\r\n/g,'\n')){throw new Error('Original code has changed; no write performed.');}
                    const replacement=content.replace(/\r\n/g,'\n').split('\n');
                    lines.splice(startLine-1,endLine-startLine+1,...replacement);
                    const updated=lines.join(eol);
                    if(Buffer.byteLength(updated,'utf8')>MAX_EDIT_BYTES){
                        throw new Error('Updated file exceeds the 32 MiB edit limit.');
                    }
                    if((await read(s,shell_id,file)).data!==data){
                        throw new Error('Concurrent file change detected; retry.');
                    }
                    await atomicWriteFile(absolute,updated,true,s.root(shell_id));
                    return reply({shell_id,updated:file,startLine,endLine});
                });
            } catch(e) { return reply({ error: String(e) }, true); }
        });
    server.tool('copy_file_code','Copy file within an explicit shell root.',
        { shell_id: shellId, sourcePath: relative, targetPath: relative, overwrite: z.boolean().optional().default(false) },
        async ({ shell_id, sourcePath, targetPath, overwrite }): Promise<CallToolResult> => {
            try {
                const root=s.root(shell_id);
                const source=scopedPath(root,sourcePath),target=scopedPath(root,targetPath);
                return await withFileLocks([source,target],async()=>{
                    await fs.promises.mkdir(path.dirname(target),{recursive:true});
                    scopedPath(root,sourcePath);scopedPath(root,targetPath);
                    const temporary=path.join(path.dirname(target),
                        '.'+path.basename(target)+'.multishell-'+randomUUID()+'.tmp');
                    try{
                        await fs.promises.copyFile(source,temporary,fs.constants.COPYFILE_EXCL);
                        scopedPath(root,sourcePath);scopedPath(root,targetPath);
                        scopedPath(root,path.relative(root,temporary));
                        if(overwrite){await fs.promises.rename(temporary,target);}
                        else{await fs.promises.link(temporary,target);}
                    }finally{
                        await fs.promises.rm(temporary,{force:true}).catch(()=>{});
                    }
                    return reply({shell_id,copied:sourcePath,to:targetPath});
                });
            } catch(e) {return reply({error:String(e)},true);}
        });
    server.tool('move_file_code','Move a file within an explicit shell root. Existing targets cannot be overwritten.',
        { shell_id: shellId, sourcePath: relative, targetPath: relative, overwrite: z.boolean().optional().default(false) },
        async ({ shell_id, sourcePath, targetPath, overwrite }): Promise<CallToolResult> => {
            try {
                const root=s.root(shell_id);
                const source=scopedPath(root,sourcePath),target=scopedPath(root,targetPath);
                return await withFileLocks([source,target],async()=>{
                    await fs.promises.mkdir(path.dirname(target),{recursive:true});
                    scopedPath(root,sourcePath);scopedPath(root,targetPath);
                    await safeMove(source,target,overwrite);
                    return reply({shell_id,moved:sourcePath,to:targetPath});
                });
            } catch(e) {return reply({error:String(e)},true);}
        });
    server.tool('rename_file_code','Rename a file within the named shell root.',
        { shell_id: shellId, filePath: relative, newName: z.string(), overwrite: z.boolean().optional().default(false) },
        async ({ shell_id, filePath, newName, overwrite }): Promise<CallToolResult> => {
            try {
                if (newName === '.' || newName === '..' || path.basename(newName) !== newName) { throw new Error('newName must be a filename only.'); }
                const root=s.root(shell_id);
                const source=scopedPath(root,filePath);
                const target=scopedPath(root,path.join(path.dirname(filePath),newName));
                return await withFileLocks([source,target],async()=>{
                    scopedPath(root,filePath);
                    scopedPath(root,path.join(path.dirname(filePath),newName));
                    await safeMove(source,target,overwrite);
                    return reply({shell_id,renamed:filePath,to:newName});
                });
            } catch(e) {return reply({error:String(e)},true);}
        });
    }
}