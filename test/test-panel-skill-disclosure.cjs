'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'media/panel.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/panel.css'),'utf8');
const between=(first,last)=>{
 const start=script.indexOf(first);
 const end=script.indexOf(last,start+first.length);
 assert.ok(start>=0&&end>start,'Missing panel function: '+first);
 return script.slice(start,end);
};

class FakeNode {
 constructor(tag){
  this.tag=tag;this.children=[];this.events=new Map();
  this.attributes={};this.className='';this.textContent='';
  this.classList={add:value=>{this.className+=' '+value;}};
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(type,cb){this.events.set(type,cb);}
 dispatch(type){this.events.get(type)?.();}
 querySelector(){return this.option||(this.option=new FakeNode('option'));}
}
const registry=new Map();
const $=id=>{
 if(!registry.has(id))registry.set(id,new FakeNode('div'));
 return registry.get(id);
};
const sent=[];
const ctx={
 document:{createElement:tag=>new FakeNode(tag)},
 makeIcon:key=>{const icon=new FakeNode('svg');icon.key=key;return icon;},
 $,
 state:{workspace:'/repo',running:true,skillsEnabled:true,globalSkillsEnabled:true},
 skillItems:[{name:'same',description:'A detailed description that must stay collapsed.',
  skill_path:'.agents/skills/same',scope:'project'}],
 skillCursor:undefined,skillWarnings:[],skillError:'',skillBusy:false,skillRows:undefined,
 expandedSkills:new Set(),
 locale:'es',
 send:(type,data)=>sent.push({type,data}),
 t:key=>({
  skillsLocal:'Workspace sources',skillsGlobal:'Global authorized',
  skillsPrivate:'Global disabled',skillsUnavailable:'Not enabled',
  skillsLoading:'Loading',skillsFound:'skills found',skillsEmpty:'Empty',
  personalSkills:'Personal',project:'Project',useSkill:'Copiar para ChatGPT',
  skillDetails:'Descripción',skillStart:'Start MCP'
 })[key]||key,
 JSON
};
const context=vm.createContext(ctx);
vm.runInContext(between('  function el(tag, classes, text) {','  function menuButton('),context);
vm.runInContext(between('  function renderSkills() {','  function cancelSkillSearch()'),context);

function getRow(index=0){
 const row=$('skillsList').children[index];
 assert.equal(row.tag,'div');assert.match(row.className,/skill-row/);
 const [header,details]=row.children;
 assert.match(header.className,/skill-heading/);
 assert.equal(header.children.length,2,'Identity and copy button must be siblings');
 const [identity,copy]=header.children;
 assert.match(identity.className,/skill-identity/);
 assert.equal(identity.children.length,2,'Name and always-visible path must share one column');
 assert.equal(details.tag,'details');
 assert.equal(details.children[0].tag,'summary');
 assert.equal(copy.tag,'button');
 return {row,identity,details,summary:details.children[0],copy};
}
ctx.renderSkills();
let {identity,details,summary,copy}=getRow();
assert.equal(details.open,false,'Descriptions must start collapsed');
assert.equal(identity.children[0].textContent,'same');
assert.equal(identity.children[1].textContent,'Project · .agents/skills/same',
 'Skill source and path must remain visible even while description is collapsed');
assert.equal(identity.children[1].title,'.agents/skills/same',
 'Long truncated paths must have a full tooltip');
assert.equal(summary.children[1].textContent,'Descripción');
assert.equal(summary.attributes['aria-label'],'Descripción: same');
assert.equal(details.children[1].children.length,1,
 'Only the description belongs inside the hidden disclosure');
assert.equal(details.children[1].children[0].tag,'p');
assert.equal(details.children[1].children[0].textContent,
 'A detailed description that must stay collapsed.');
assert.equal(copy.children[0].key,'copy','Use the existing compact copy icon');
assert.ok(copy.attributes['aria-label'].includes('same'));
assert.ok(!summary.children.includes(copy),'Copy control must not toggle disclosure');
assert.ok(!details.children.includes(copy),'Copy control must stay beside the name');
copy.dispatch('click');
assert.equal(sent.length,1);
assert.equal(sent[0].type,'skill_copy');
assert.equal(sent[0].data.value,'.agents/skills/same');
assert.equal(details.open,false,'Copy action must not open the description');
details.open=true;details.dispatch('toggle');
assert.ok(ctx.expandedSkills.has('.agents/skills/same'),'Track user-opened disclosures');

ctx.skillItems=[...ctx.skillItems,{name:'second',description:'Second description',
 skill_path:'.agents/skills/second',scope:'project'}];
ctx.renderSkills();
assert.equal(getRow().details.open,true,
 'Previously opened descriptions must survive appended-page rerenders');
assert.equal(getRow(1).details.open,false,'Newly discovered entries remain collapsed');
assert.equal(getRow(1).identity.children[1].textContent,'Project · .agents/skills/second',
 'Newly discovered entries expose their path even when closed');

({details}=getRow());
details.open=false;details.dispatch('toggle');
assert.equal(ctx.expandedSkills.size,0,'Closing a disclosure clears retained state');
ctx.state.running=false;
ctx.renderSkills();
assert.equal(getRow().copy.disabled,true,'Copy cannot be used with MCP stopped');
assert.ok(script.includes('skillContext=context;\n      expandedSkills.clear();'),
 'A different window/workspace must clear retained disclosure state');
assert.match(css,/\.skill-heading\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 28px/s,
 'Copy must stay to the right in a fixed-width column');
assert.match(css,/\.skill-source\s*\{[^}]*display:block/s,
 'Path is rendered in the always-visible identity block');
assert.match(css,/text-overflow:ellipsis/, 'Long paths must not crowd out the copy button');
assert.match(css,/\.skill-summary::-webkit-details-marker\s*\{[^}]*display:none/s);
assert.match(css,/\.skill-details\[open\] \.skill-chevron/,
 'Disclosure should visibly rotate its chevron');
assert.match(css,/summary:focus-visible/,
 'Native keyboard-accessible summary must have a focus indicator');
assert.doesNotMatch(script,/\.innerHTML\s*=/,'Skills must not interpolate untrusted HTML');
console.log('PASS: compact accessible skill disclosures, right-hand copy, independent click, state retention, permissions and narrow layout');