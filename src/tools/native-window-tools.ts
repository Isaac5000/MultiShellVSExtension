import * as fs from 'fs';
import * as path from 'path';
import type * as VSCode from 'vscode';

export type NativeKind = 'diagnostics'|'symbols'|'document'|'definition';
export interface NativeArgs {
    file?:string;
    query?:string;
    line?:number;
    column?:number;
    symbol?:string;
    maxResults?:number;
    maxDepth?:number;
    severities?:number[];
    format?:'text'|'json';
    includeSource?:boolean;
}

/** Keep native VSCode language operations inside the exact owner window and shell root. */
export async function runNative(vscode:typeof VSCode, root:string, kind:NativeKind, args:NativeArgs = {}):Promise<unknown> {
    const cwd=fs.realpathSync(root);
    function within(file:string):boolean {
        const rel=path.relative(cwd,file);
        return rel!== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);
    }
    function absolute(file:string):string {
        if(!file || path.isAbsolute(file) || /^[a-zA-Z]:/.test(file)) {
            throw new Error('A relative file path within the selected shell is required.');
        }
        const resolved=path.resolve(cwd,file);
        if(!within(resolved)){throw new Error('File escapes the shell root.');}
        const actual=fs.realpathSync(resolved);
        if(!within(actual)){throw new Error('Symbolic link escapes the shell root.');}
        return actual;
    }
    const count=Math.max(1,Math.min(200, args.maxResults||75));
    const location=(uri:VSCode.Uri,range:VSCode.Range)=>({
        path:path.relative(cwd,uri.fsPath).split(path.sep).join('/'),
        line:range.start.line+1,
        column:range.start.character+1
    });
    if(kind==='diagnostics') {
        const entries=args.file
            ? [[vscode.Uri.file(absolute(args.file)),vscode.languages.getDiagnostics(vscode.Uri.file(absolute(args.file)))]] as Array<[VSCode.Uri,readonly VSCode.Diagnostic[]]>
            : vscode.languages.getDiagnostics();
        const severity=new Set(args.severities||[0,1]);
        const results:Array<{path:string;line:number;column:number;severity:number;message:string;source?:string}>=[];
        for(const [uri,items] of entries) {
            if(!uri.fsPath||!within(uri.fsPath)){continue;}
            for(const d of items){
                if(!severity.has(d.severity)){continue;}
                const row={...location(uri,d.range),severity:d.severity,message:d.message.slice(0,4096),
                    ...(args.includeSource===false?{}:{source:d.source||''})};
                results.push(row);
                if(results.length>=count){break;}
            }
            if(results.length>=count){break;}
        }
        if(args.format==='text') {
            return results.map(d=>d.path+':'+d.line+':'+d.column+' ['+d.severity+'] '+d.message+
                (d.source?' ('+d.source+')':'')).join('\n')||'No diagnostics found.';
        }
        return results;
    }
    if(kind==='symbols') {
        if(!args.query?.trim()){throw new Error('A nonempty symbol query is required.');}
        const symbols=await vscode.commands.executeCommand<VSCode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider',args.query);
        return (symbols||[]).filter(s=>s.location?.uri.fsPath&&within(s.location.uri.fsPath))
            .slice(0,count).map(s=>({name:s.name,container:s.containerName,kind:s.kind,...location(s.location.uri,s.location.range)}));
    }
    if(!args.file){throw new Error('File path required.');}
    const uri=vscode.Uri.file(absolute(args.file));
    if(kind==='definition') {
        const line=args.line??1;
        let column=args.column??1;
        if(!Number.isInteger(line)||line<1||!Number.isInteger(column)||column<1){
            throw new Error('Line and column are 1-based positive integers.');
        }
        if(args.symbol){
            const document=await vscode.workspace.openTextDocument(uri);
            if(line>document.lineCount){throw new Error('Line outside the document.');}
            const index=document.lineAt(line-1).text.indexOf(args.symbol);
            if(index<0){throw new Error('Symbol not present on the specified line.');}
            column=index+1;
        }
        const position=new vscode.Position(line-1,column-1);
        const defs=await vscode.commands.executeCommand<Array<VSCode.Location|VSCode.LocationLink>>(
            'vscode.executeDefinitionProvider',uri,position);
        const locations=(defs||[]).flatMap(d=>{
            const dest='targetUri' in d?d.targetUri:d.uri;
            const range='targetRange' in d?d.targetRange:d.range;
            return dest.fsPath&&within(dest.fsPath)?[location(dest,range)]:[];
        }).slice(0,count);
        if(!args.symbol){return locations;}
        let hover:string[]=[];
        try {
            const items=await vscode.commands.executeCommand<VSCode.Hover[]>('vscode.executeHoverProvider',uri,position);
            hover=(items||[]).flatMap(h=>h.contents.map(item=>{
                if(typeof item==='string'){return item;}
                return 'value' in item?item.value:'';
            })).slice(0,count).map(s=>s.slice(0,4000));
        }catch{ /* Some language servers do not expose hover data. */ }
        return {symbol:args.symbol,locations,hover};
    }
    if(kind==='document') {
        const nodes=await vscode.commands.executeCommand<Array<VSCode.DocumentSymbol|VSCode.SymbolInformation>>(
            'vscode.executeDocumentSymbolProvider',uri);
        const output:Array<{name:string;kind:number;path:string;line:number;column:number;depth:number}>=[];
        const maxDepth=Math.max(0,Math.min(20,args.maxDepth??9));
        const append=(items:readonly (VSCode.DocumentSymbol|VSCode.SymbolInformation)[],depth:number)=>{
            for(const s of items) {
                if(output.length>=count||depth>maxDepth){return;}
                const place='location' in s?s.location.range:s.range;
                output.push({name:s.name,kind:s.kind,...location(uri,place),depth});
                if('children' in s){append(s.children,depth+1);}
            }
        };
        append(nodes||[],0);
        return output;
    }
    throw new Error('Unknown native action.');
}
