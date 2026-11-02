'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const plugin=path.join(root,'plugins','multishell-mcp');
const pkg=require('../package.json');
const manifest=JSON.parse(fs.readFileSync(path.join(plugin,'plugin.json'),'utf8'));
const mcp=JSON.parse(fs.readFileSync(path.join(plugin,'mcp.json'),'utf8'));
const marketplace=JSON.parse(fs.readFileSync(path.join(root,'.agents/plugins/marketplace.json'),'utf8'));
assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
assert.equal(manifest.name,'multishell-mcp');
assert.equal(manifest.version,pkg.version);
assert.equal(manifest.license,'MIT');
assert.equal(manifest.extensions['com.openai'].onboardingSkill,'./skills/setup/SKILL.md');
assert.ok(fs.existsSync(path.join(plugin,manifest.extensions['com.openai'].onboardingSkill)));
assert.equal(mcp.$schema,'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
assert.deepEqual(Object.keys(mcp.mcpServers),['multishell']);
const server=mcp.mcpServers.multishell;
assert.equal(server.type,'streamable-http');
assert.equal(server.url,'http://127.0.0.1:3000/mcp');
assert.equal(server.extensions['com.openai'].auth.type,'none');
assert.equal(marketplace.name,'multishell-local');
assert.ok(marketplace.plugins.some(p=>p.name===manifest.name &&
  p.source.source==='local' && p.source.path==='./plugins/multishell-mcp'));
const original=path.join(root,'.agents/skills/multishell-mcp');
for(const file of ['SKILL.md','references/tool-guide.md']){
 assert.equal(fs.readFileSync(path.join(plugin,'skills/multishell-mcp',file),'utf8').trimEnd(),
   fs.readFileSync(path.join(original,file),'utf8').trimEnd(),
   'Bundled plugin skill must match the repo skill');
}
const setup=fs.readFileSync(path.join(plugin,'skills/setup/SKILL.md'),'utf8');
assert.match(setup,/^---\r?\nname: setup\r?\ndescription:/);
assert.match(setup,/cloud cannot reach this loopback/i);
assert.match(setup,/Do not expose the unauthenticated local endpoint/i);
assert.match(fs.readFileSync(path.join(root,'.vscodeignore'),'utf8'),/^plugins\/\*\*$/m);
assert.match(fs.readFileSync(path.join(root,'.vscodeignore'),'utf8'),/^multi-shell-mcp-plugin-\*\.zip$/m);

assert.match(fs.readFileSync(path.join(root,'.gitignore'),'utf8'),/^multi-shell-mcp-plugin-\*\.zip$/m);
assert.ok(fs.existsSync(path.join(root,'scripts/package-plugin.cjs')));
console.log('PASS: portable ChatGPT/Codex plugin, onboarding, local MCP connection, repo marketplace, skill source sync, packaging exclusions');