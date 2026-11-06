'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const scripts=require('../package.json').scripts;
assert.match(scripts.package,/package-platform-tunnel\.cjs/,
 'npm run package must always build an integrated native VSIX');
assert.match(scripts.package,/npm run bundle/,
 'Native packaging must build the JS extension first');
assert.doesNotMatch(scripts.package,/\bvsce\s+package\b/,
 'Bare vsce package must not produce a separate unbundled VSIX');
assert.ok(!('package:platform' in scripts),'Remove redundant packaging alias');
assert.ok(!('package:integrated' in scripts),'Remove redundant packaging alias');
assert.match(scripts['package:all'],/npm run package\b/,
 'The combined command must build the integrated VSIX');
assert.match(scripts['package:all'],/npm run package:plugin\b/,
 'Keep the distinct optional plugin ZIP');
for(const cmd of ['scripts/build-install.ps1','scripts/validate-windows.ps1']){
 const text=source(cmd);
 assert.match(text,/npm run package\b|npm run package:all\b/,
  cmd+' must build the official bundled tunnel, not the generic VSIX');
 assert.doesNotMatch(text,/vsce(?:\.cmd)?\s+package/,
  cmd+' must not invoke bare VSIX packaging');
 assert.ok(text.includes("process.platform+'-'+process.arch"),
  cmd+' must derive the native target from Windows CPU architecture');
}
const portable=source('scripts/make-portable.py');
assert.match(portable,/platform_target|host_target/,
 'Portable source archives must include the matching integrated native VSIX');
assert.doesNotMatch(portable,/f"multi-shell-mcp-server-\{version\}\.vsix"/,
 'Portable archives must not require the obsolete generic VSIX');
const privacy=source('test/test-package-privacy.cjs');
assert.match(privacy,/process\.platform.*process\.arch|platformTag/,
 'Privacy test should inspect the native VSIX, not a missing generic VSIX');
const ci=source('.github/workflows/ci.yml');
assert.match(ci,/npm run package:all/,
 'CI must build the integrated VSIX and the separate plugin ZIP');
const guide=source('docs/es/instalacion.md');
assert.match(guide,/win32-x64\.vsix/,
 'Current Windows instructions must describe the one native VSIX');
console.log('PASS single VSIX distribution: native-only default, helpers, CI, portable ZIP and safety checks');
