param([switch]$Install)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    $manifest=Get-Content .\package.json -Raw | ConvertFrom-Json
    $version=$manifest.version
    Write-Host "MultiShell MCP $version - tests, package, optional install"
    cmd /c 'npm prune --ignore-scripts --no-audit --no-fund --loglevel=error'
    if($LASTEXITCODE -ne 0){throw 'Dependency cleanup failed'}
    npm run test:multishell
    if($LASTEXITCODE -ne 0){throw 'Tests failed; no package created'}
    node --check .\media\panel.js
    if($LASTEXITCODE -ne 0){throw 'Panel JavaScript invalid'}
    $output=Join-Path $project "multi-shell-mcp-server-$version.vsix"
    & .\node_modules\.bin\vsce.cmd package --allow-missing-repository --no-rewrite-relative-links --out $output
    if($LASTEXITCODE -ne 0){throw 'Packaging failed'}
    if($Install){
        code --install-extension $output --force
        if($LASTEXITCODE -ne 0){throw 'Install failed'}
    }
    Write-Host ("Ready: "+$output)
    Write-Host 'The original MCP extension remains enabled until you switch it manually.'
} finally {Pop-Location}