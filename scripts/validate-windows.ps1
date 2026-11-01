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
                              'extension/docs/es/instalacion.md',
                              'extension/docs/es/uso.md',
                              'extension/docs/es/compatibilidad.md',
                              'extension/docs/es/validacion.md',
                              'extension/docs/es/historial.md',
                              'extension/docs/en/installation.md',
                              'extension/docs/en/usage.md',
                              'extension/docs/en/compatibility.md',
                              'extension/docs/en/validation.md',
                              'extension/docs/en/changelog.md')){
            if($required -notin $names){throw "Missing VSIX entry: $required"}
        }
        if(@($names | Where-Object {$_ -match '^extension/tunnel-client-v' }).Count){
            throw 'External tunnel client must never be packaged into MultiShell MCP'
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