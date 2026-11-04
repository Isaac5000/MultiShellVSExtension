'use strict';
const assert=require('node:assert/strict');
const proxyquire=require('proxyquire').noCallThru();
const {recognizedInteractiveCommand,hasAmbiguousInteractiveEscapes,detectInputWaitHint}=
  proxyquire('../out/shell-manager.js',{vscode:{}});

// A misplaced quote/escape must NEVER trigger automated keystrokes. Both
// PowerShell and POSIX escaping conventions are possible in VS Code terminals.
const malformed=[
 'less "unclosed',
 "less 'unclosed",
 'more "unclosed',
 'man "quoted file',
 'top "unfinished',
 'less "C:\\folder\\"',
 'less file\\ name.txt',
 'less file\\',
 'less \\"quoted\\"',
 'less file\\$HOME',
 'more file\\;something',
 'less file\t.txt',
 'less file\u001b[0m',
 'less file\u0000ignored',
 'less file\n',
 '\tless file',
 'less file\r'
];
for(const command of malformed){
  assert.equal(hasAmbiguousInteractiveEscapes(command),true,
    'Malformed or escaped command must be considered ambiguous: '+JSON.stringify(command));
  assert.equal(recognizedInteractiveCommand(command),undefined,
    'No automatic q may be sent to a malformed command: '+JSON.stringify(command));
}
for(const safe of [
 'less readme.txt',
 'less "my document.txt"',
 "more 'manual chapter.txt'",
 'man ls',
 'top',
 'less C:\\Data\\notes.txt'
]){
  assert.equal(hasAmbiguousInteractiveEscapes(safe),false,
    'Balanced, unambiguous command should remain eligible: '+safe);
  assert.ok(recognizedInteractiveCommand(safe),
    'Known pager should still be recognized: '+safe);
}
// Recognizing PowerShell's >> continuation prompt is strictly informational,
// not an authorization to interrupt, terminate or send a newline.
for(const output of ['PS C:\\work> less "file\n>> ', 'waiting\n>>', '\u001b[31m>> \u001b[0m']){
  assert.equal(detectInputWaitHint(output),'continuation');
}
assert.equal(detectInputWaitHint('one >> two\nfinished'),undefined);
assert.equal(detectInputWaitHint('Password:'),'credentials');
console.log('PASS: escaped/unterminated quotes and continuation prompts cannot cause unsafe automatic exit');