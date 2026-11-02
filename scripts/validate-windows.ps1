$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    Write-Host "MultiShell MCP $version - Windows validation"

    npm run test:multishell
    if ($LASTEXITCODE -ne 0) { throw 'Automated tests failed' }
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'ESLint failed' }
    cmd /c "npm audit --omit=dev --audit-level=low"
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency audit failed' }

    $vsixName = "multi-shell-mcp-server-$version.vsix"
    & .\node_modules\.bin\vsce.cmd package --allow-missing-repository --no-rewrite-relative-links --out $vsixName
    if ($LASTEXITCODE -ne 0) { throw 'VSIX packaging failed' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $vsixZip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $project $vsixName))
    try {
        $entries = @($vsixZip.Entries | ForEach-Object FullName)
        if ($entries.Count -gt 50) { throw "Unexpected VSIX file count: $($entries.Count)" }
        $required = @(
            'extension/dist/extension.js',
            'extension/media/panel.js', 'extension/media/panel.css',
            'extension/media/logo.png', 'extension/media/multishell.svg',
            'extension/docs/es/instalacion.md', 'extension/docs/es/uso.md',
            'extension/docs/es/compatibilidad.md', 'extension/docs/es/validacion.md',
            'extension/docs/es/historial.md', 'extension/docs/es/skills.md',
            'extension/docs/en/installation.md', 'extension/docs/en/usage.md',
            'extension/docs/en/compatibility.md', 'extension/docs/en/validation.md',
            'extension/docs/en/changelog.md', 'extension/docs/en/skills.md'
        )
        foreach ($name in $required) {
            if ($name -notin $entries) { throw "Missing VSIX entry: $name" }
        }
        $unwanted = @($entries | Where-Object {
            ($_ -like 'extension/tunnel-client-v*') -or
            ($_ -like 'extension/node_modules/*') -or
            ($_ -like 'extension/out/*') -or
            ($_ -like 'extension/.agents/*') -or
            ($_ -like 'extension/plugins/*') -or
            ($_ -like 'extension/multi-shell-mcp-plugin-*.zip') -or
            ($_ -match '\.(exe|dll|so|node)$')
        })
        if ($unwanted.Count -gt 0) {
            throw "Unexpected VSIX content: $($unwanted -join ', ')"
        }
        Write-Host "Verified VSIX: $($entries.Count) entries"
    } finally {
        $vsixZip.Dispose()
    }

    npm run package:plugin
    if ($LASTEXITCODE -ne 0) { throw 'Plugin packaging failed' }
    $pluginName = "multi-shell-mcp-plugin-$version.zip"
    $pluginZip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $project $pluginName))
    try {
        $names = @($pluginZip.Entries | ForEach-Object FullName)
        $required = @(
            'multishell-mcp/plugin.json',
            'multishell-mcp/mcp.json',
            'multishell-mcp/README.md',
            'multishell-mcp/skills/setup/SKILL.md',
            'multishell-mcp/skills/multishell-mcp/SKILL.md',
            'multishell-mcp/skills/multishell-mcp/references/tool-guide.md'
        )
        foreach ($name in $required) {
            if ($name -notin $names) { throw "Missing plugin ZIP entry: $name" }
        }
        if ($names.Count -ne $required.Count) {
            throw "Unexpected plugin ZIP entry count: $($names.Count)"
        }
        if (@($names | Where-Object { $_ -like '*../*' }).Count -gt 0) {
            throw 'Unsafe plugin ZIP path'
        }
        Write-Host "Verified portable plugin: $($names.Count) entries"
    } finally {
        $pluginZip.Dispose()
    }

    Write-Host 'PASS: tests, lint, audit, VSIX and portable plugin'
    Write-Host "VSIX: $(Join-Path $project $vsixName)"
    Write-Host "Plugin: $(Join-Path $project $pluginName)"
} finally {
    Pop-Location
}
