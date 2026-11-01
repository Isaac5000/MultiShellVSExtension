const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const proxyquire=require('proxyquire').noCallThru();

class LocalManager {
    constructor(){this.items=new Map();}
    create(id,cwd,allow=false,origin='mcp'){
        if(this.items.has(id))throw new Error('duplicate');
        this.items.set(id,{cwd,origin});
        return {shell_id:id,initial_cwd:cwd,origin,timed_out_running:false,busy:false,queued:0};
    }
    list(){return [...this.items].map(([id,{cwd,origin}])=>({
        shell_id:id,initial_cwd:cwd,origin,timed_out_running:false,busy:false,queued:0
    }));}
    close(id){if(!this.items.delete(id))throw new Error('unknown shell');}
    show(id){if(!this.items.has(id))throw new Error('unknown shell');}
    async execute(id,command){return {shell_id:id,command,output:id+':'+command,exit_code:0,truncated:false};}
    dispose(){this.items.clear();}
}
const vscode={env:{language:'en'},window:{
    showWarningMessage:async(_message,options,accept)=>{
        assert.equal(options.modal,true,'Panel user-shell actions must require local approval');
        return accept;
    }
}};
const mod=proxyquire('../out/multi-window.js',{
    './shell-manager':{ShellManager:LocalManager},vscode
});
async function test(){
    const home=fs.mkdtempSync(path.join(os.tmpdir(),'panel-main-'));
    const a=path.join(home,'A'),b=path.join(home,'B'),other=path.join(home,'aux');
    for(const dir of [a,b,other])fs.mkdirSync(dir);
    const token='2'.repeat(64);
    const createHub=async()=>({stop:async()=>{}});
    const winA=new mod.MultiWindowController(0,token,a,createHub);
    const winB=new mod.MultiWindowController(0,token,b,createHub);
    try{
        await Promise.all([winA.start(),winB.start()]);
        const sa=await winA.panelState(),sb=await winB.panelState();
        assert.ok(sa.shells.find(s=>s.shell_id===sa.primary));
        assert.ok(sb.shells.find(s=>s.shell_id===sb.primary));
        assert.notEqual(sa.primary,sb.primary,'two windows must have different primary IDs');
        assert.equal(sa.windowId,winA.worker.id);
        assert.equal(sb.windowId,winB.worker.id);
        assert.ok(sa.primary.startsWith('main-'));
        assert.equal(sa.shells.find(s=>s.shell_id===sa.primary).origin,'automatic');
        assert.ok(sb.primary.startsWith('main-'));
        const extra=await winA.panelCreateShell('aux_test',other);
        assert.equal(extra.shell_id,'aux_test');
        assert.equal(extra.origin,'user','Panel-created shell must be protected on timeout');
        const bot=await winA.router.create('bot_test',other,true,winA.worker.id);
        assert.equal(bot.origin,'mcp','MCP tool-created shell must retain normal timeout cleanup');
        await winA.router.close('bot_test');
        assert.equal(winA.panelState instanceof Function,true);
        winA.panelShowShell('aux_test');
        await assert.rejects(winA.panelCloseShell(sa.primary),/main shell cannot be closed/);
        await winA.panelCloseShell('aux_test');
        assert.equal((await winA.panelState()).shells.length,1);
        const manual=await winA.panelCreateShell('manual',other);
        winA.localShells.close(manual.shell_id); // Terminal manually closed outside the sidebar.
        await winA.panelCloseShell('manual');
        assert.equal(winA.worker.aliases.has('manual'),false);
        assert.throws(()=>winA.router.resolve('manual'),/Unknown/);
        assert.equal((await winB.panelState()).shells.length,1);
        console.log('PASS: two windows automatically own distinct primary shells; panel can create/show/close only auxiliary shells');
    }finally{
        await Promise.all([winA.stop(),winB.stop()]);
        fs.rmSync(home,{recursive:true,force:true});
    }
}
test().catch(e=>{console.error(e);process.exitCode=1;});