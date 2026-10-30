$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    $version=(Get-Content package.json -Raw | ConvertFrom-Json).version
    Write-Host "MultiShell MCP $version - Windows validation"

    npm run test:multishell
    if($LASTEXITCODE -ne 0){throw 'Automated tests failed'}
    npm run lint
    if($LASTEXITCODE -ne 0){throw 'ESLint failed'}
    cmd /c "npm audit --omit=dev --audit-level=low"
    if($LASTEXITCODE -ne 0){throw 'Production dependency audit failed'}

    $out="multi-shell-mcp-server-$version.vsix"
    & .\node_modules\.bin\vsce.cmd package --allow-missing-repository --no-rewrite-relative-links --out $out
    if($LASTEXITCODE -ne 0){throw 'VSIX packaging failed'}

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[System.IO.Compression.ZipFile]::OpenRead((Join-Path $project $out))
    try {
        $names=@($zip.Entries | ForEach-Object FullName)
        if($names.Count -gt 50){throw "Unexpected packaged file count: $($names.Count)"}
        foreach($required in @('extension/dist/extension.js','extension/media/panel.js',
                              'extension/media/panel.css','extension/media/logo.png',
                              'extension/media/multishell.svg',
                              'extension/docs/instalacion.md',
                              'extension/docs/uso.md','extension/docs/compatibilidad.md',
                              'extension/docs/validacion.md')){
            if($required -notin $names){throw "Missing VSIX entry: $required"}
        }
        if(@($names | Where-Object {$_ -match '^(extension/node_modules/|extension/out/)' }).Count){
            throw 'Bundled package contains unneeded modules or TypeScript outputs'
        }
        if(@($names | Where-Object {$_ -match '\.(exe|dll|so|node)$'}).Count){
            throw 'Platform-dependent native binaries found in VSIX'
        }
        Write-Host "Verified VSIX contents: $($names.Count) files"
    } finally { $zip.Dispose() }
    Write-Host "PASS: tests, lint, dependency audit, self-contained VSIX"
    Write-Host "Package: $(Join-Path $project $out)"
} finally { Pop-Location }