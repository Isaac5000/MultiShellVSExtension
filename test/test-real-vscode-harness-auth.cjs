'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const file of ['test/vscode-connection-window.cjs','test/vscode-terminal-integration.cjs']){
 const src=read(file);
 assert.match(src,/localMcpHeaders\(\)/,'Actual real VS Code MCP calls must attach local credentials: '+file);
}
const driver=read('scripts/run-vscode-connection-tests.cjs');
assert.match(driver,/'x-multishell-local-auth':token/);
assert.match(driver,/MULTISHELL_TEST_TOKEN_FILE/);
const terminal=read('scripts/run-vscode-terminal-tests.cjs');
assert.match(terminal,/MULTISHELL_TEST_TOKEN_FILE/);
assert.match(terminal,/multishell-local-token/);
console.log('PASS isolated VSCode integration harnesses use the same on-disk local token as the extension');
