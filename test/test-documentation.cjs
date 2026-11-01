'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
const es=['instalacion.md','uso.md','compatibilidad.md','validacion.md','historial.md'];
const en=['installation.md','usage.md','compatibility.md','validation.md','changelog.md'];
const files=['README.md','CHANGELOG.md',
  ...es.map(file=>'docs/es/'+file),
  ...en.map(file=>'docs/en/'+file)];

assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
for(const relative of files){
  const absolute=path.join(root,relative);
  assert.equal(fs.existsSync(absolute),true,'Missing bilingual documentation: '+relative);
  const value=fs.readFileSync(absolute,'utf8');
  assert.ok(value.length>100,'Unexpectedly empty documentation: '+relative);
  if(relative!=='CHANGELOG.md'){
    assert.ok(value.includes(pkg.version),'Wrong documented release: '+relative);
  }
  // Validate every local Markdown link, including language navigation.
  for(const match of value.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)){
    const target=match[1].split('#')[0];
    if(!target||/^(?:https?:|mailto:)/i.test(target)){continue;}
    const resolved=path.resolve(path.dirname(absolute),decodeURIComponent(target));
    assert.ok(resolved.startsWith(root+path.sep),'Link escapes repository: '+relative+' -> '+target);
    assert.equal(fs.existsSync(resolved),true,'Broken local link: '+relative+' -> '+target);
  }
}
const docs=fs.readdirSync(path.join(root,'docs')).sort();
assert.deepEqual(docs,['en','es'],'Only language-specific documentation directories should remain');
assert.deepEqual(fs.readdirSync(path.join(root,'docs','es')).sort(),es.sort());
assert.deepEqual(fs.readdirSync(path.join(root,'docs','en')).sort(),en.sort());

const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const spanish=read('docs/es/uso.md');
const english=read('docs/en/usage.md');
for(const text of [spanish,english]){
  for(const key of ['create_user_shell_code','create_shell_code','close_shell_code',
    'Workspace Trust','shell_id','window_id','FIFO','timeout']){
    assert.ok(text.includes(key),'Missing usage concept: '+key);
  }
}
assert.ok(spanish.includes('autorización')&&english.includes('approval'),
  'Both language guides must cover explicit approval');
assert.ok(read('README.md').includes('docs/en/')&&read('README.md').includes('docs/es/'));
const readme=read('README.md');
const esStart=readme.indexOf('\n## Español\n');
const enStart=readme.indexOf('\n## English\n');
assert.ok(esStart>=0 && enStart>esStart,
  'README must contain complete, sequential Spanish and English sections');
const esSection=readme.slice(esStart,enStart);
const enSection=readme.slice(enStart);
const expectedSections=[
  [esSection,['### Terminales y permisos','### Instalación y compilación',
    '### Seguridad y comprobaciones','### Documentación en español','### Origen y licencia']],
  [enSection,['### Terminals and permissions','### Installation and building',
    '### Security and testing','### English documentation','### Origin and license']]
];
for(const [section,headings] of expectedSections){
  for(const heading of headings){
    assert.ok(section.includes(heading),'Incomplete translated README section: '+heading);
  }
  for(const term of ['create_shell_code','create_user_shell_code',
    'npm run test:multishell','npm run lint','npm run package','http://127.0.0.1:3000/mcp']){
    assert.ok(section.includes(term),'Technical information missing from one language: '+term);
  }
}
assert.doesNotMatch(readme,/^#{1,4} .*\s+\/\s+.*$/gm,
  'Do not combine translated headings using a slash');
assert.doesNotMatch(readme,/\b(?:Build\s*\/\s*Compilación|Security\s*\/\s*Seguridad|Tests\s*\/\s*Pruebas|Origin\s*\/\s*Origen|Installer\s*\/\s*Instalador)\b/i,
  'Avoid mixing languages within individual README paragraphs');
assert.doesNotMatch(esSection,/\b(?:The extension|The generated installer|During Windows|This project is an adaptation)\b/,
  'English explanatory prose belongs only in the English section');
assert.doesNotMatch(enSection,/\b(?:Este proyecto|La extensión|El instalador|Las terminales)\b/,
  'Spanish explanatory prose belongs only in the Spanish section');
const changelog=read('CHANGELOG.md');
assert.ok(changelog.indexOf('## Español')<changelog.indexOf('## English'),
  'Root changelog index also needs separate language sections');

assert.ok(read('CHANGELOG.md').includes('docs/en/changelog.md'));
assert.ok(read('CHANGELOG.md').includes('docs/es/historial.md'));

const revisions=value=>[...value.matchAll(/^## (\d+\.\d+\.\d+)\b/gm)]
  .map(match=>match[1]).sort();
assert.deepEqual(revisions(read('docs/es/historial.md')),
  revisions(read('docs/en/changelog.md')),
  'Spanish and English release histories must describe the same versions');

const vscodeIgnore=read('.vscodeignore');
assert.doesNotMatch(vscodeIgnore,/^docs\/(?:\*\*|en|es)/m,
  'Documentation must be packaged into the VSIX');
const validator=read('scripts/validate-windows.ps1');
for(const name of ['extension/docs/es/uso.md','extension/docs/en/usage.md',
  'extension/docs/es/instalacion.md','extension/docs/en/installation.md']){
  assert.ok(validator.includes(name),'VSIX inspection must check '+name);
}
assert.match(read('.gitattributes'),/^\* text=auto eol=lf$/m,
  'Text sources must use stable LF endings across Windows and Linux');
assert.match(read('.vscodeignore'),/^\.gitattributes$/m,
  'Repository-only line-ending policy must not be bundled in the VSIX');
console.log('PASS: bilingual Spanish/English documentation, local links, release parity and VSIX inclusion');