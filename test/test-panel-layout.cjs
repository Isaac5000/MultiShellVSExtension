'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,'src/panel.ts'),'utf8');
const css=fs.readFileSync(path.join(root,'media/panel.css'),'utf8');
const js=fs.readFileSync(path.join(root,'media/panel.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'Extension package must declare a semantic version');
assert.doesNotThrow(()=>new vm.Script(js,{filename:'panel.js'}));
assert.ok(html.includes('vscode.env.language.toLowerCase().startsWith(\'es\')'),'Panel locale must follow VS Code language');
assert.doesNotMatch(html,/Ã.|Â¿|â€“/u,'Mojibake must not appear in Spanish labels or notices');
for (const required of [
    'id="connection"','id="tabShells"','id="tabWindows"',
    'id="shellsPage"','id="windowsPage"','id="createPanel"',
    'id="shellForm"','id="searchShells"','id="copyWindow"',
    'role="tabpanel"','aria-selected="true"'
])assert.ok(html.includes(required),'Missing UI: '+required);
for(const required of [
    'renderShells','renderWindows','copyInstruction','switchPage',
    'setForm','handleTabKeys',"document.createElementNS",
    'prefers-reduced-motion'
].filter(x=>x!=='prefers-reduced-motion'))assert.ok(js.includes(required),'Missing UI implementation: '+required);
assert.ok(css.includes('prefers-reduced-motion'),'Reduced-motion support missing');
assert.ok(css.includes('grid-template-columns:minmax(0,1fr) auto'),'Text and action buttons must occupy independent grid columns');
assert.ok(css.includes('.shell-row.menu-open { z-index: 40;'),'Open dropdown row must paint above all other shell buttons');
assert.ok(js.includes("'log-out': ["),'Automatic exit needs a distinct log-out icon');
assert.ok(js.includes("'shield-check': ["),'MCP recovery needs a distinct shield icon');
assert.ok(js.includes("commandButton('shield-check',t('enableRestored')"),
  'Restored terminal recovery button must use the shield icon');
assert.ok(js.includes("'log-out',\n          t(shell.auto_exit_interactive"),
  'Automatic interactive exit must use the log-out icon');
assert.ok(js.includes("item.classList.toggle('menu-open'"),'Open dropdown must elevate owning row');
assert.ok(!html.includes('id="language"'),'Manual language dropdown must not be rendered');
assert.ok(!js.includes("send('language'"),'Manual locale switching must not be available');
assert.ok(css.includes('.row-details { min-width:0;'),'Text must shrink and truncate without moving actions');
assert.ok(js.includes('requestClose(shell)'),'Close action must use one guarded handler');
assert.ok(!js.includes('window.confirm('),'Close confirmation must be handled by VSCode, not the webview');
assert.ok(js.includes("send('close',{id})"),'Close request must reach the extension host');
assert.ok(js.includes("data.type === 'closeCancelled'"),'Closing state must recover when user cancels');
assert.ok(html.includes("raw.type === 'show' || raw.type === 'close'"),'Extension host must handle physical terminal close');
assert.ok(html.includes('showWarningMessage('),'Close requires native VSCode confirmation');
assert.ok(js.includes("commandButton('message', t('copyInstruction')"),'Copy instructions button should remain visible');
assert.ok(fs.statSync(path.join(root,'media/logo.png')).size>5000,'Original marketplace icon must be bundled');
assert.ok(fs.readFileSync(path.join(root,'media/multishell.svg'),'utf8').includes('two independent terminals'),'Custom sidebar icon missing');
assert.ok(css.includes('var(--vscode-'),'Theme CSS tokens missing');
assert.ok(css.includes('@media (max-width: 280px)'),'Narrow sidebar CSS missing');
assert.ok(js.includes("const es = {")&&js.includes("const en = {"),'Both language dictionaries required');
assert.ok(js.includes('shell.alias') && js.includes("send('alias'"),'Alias editor and short selector missing');
assert.ok(!js.includes('.innerHTML='),'Untrusted user content must not be inserted as HTML');
console.log('PASS: compact multilingual panel, elevated menus, VS Code locale, safe dynamic text, SVG icons and responsive layout');