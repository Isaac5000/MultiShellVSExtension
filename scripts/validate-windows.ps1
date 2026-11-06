$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    $version=(Get-Content package.json -Raw | ConvertFrom-Json).version
    Write-Host "MultiShell MCP $version - Windows integrated package validation"
    npm run test:multishell
    if($LASTEXITCODE -ne 0){throw 'Automated tests failed'}
    npm run lint
    if($LASTEXITCODE -ne 0){throw 'ESLint failed'}
    npm audit --omit=dev --audit-level=low
    if($LASTEXITCODE -ne 0){throw 'Production dependency audit failed'}

    npm run package:all
    if($LASTEXITCODE -ne 0){throw 'Native VSIX and plugin packaging failed'}
    $target=(node -p "process.platform+'-'+process.arch").Trim()
    $vsixName="multi-shell-mcp-server-$version-$target.vsix"
    if(!(Test-Path -LiteralPath $vsixName)){throw "Missing integrated VSIX: $vsixName"}
    node test/test-platform-vsix-tunnel.cjs
    if($LASTEXITCODE -ne 0){throw 'Official tunnel or license evidence missing from VSIX'}
    node test/test-package-privacy.cjs
    if($LASTEXITCODE -ne 0){throw 'Private data in VSIX'}

    # The plugin ZIP is distinct from the native VSIX and is useful for clients
    # that install a separate MCP plugin. It does not create another VSIX.
    $pluginName="multi-shell-mcp-plugin-$version.zip"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[System.IO.Compression.ZipFile]::OpenRead((Join-Path $project $pluginName))
    try {
        $names=@($zip.Entries | ForEach-Object FullName)
        $required=@(
            'multishell-mcp/plugin.json',
            'multishell-mcp/mcp.json',
            'multishell-mcp/README.md',
            'multishell-mcp/skills/setup/SKILL.md',
            'multishell-mcp/skills/multishell-mcp/SKILL.md',
            'multishell-mcp/skills/multishell-mcp/references/tool-guide.md'
        )
        foreach($name in $required){
            if($name -notin $names){throw "Missing plugin ZIP entry: $name"}
        }
        if($names.Count -ne $required.Count){throw 'Unexpected plugin ZIP contents'}
        if(@($names | Where-Object {$_ -like '*../*'}).Count -gt 0){
            throw 'Unsafe plugin ZIP path'
        }
    } finally {$zip.Dispose()}
    Write-Host "PASS: one Windows native VSIX, official tunnel, tests, lint, audit, plugin"
    Write-Host "VSIX: $(Join-Path $project $vsixName)"
    Write-Host "Plugin: $(Join-Path $project $pluginName)"
} finally {Pop-Location}
