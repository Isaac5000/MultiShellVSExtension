param([switch]$Install)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    $version=(Get-Content package.json -Raw | ConvertFrom-Json).version
    Write-Host "MultiShell MCP $version - tests, integrated package, optional install"
    npm run test:multishell
    if($LASTEXITCODE -ne 0){throw 'Tests failed; no package created'}
    npm run lint
    if($LASTEXITCODE -ne 0){throw 'Lint failed; no package created'}
    npm run package
    if($LASTEXITCODE -ne 0){throw 'Integrated packaging failed'}
    $target=(node -p "process.platform+'-'+process.arch").Trim()
    $output=Join-Path $project "multi-shell-mcp-server-$version-$target.vsix"
    if(!(Test-Path -LiteralPath $output)){throw "Integrated VSIX missing: $output"}
    node test/test-platform-vsix-tunnel.cjs
    if($LASTEXITCODE -ne 0){throw 'Integrated binary verification failed'}
    if($Install){
        code --install-extension $output --force
        if($LASTEXITCODE -ne 0){throw 'Install failed'}
    }
    Write-Host ("Ready: "+$output)
    Write-Host 'Installing/reloading may interrupt the current MCP tunnel connection.'
} finally {Pop-Location}
