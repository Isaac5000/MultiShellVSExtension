import * as fs from 'node:fs';

/** Metadata-only fingerprint. Reused digests/frontmatter must belong to the
 * same file identity and timestamp. Never bypass path authorization to use it.
 * A full read still performs descriptor-based change detection.
 */
export function skillRegularFileStamp(file:string):string{
    const stat=fs.lstatSync(file,{bigint:true});
    if(!stat.isFile()||stat.isSymbolicLink()){
        throw new Error('Skill resource is not a regular file.');
    }
    return [stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,
        stat.mtimeNs,stat.ctimeNs].join(':');
}
