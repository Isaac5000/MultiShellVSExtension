'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const router=read('src/multi-window.ts');
const panel=read('src/panel.ts');
const client=read('media/panel.js');
assert.match(router,/background_jobs\s*:/,'Local panel snapshots must include their worker-owned job states.');
assert.match(panel,/raw\.type==='cancel_background'/,'The local user must be able to cancel an isolated job explicitly.');
assert.match(client,/background_jobs/,'The panel must render asynchronous job state.');
assert.match(client,/backgroundRunning/,'Active job indicators must be localized.');
assert.match(client,/cancel_background/,'Cancel actions must use the local panel permission channel.');
assert.match(client,/active\.command_label/,'Active jobs should reveal a safe executable label.');
assert.match(client,/active\.input_hint/,'Potential interactive waits must be surfaced, never answered automatically.');
assert.doesNotMatch(client,/innerHTML\s*=.*background/i,
 'Job output must not be injected into the HTML document.');
console.log('PASS panel shows local jobs and controlled cancellation without raw HTML injection');
