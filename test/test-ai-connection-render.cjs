'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../src/panel.ts'),'utf8')+
  fs.readFileSync(path.join(__dirname,'../src/panel-markup.ts'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../media/panel.js'),'utf8');
// Every direct document-ID reference in the webview must exist in the markup.
// Previously "aiFormHelp" was referenced but not assigned an HTML id, causing
// the entire AI cards renderer to stop after the counter had already updated.
const declared=new Set([...source.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const accessed=new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
const missing=[...accessed].filter(id=>!declared.has(id));
assert.deepEqual(missing,[],'Missing HTML ids referenced by webview script');

function node(type='div',textContent=''){
  return {
    type,children:[],textContent,hidden:false,disabled:false,attributes:{},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},
    setAttribute(key,value){this.attributes[key]=String(value);},
    addEventListener(){},classList:{toggle(){}}
  };
}
const elements=new Map([...declared].map(id=>[id,node()]));
elements.get('aiProvider').value='claude-web';
const context={
  $:id=>elements.get(id)||null,
  state:{
    tunnel:{ready:true},running:true,tunnelTrusted:true,
    aiConnections:[
      {id:'aaa',name:'Claude nube',provider:'claude-web'},
      {id:'bbb',name:'Gemini local',provider:'gemini-cli'}
    ],
    aiProviders:[
      {id:'claude-web',name:'Claude web',mode:'remote',
        setupEs:'HTTPS autenticado',cautionEs:'No publicar localhost',
        setupEn:'Authenticated HTTPS',cautionEn:'Never expose localhost'},
      {id:'gemini-cli',name:'Gemini CLI',mode:'local'}
    ],
    aiLinkStates:{bbb:{configured:false,managed:true}}
  },
  expandedAiGuides:new Set(),locale:'es',aiBusy:false,providerNames:{'gemini-cli':'providerGemini'},
  t:x=>x,
  el:(tag,cssClass,text)=>{const element=node(tag,text||'');element.cssClass=cssClass;return element;},
  aiAction:()=>{}
};
const start=script.indexOf('  function renderConnections() {');
const end=script.indexOf('  function aiAction(',start);
assert.ok(start>=0&&end>start,'Cannot find UI renderer');
vm.runInNewContext(script.slice(start,end)+'\nrenderConnections();',context,{timeout:2000});
const cards=elements.get('aiList').children;
assert.equal(cards.length,2,'Both saved profiles should be rendered as cards');
assert.equal(cards[0].children[0].children[0].textContent,'Claude nube');
assert.equal(cards[1].children[0].children[0].textContent,'Gemini local');
assert.equal(elements.get('aiEmpty').hidden,true);
assert.equal(elements.get('aiFormHelp').textContent,'HTTPS autenticado No publicar localhost');
assert.ok(cards[0].children[2].children.some(button=>button.textContent==='aiRemoteOpen'));
assert.ok(cards[1].children[2].children.some(button=>button.textContent==='aiUninstall'));
assert.equal(cards[1].children[2].children.some(button=>button.textContent==='aiInstall'),false,
  'No automatic URL-only installation action may be offered after authentication upgrade');
// Re-render with an authenticated gateway and a hub-owned terminal.
context.state.role='hub';
context.state.shells=[{shell_id:'primary-1',alias:'main',initial_cwd:'/project'}];
context.state.aiGateways=[{
 profileId:'aaa',shellId:'primary-1',shellRoot:'/project',
 level:'read',port:38100,autostart:false,running:true,
 endpoint:'http://127.0.0.1:38100/mcp'
}];
vm.runInNewContext(script.slice(start,end)+'\nrenderConnections();',context,{timeout:2000});
const expanded=elements.get('aiList').children;
assert.equal(expanded.length,2);
const gateway=expanded[0].children[4];
assert.equal(gateway.cssClass,'ai-gateway');
assert.ok(gateway.children.some(child=>child.textContent==='http://127.0.0.1:38100/mcp'));
const controls=gateway.children.find(x=>x.cssClass==='ai-entry-actions');
assert.ok(controls.children.some(x=>x.textContent==='gatewayCopyKey'));
assert.ok(controls.children.some(x=>x.textContent==='gatewayRevoke'));
assert.equal(expanded[0].children[2].children.at(-1).disabled,true,
  'Cannot delete a profile while its gateway is configured');
assert.equal(JSON.stringify(expanded).includes('super-private-key'),false,
  'No credential can be embedded in HTML controls');
const form=expanded[1].children[4].children.find(x=>x.cssClass==='ai-gateway-form');
assert.ok(form,'Local clients should be able to set independent gateway permissions');
// Each card must expose provider-specific steps, official commands and masked
// credential fields without including any stored secret in its HTML state.
context.state.aiOnboarding=[{
 provider:'gemini-cli',stepsEs:['Instala','Inicia sesión'],stepsEn:['Install','Sign in'],
 commands:[{labelEs:'Instalar',labelEn:'Install',command:'npm install -g @google/gemini-cli',platform:'all'}],
 links:[{labelEs:'Documentación',labelEn:'Docs',url:'https://github.com/google-gemini/gemini-cli'}],
 fields:[{id:'providerApiKey',kind:'secret',labelEs:'API key opcional',labelEn:'Optional API key',
 helpEs:'No necesaria para login Google',helpEn:'Not needed for Google login'}],
 noteEs:'No activa API',noteEn:'Does not enable API'
}];
context.state.aiProviderSaved={bbb:{profileId:'bbb',hasProviderApiKey:true,
 hasMcpBearer:false}};
vm.runInNewContext(script.slice(start,end)+'\nrenderConnections();',context,{timeout:2000});
const card=elements.get('aiList').children[1];
const guided=card.children[3];
assert.equal(guided.cssClass,'ai-onboarding');
const content=guided.children[1];
assert.ok(content.children.some(x=>x.cssClass==='ai-onboarding-steps'));
const command=content.children.find(x=>x.cssClass==='ai-onboarding-command');
assert.ok(command.children.some(x=>x.textContent==='npm install -g @google/gemini-cli'));
const onboardingFields=content.children.find(x=>x.cssClass==='ai-onboarding-fields');
assert.ok(onboardingFields);
const privateInput=onboardingFields.children[0].children[0].children[0];
assert.equal(privateInput.type,'password');
assert.equal(privateInput.value,'');
assert.ok(privateInput.placeholder.includes('aiOnboardingStored'));
console.log('PASS: HTML ids, local/remote cards, per-AI ? guide, official commands, masked credential fields and gateway controls');