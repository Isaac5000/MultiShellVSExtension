'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mustNotExist=[
 'persistent-agent',
 'src/continuation-demo.ts',
 'src/continuation-goals.ts',
 'src/continuation-runner.ts',
 'docs/es/continuacion-automatica.md',
 'docs/en/automatic-continuation.md',
 'docs/es/agente-persistente.md',
 'docs/en/persistent-agent.md'
];
for(const file of mustNotExist){
 assert.equal(fs.existsSync(path.join(root,file)),false,
  'Unsupported autonomous ChatGPT-chat prototype still exists: '+file);
}
for(const file of ['src/panel.ts','src/panel-markup.ts','media/panel.js']){
 const source=read(file);
 assert.doesNotMatch(source,/continuation_demo|continuation_sim_|continuationDemo|continuationStart|continuationObjective/,
  'Fake chat continuation must not appear in the VS Code UI: '+file);
}
const packageJson=JSON.parse(read('package.json'));
assert.equal(packageJson.scripts['agent:help'],undefined);
assert.equal(packageJson.scripts['agent:list'],undefined);
assert.doesNotMatch(read('scripts/bundle.cjs'),/mcp-sdk-entry|mcp-sdk-client/,
 'Obsolete standalone agent must not be bundled');
assert.doesNotMatch(read('README.md'),/docs\/(?:es\/(?:agente-persistente|continuacion-automatica)|en\/(?:persistent-agent|automatic-continuation))\.md/,
 'README must not promote removed prototypes');
for(const file of [
 'src/tools/chat-handoff-tools.ts',
 'src/chat-handoff-store.ts',
 'test/test-chat-handoff-store.cjs',
 'test/test-chat-handoff-tools.cjs',
 'test/test-chat-handoff-http.cjs'
]){
 assert.ok(fs.existsSync(path.join(root,file)), 'Real checkpoint feature must remain: '+file);
}
assert.match(read('src/tools/mcp-v2-server.ts'),/registerChatHandoffTools/);
assert.match(read('src/tools/chat-handoff-tools.ts'),/chat_handoff_load_code/);
assert.match(read('src/tools/chat-handoff-tools.ts'),/chat_handoff_save_code/);
assert.match(read('src/tools/chat-handoff-tools.ts'),/chat_handoff_list_code/);
console.log('PASS: unsupported pseudo-chat agents removed, only real MCP handoff remains');
