import { spawn } from 'node:child_process';

export type ShellReadiness = 'idle' | 'busy' | 'unsupported' | 'unknown';

/** Inspect PowerShell's foreground runspace through a separate diagnostic
 * runspace. Never send text, keys, or a pipeline to the terminal's runspace.
 * Missing permissions, unsupported shells and timeouts provide no idle proof. */
export function inspectPowerShellReadiness(processId:number):Promise<ShellReadiness> {
    if(!Number.isSafeInteger(processId)||processId<=0){return Promise.resolve('unknown');}
    const script=`
$ErrorActionPreference='Stop'
$inspectionRunspace=$null
$inspectionPipeline=$null
try {
    $target=Get-Process -Id ${processId} -ErrorAction Stop
    if($target.ProcessName -notin @('pwsh','powershell')){[Console]::Write('unsupported');return}
    $connection=[System.Management.Automation.Runspaces.NamedPipeConnectionInfo]::new(${processId})
    $connection.OpenTimeout=800
    $connection.OperationTimeout=800
    $inspectionRunspace=[System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($connection)
    $inspectionRunspace.Open()
    $inspectionPipeline=[System.Management.Automation.PowerShell]::Create()
    $inspectionPipeline.Runspace=$inspectionRunspace
    [void]$inspectionPipeline.AddScript(@'
function Test-EmptyConsolePrompt($foreground) {
    $frames=@($foreground.Debugger.GetCallStack())
    if($frames.Count -lt 1 -or $frames.Count -gt 2){return $false}
    foreach($frame in $frames) {
        if($frame.FunctionName -notin @('PSConsoleHostReadLine','Global:PSConsoleHostReadLine')){return $false}
        $file=([string]$frame.ScriptName).Replace([char]92,[char]47)
        if(-not ($file.EndsWith('/PSReadLine.psm1',[StringComparison]::OrdinalIgnoreCase) -or
                 $file.EndsWith('/shellIntegration.ps1',[StringComparison]::OrdinalIgnoreCase))){return $false}
    }
    if(-not ([string]$frames[0].Position.Text).Contains('[Microsoft.PowerShell.PSConsoleReadLine]::ReadLine(')){return $false}
    $buffer='';$cursor=0
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$buffer,[ref]$cursor)
    return $buffer.Length -eq 0
}
$foreground=Get-Runspace -Id 1 -ErrorAction Stop
if($foreground.Name -ne 'Runspace1' -or $foreground.RunspaceStateInfo.State -ne 'Opened'){'unknown'}
elseif($foreground.Debugger.InBreakpoint){'busy'}
elseif($foreground.RunspaceAvailability -eq 'Available'){'idle'}
elseif($foreground.RunspaceAvailability -eq 'Busy' -and
       (Test-EmptyConsolePrompt $foreground) -and (Test-EmptyConsolePrompt $foreground)){'idle'}
else {'busy'}
'@)
    $result=@($inspectionPipeline.Invoke())
    if($inspectionPipeline.HadErrors -or $result.Count -ne 1){[Console]::Write('unknown')}
    else {[Console]::Write([string]$result[0])}
} catch {[Console]::Write('unknown')}
finally {
    if($null -ne $inspectionPipeline){$inspectionPipeline.Dispose()}
    if($null -ne $inspectionRunspace){$inspectionRunspace.Dispose()}
}`;
    return new Promise(resolve=>{
        const executable=process.platform==='win32'?'powershell.exe':'pwsh';
        const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive',
            '-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
        {windowsHide:true,stdio:['ignore','pipe','ignore']});
        let output='',settled=false;
        const finish=(value:ShellReadiness)=>{
            if(settled){return;}
            settled=true;clearTimeout(timer);resolve(value);
        };
        // This PID belongs only to our disposable inspector, never to the shell.
        const timer=setTimeout(()=>{child.kill();finish('unknown');},2500);
        child.stdout.on('data',chunk=>{
            if(output.length<128){output+=String(chunk).slice(0,128-output.length);}
        });
        child.once('error',error=>finish((error as NodeJS.ErrnoException).code==='ENOENT'?'unsupported':'unknown'));
        child.once('close',code=>{
            const value=output.trim();
            finish(code===0&&(value==='idle'||value==='busy'||value==='unsupported')?value:'unknown');
        });
    });
}
