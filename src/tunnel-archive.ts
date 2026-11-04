import * as fs from 'fs';
import * as path from 'path';
import {pipeline} from 'stream/promises';

/** Small allowlisted ZIP extractor. The archive is first authenticated by a
 * pinned SHA-256 digest; this also enforces file-level traversal/symlink guards.
 * Uses streaming extraction on Windows, Linux and macOS (no tar/unzip needed). */
export async function extractTunnelZip(archive:string,destination:string,
    platformTag:string,binary:string,companion:string):Promise<void>{
    const yauzl=require('yauzl') as typeof import('yauzl');
    const allowed=new Set([
        binary,companion,'cloudflared-manifest.json','LICENSE','NOTICE',
        'tunnel-client-v0.0.19-'+platformTag+'-licenses.txt',
        'tunnel-client-v0.0.19-'+platformTag+'.spdx.json'
    ]);
    await new Promise<void>((resolve,reject)=>{
        yauzl.open(archive,{lazyEntries:true,autoClose:true,decodeStrings:true,
            validateEntrySizes:true,strictFileNames:true},(openError,zip)=>{
            if(openError||!zip){reject(openError??new Error('Cannot open ZIP.'));return;}
            let finished=false,total=0,count=0;
            const seen=new Set<string>();
            const fail=(err:unknown)=>{
                if(finished){return;}
                finished=true;
                zip.close();
                reject(err instanceof Error?err:new Error(String(err)));
            };
            zip.on('error',fail);
            zip.on('entry',entry=>{
                if(finished){return;}
                const name=entry.fileName;
                const unixKind=(entry.externalFileAttributes>>>16)&0o170000;
                if(!allowed.has(name)||name.includes('/')||name.includes('\\')||
                    name==='.'||name==='..'||path.basename(name)!==name||
                    unixKind===0o120000||seen.has(name)||
                    ++count>12||entry.uncompressedSize>125*1024*1024||
                    (total+=entry.uncompressedSize)>180*1024*1024){
                    fail(new Error('Unsafe or unexpected ZIP entry rejected.'));
                    return;
                }
                zip.openReadStream(entry,(readError,stream)=>{
                    if(readError||!stream){fail(readError??new Error('Cannot read ZIP entry.'));return;}
                    void pipeline(stream,fs.createWriteStream(path.join(destination,name),
                        {flags:'wx',mode:0o600})).then(()=>{
                        if(finished){return;}
                        seen.add(name);
                        zip.readEntry();
                    },fail);
                });
            });
            zip.on('end',()=>{
                if(finished){return;}
                if(!seen.has(binary)||!seen.has(companion)){
                    fail(new Error('Required Tunnel Client files are missing from ZIP.'));return;
                }
                finished=true;resolve();
            });
            zip.readEntry();
        });
    });
}
