'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist/extension.js');
assert.ok(fs.existsSync(output),'Bundle was not produced');
const code=fs.readFileSync(output,'utf8');
for(const name of ['get_diagnostics_code','get_document_symbols_code','search_symbols_code',
 'get_symbol_definition_code','read_file_code','execute_shell_command_code',
 'multi-shell-mcp.sessions']){
 assert.ok(code.includes(name),'Bundle missing '+name);
}
assert.doesNotThrow(()=>new (require('node:vm').Script)(code,{filename:'extension.js'}));
const vscode={window:{createOutputChannel:()=>({appendLine(){},show(){},dispose(){}})}};
const bundled=require('proxyquire').noCallThru()(output,{vscode});
assert.equal(typeof bundled.activate,'function');
assert.equal(typeof bundled.deactivate,'function');
console.log('PASS: self-contained executable bundle, native code tools, MCP and VSCode extension exports');
