'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {renderPanelMarkup}=require('../out/panel-markup.js');

const source='vscode-resource://test-source',nonce='test-nonce-123';
const script='vscode-resource://test/panel.js';
const css='vscode-resource://test/panel.css';
const markup=renderPanelMarkup(source,script,css,nonce);
const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'HTML ids must be unique');
assert.ok(ids.includes('requestsCount'),'Required requests view must be present');
const client=fs.readFileSync(path.join(__dirname,'../media/panel.js'),'utf8');
for(const [,id] of client.matchAll(/\$\('([^']+)'\)/g)){
 assert.ok(ids.includes(id),'Missing element referenced by webview JS: '+id);
}
assert.match(markup,/default-src 'none'; img-src vscode-resource:\/\/test-source; style-src vscode-resource:\/\/test-source; script-src 'nonce-test-nonce-123' vscode-resource:\/\/test-source/);
assert.equal((markup.match(/<script\b/gi)||[]).length,1,'No unreviewed executable scripts');
assert.match(markup,/<script nonce="test-nonce-123" src="vscode-resource:\/\/test\/panel\.js"><\/script>/);
assert.match(markup,/<link href="vscode-resource:\/\/test\/panel\.css" rel="stylesheet">/);
assert.doesNotMatch(markup,/\s+on(?:click|load|error|mouseover|submit)\s*=/i,
 'Use event listeners rather than inline HTML handlers');
assert.ok(!markup.includes('requests-disclosure'));
const alternate=renderPanelMarkup(
 'vscode-resource://alternate-source',
 'vscode-resource://alternate/panel.js',
 'vscode-resource://alternate/panel.css',
 'other-nonce-456'
);
assert.match(alternate,/nonce-other-nonce-456/);
assert.match(alternate,/vscode-resource:\/\/alternate-source/);
assert.match(alternate,/src="vscode-resource:\/\/alternate\/panel\.js"/);
assert.match(alternate,/href="vscode-resource:\/\/alternate\/panel\.css"/);
const normalize=(text,src,js,style,key)=>text
 .replaceAll(src,'__CSP_SOURCE__').replaceAll(js,'__SCRIPT__')
 .replaceAll(style,'__STYLESHEET__').replaceAll(key,'__NONCE__');
assert.equal(
 normalize(markup,source,script,css,nonce),
 normalize(alternate,'vscode-resource://alternate-source',
  'vscode-resource://alternate/panel.js','vscode-resource://alternate/panel.css','other-nonce-456'),
 'Dynamic CSP/asset values must not alter unrelated static structure'
);
console.log('PASS: stable panel IDs, dynamic CSP/nonce, local assets and script integrity');
