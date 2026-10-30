const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const proxyquire = require('proxyquire').noCallThru();

const listeners = { closed: new Set(), integration: new Set(), ended: new Set() };
const commands = [];
let concurrent = 0;
let peak = 0;
let durationMs = 90;
let complete = true;
const subscribe = event => handler => {
  listeners[event].add(handler);
  return { dispose: () => listeners[event].delete(handler) };
};
const notify = (event, payload) => {
  for (const handler of [...listeners[event]]) { handler(payload); }
};
const vscode = {
  workspace: { workspaceFolders: [] },
  window: {
    onDidCloseTerminal: subscribe('closed'),
    onDidChangeTerminalShellIntegration: subscribe('integration'),
    onDidEndTerminalShellExecution: subscribe('ended'),
    createTerminal(options) {
      const terminal = {
        name: options.name,
        cwd: options.cwd,
        disposed: false,
        dispose() {
          if (!this.disposed) {
            this.disposed = true;
            notify('closed', this);
          }
        },
        shellIntegration: {
          executeCommand(command) {
            const event = { name: options.name, command };
            commands.push(event);
            const execution = {
              async *read() {
                concurrent++;
                peak = Math.max(peak,concurrent);
                await new Promise(r => setTimeout(r,durationMs));
                concurrent--;
                if (complete) { notify('ended',{terminal,execution,exitCode:0}); }
                yield options.name + ':' + command;
              }
            };
            return execution;
          }
        }
      };
      return terminal;
    }
  }
};
const { ShellManager } = proxyquire('../out/shell-manager.js', { vscode });
const { scopedPath } = proxyquire('../out/tools/scoped-file-tools.js', { vscode });
const expectReject = async (p,pattern) => assert.rejects(p,pattern);
const run = async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'multishell-check-'));
 const a = path.join(root,'a'), b = path.join(root,'b');
 fs.mkdirSync(a); fs.mkdirSync(b);
 const manager = new ShellManager();
 const previousWorkspace=vscode.workspace.workspaceFolders;
 const nested=path.join(a,'nested'); fs.mkdirSync(nested);
 vscode.workspace.workspaceFolders=[{uri:{fsPath:a}}];
 try {
   assert.equal(manager.create('relative','nested').initial_cwd,nested);
   manager.close('relative');
   assert.equal(manager.create('chatA',a).shell_id,'chatA');
   assert.equal(manager.create('chatB',b).shell_id,'chatB');
   assert.throws(()=>manager.create('chatC',a),/already uses this directory/);
   assert.throws(()=>manager.create('chatA',b),/already exists/);
   await expectReject(manager.execute('unknown','echo no'),/Unknown shell_id/);
   const began=Date.now();
   const [ra,rb]=await Promise.all([manager.execute('chatA','echo A'),manager.execute('chatB','echo B')]);
   const elapsed=Date.now()-began;
   assert.ok(elapsed<175,'two independent shells must run in parallel, took '+elapsed+'ms');
   assert.ok(peak>=2,'parallel commands must overlap');
   assert.match(ra.output,/MCP \[chatA\]:echo A/);
   assert.match(rb.output,/MCP \[chatB\]:echo B/);
   assert.equal(ra.exit_code,0);
   assert.equal(rb.exit_code,0);
   peak=0; commands.length=0;
   await Promise.all([manager.execute('chatA','first'),manager.execute('chatA','second')]);
   assert.equal(peak,1,'same shell cannot run two commands in parallel');
   assert.deepEqual(commands.map(x=>x.command),['first','second']);
   assert.throws(()=>scopedPath(a,'../b/secret.txt'),/escapes/);
   assert.throws(()=>scopedPath(a,path.resolve(b,'secret.txt')),/Only relative/);
   const folder=path.join(a,'linked');
   try {
     fs.symlinkSync(b,folder,'junction');
     assert.throws(()=>scopedPath(a,'linked/secret.txt'),/Symbolic link escapes/);
   } catch (e) {
     if (e.code !== 'EPERM' && e.code !== 'EACCES') { throw e; }
   }
   durationMs=1200;
   await expectReject(manager.execute('chatA','stuck',1000),/timed out|closed/);
   assert.ok(!manager.list().some(x=>x.shell_id==='chatA'),'timed-out shell should be invalidated');
   await expectReject(manager.execute('chatA','after'),/Unknown shell_id/);
   manager.close('chatB');
   assert.equal(manager.list().length,0);
   console.log('PASS: two shells concurrent, one-shell FIFO, unique IDs, path containment, symlink denial, and timeout cleanup');
 } finally {
   manager.dispose();
   vscode.workspace.workspaceFolders=previousWorkspace;
   fs.rmSync(root,{recursive:true,force:true});
 }
};
run().catch(e=>{console.error(e);process.exitCode=1;});
