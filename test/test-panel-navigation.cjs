'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'../media/panel.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/panel.ts'),'utf8')+
  fs.readFileSync(path.join(__dirname,'../src/panel-markup.ts'),'utf8');
const start=js.indexOf('  const pages = [');
const end=js.indexOf('  function setForm(open) {',start);
assert.ok(start>=0&&end>start,'Missing side navigation');
const nodes=new Map();
const $=id=>{
 if(!nodes.has(id)){
  nodes.set(id,{hidden:false,open:true,selected:'',tabIndex:0,
   attributes:new Map(),setAttribute(k,v){this.attributes.set(k,v);},
   focus(){this.focused=true;},querySelector(){return {focus(){}};},textContent:''});
 }
 return nodes.get(id);
};
const calls=[];
const ctx={$,activePage:'overview',state:{requests:[]},t:s=>s,
 localize(){},drawHeader(){},renderTunnel(){calls.push('tunnel');},
 renderShells(){calls.push('shells');},renderWindows(){calls.push('windows');},
 renderRequests(){calls.push('requests');},renderConnections(){calls.push('connections');},
 syncSkills(){calls.push('skills');}};
vm.createContext(ctx);
vm.runInContext(js.slice(start,end),ctx);
const list=['overview','shells','windows','requests','skills','connections','tunnel','settings'];
const labels={overview:'overview',shells:'shells',windows:'connectedWindows',
 requests:'requests',skills:'skills',connections:'aiConnections',
 tunnel:'tunnelTab',settings:'settings'};
for(const page of list){
 vm.runInContext("switchPage('"+page+"',true)",ctx);
 assert.equal(ctx.activePage,page);
 assert.equal($('navDisclosure').open,false);
 const selected=[...nodes.entries()].filter(([id,node])=>id.startsWith('tab')&&
   node.attributes.get('aria-selected')==='true');
 assert.equal(selected.length,1,'Exactly one selected navigation item');
 assert.equal(selected[0][0],'tab'+page[0].toUpperCase()+page.slice(1));
 const shown=[...nodes.entries()].filter(([id,node])=>id.endsWith('Page')&&!node.hidden);
 assert.equal(shown.length,1,'Exactly one visible page');
 assert.equal(shown[0][0],page+'Page');
 assert.equal($('activeViewLabel').textContent,labels[page]);
}
for(const id of ['tabOverview','tabConnections','tabSettings','navDisclosure','requestsPage']){
 assert.ok(html.includes('id="'+id+'"'),'Missing accessible navigation control '+id);
}
assert.match(js,/ArrowUp.*ArrowDown/);
console.log('PASS: eight accessible navigation views, selected state, folded menu and contextual labels');