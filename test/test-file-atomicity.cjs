'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const proxyquire=require('proxyquire').noCallThru();
const {MCPServer}=proxyquire('../out/server.js',{
  './multi-window':{REGISTER_PATH:'/_multishell/register',CONTROL_PATH:'/_multishell/control',authenticated:()=>false},
  './utils/logger':{logger:{info(){},warn(){},error(){}}}
});
function unpack(raw){
  const line=raw.split('\n').find(item=>item.startsWith('data:'));
  return JSON.parse(line?line.slice(5):raw);
}
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'multishell-atomic-files-'));
  const server=new MCPServer(0,'127.0.0.1',{root:()=>root},{file:true,edit:true,shell:false});
  await server.start();
  const port=server.httpServer.address().port;
  const call=async(name,args)=>{
    const response=await fetch('http://127.0.0.1:'+port+'/mcp',{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json,text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:42,method:'tools/call',params:{
        name,arguments:{shell_id:'audit',...args}
      }})
    });
    assert.equal(response.status,200);
    return unpack(await response.text()).result;
  };
  try{
    fs.writeFileSync(path.join(root,'source.txt'),'source');
    fs.writeFileSync(path.join(root,'protected.txt'),'valuable');
    const denied=await call('move_file_code',{sourcePath:'source.txt',targetPath:'protected.txt'});
    assert.equal(denied.isError,true,'No-overwrite move must fail');
    assert.equal(fs.readFileSync(path.join(root,'protected.txt'),'utf8'),'valuable');
    assert.equal(fs.readFileSync(path.join(root,'source.txt'),'utf8'),'source');

    const rejectedRename=await call('rename_file_code',{filePath:'source.txt',newName:'protected.txt'});
    assert.equal(rejectedRename.isError,true);
    assert.equal(fs.readFileSync(path.join(root,'protected.txt'),'utf8'),'valuable');

    fs.writeFileSync(path.join(root,'left.txt'),'left');
    fs.writeFileSync(path.join(root,'right.txt'),'right');
    const competing=await Promise.all([
      call('move_file_code',{sourcePath:'left.txt',targetPath:'final.txt'}),
      call('move_file_code',{sourcePath:'right.txt',targetPath:'final.txt'})
    ]);
    assert.equal(competing.filter(r=>r.isError===false).length,1,
      'Exactly one concurrent no-overwrite move must publish the target');
    assert.equal(competing.filter(r=>r.isError===true).length,1);
    assert.equal(fs.existsSync(path.join(root,'left.txt'))||fs.existsSync(path.join(root,'right.txt')),true);

    fs.writeFileSync(path.join(root,'lines.txt'),'one\ntwo\nthree\n');
    const replacements=await Promise.all([
      call('replace_lines_code',{path:'lines.txt',startLine:2,endLine:2,originalCode:'two',content:'TWO-A'}),
      call('replace_lines_code',{path:'lines.txt',startLine:2,endLine:2,originalCode:'two',content:'TWO-B'})
    ]);
    assert.equal(replacements.filter(r=>r.isError===false).length,1,
      'Only the first matching replacement should succeed');
    assert.equal(replacements.filter(r=>r.isError===true).length,1);
    assert.match(fs.readFileSync(path.join(root,'lines.txt'),'utf8'),/^one\nTWO-[AB]\nthree\n$/);

    const realRename=fs.promises.rename;
    fs.promises.rename=async(source,target)=>{
      if(target===path.join(root,'protected.txt')&&source.includes('.multishell-')){
        throw new Error('Simulated failure while publishing temporary file');
      }
      return realRename(source,target);
    };
    try{
      const failed=await call('create_file_code',{
        path:'protected.txt',content:'should-never-replace',overwrite:true
      });
      assert.equal(failed.isError,true);
      assert.equal(fs.readFileSync(path.join(root,'protected.txt'),'utf8'),'valuable',
        'Original file must remain intact if final atomic rename fails');
    }finally{
      fs.promises.rename=realRename;
    }
    const updated=await call('create_file_code',{path:'protected.txt',content:'new',overwrite:true});
    assert.equal(updated.isError,false);
    assert.equal(fs.readFileSync(path.join(root,'protected.txt'),'utf8'),'new');

    const copied=await call('copy_file_code',{sourcePath:'source.txt',targetPath:'protected.txt',overwrite:true});
    assert.equal(copied.isError,false);
    assert.equal(fs.readFileSync(path.join(root,'protected.txt'),'utf8'),'source');
    assert.ok(!fs.readdirSync(root).some(name=>name.includes('.multishell-')),
      'Temporary files must be removed after success or rollback');

    fs.mkdirSync(path.join(root,'from-directory'));
    fs.mkdirSync(path.join(root,'to-directory'));
    const dirMove=await call('move_file_code',{sourcePath:'from-directory',targetPath:'to-directory'});
    assert.equal(dirMove.isError,true);
    assert.equal(fs.existsSync(path.join(root,'from-directory')),true);

    console.log('PASS: no-overwrite moves/renames, two competing destinations, serialized line replacements, atomic failures and cleanup');
  }finally{
    await server.stop();
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
