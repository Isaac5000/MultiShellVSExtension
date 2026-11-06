'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(base,'src/panel.ts'),'utf8')+
  fs.readFileSync(path.join(base,'src/panel-markup.ts'),'utf8');
const client=fs.readFileSync(path.join(base,'media/panel.js'),'utf8');
const setup=fs.readFileSync(path.join(base,'plugins/multishell-mcp/skills/setup/SKILL.md'),'utf8');
const guideCodes=[
 'chatgptGuidePlatformTitle','chatgptGuidePlatformTunnel','chatgptGuidePlatformKey',
 'chatgptGuideLocalTitle','chatgptGuideLocalSetup','chatgptGuidePluginTitle',
 'chatgptGuidePluginOpen','chatgptGuidePluginFields','chatgptGuidePluginAuth',
 'chatgptGuidePluginCreate','chatgptGuideWarning'
];
for(const key of guideCodes){
 assert.ok(markup.includes('data-i18n="'+key+'"'),'Missing ChatGPT UI label '+key);
 const matches=[...client.matchAll(new RegExp('^\\s*'+key+':','gm'))];
 assert.equal(matches.length,2,'Guide label must be translated in Spanish and English: '+key);
}
for(const [action,id,url] of [
 ['ai_chatgpt_tunnels','chatgptOpenTunnels','https://platform.openai.com/settings/organization/tunnels'],
 ['ai_chatgpt_runtime_keys','chatgptOpenRuntimeKeys','https://platform.openai.com/settings/organization/api-keys'],
 ['ai_chatgpt_chat','chatgptOpenChat','https://chatgpt.com/'],
 ['ai_chatgpt_guide','chatgptOpenMcpGuide','https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt']
]){
 assert.ok(markup.includes('id="'+id+'"'),'Required ChatGPT setup button '+id);
 assert.ok(client.includes("aiAction('"+action+"')"),'Button not connected: '+action);
 assert.ok(markup.includes(action), 'Host action unavailable: '+action);
 assert.ok(markup.includes(url),'Host link not allowlisted: '+url);
}
for(const item of ['Connection: Tunnel','Tunnels Read + Use','Tunnels Read + Manage',
  'Create as a plugin','Add custom MCP server','tunnel_id']){
 assert.ok(client.includes(item)||setup.includes(item),'Missing current ChatGPT MCP requirement: '+item);
}
assert.match(setup,/Never enter the tunnel runtime API key in the ChatGPT plugin form/);
assert.match(client,/NO introduzcas aquí la API key de ejecución del túnel/);
assert.ok(!markup.includes('id="chatgptOfficialClient"'));
assert.ok(!markup.includes('id="chatgptOpenPlatform"'));
console.log('PASS: bilingual ChatGPT custom MCP plugin requirements, Platform runtime key, same tunnel ID, official links and key separation');
