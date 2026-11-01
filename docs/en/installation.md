# Installation and distribution

[Español](../es/instalacion.md) · [Index](../../README.md)

Current guide for **MultiShell MCP Server 0.10.25**. Requires **Visual Studio Code 1.99 or newer**.

## Install or update from VSIX

The installer is `multi-shell-mcp-server-0.10.25.vsix`. It is generated in the project root; a Git clone **does not include it**, because generated packages are excluded from the repository.

In VS Code, run **Extensions: Install from VSIX...**, select the file, then run **Developer: Reload Window**. Alternatively:

```powershell
code --install-extension .\multi-shell-mcp-server-0.10.25.vsix --force
```

The command above uses PowerShell path syntax. On Linux, replace `.\` with `./`.

After updating, open the **MultiShell MCP** panel and confirm the server is ON. Preserved terminals may require you to confirm that their previous commands have ended; **never unlock them while a task is still running**.

If ChatGPT still displays the old tool schema, refresh or reconnect the MCP connector to discover `create_user_shell_code`.

## Build from source

Install **Node.js 22 or newer** and npm. From the project root:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

The output is `multi-shell-mcp-server-0.10.25.vsix`. For the complete Windows validation, including a production-dependency audit and installer content checks, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

The `scripts/build-install.ps1` helper can build and optionally install the extension with `-Install`. Installation or a window reload may briefly interrupt the local MCP server. Avoid installing during tasks that depend on that connection.

A prebuilt VSIX requires **neither Node.js nor Python** for installation.

## Initial configuration

1. Open a project folder in VS Code and grant **Workspace Trust**; the extension does not start in Restricted Mode.
2. Disable other MCP extensions attempting to bind to the same port.
3. Open **MultiShell MCP** and select **Start** if the server is OFF. The default endpoint is `http://127.0.0.1:3000/mcp`.
4. Configure or reconnect Tunnel Client and the ChatGPT connector separately. If you change the local port, update the tunnel destination as well.
5. After **Reload Window**, idle sessions are recovered when verified. Only when prompted, check the previous process has finished before selecting **Re-enable MCP**.

The installer contains **no tunnel profiles, API keys, credentials, or active sessions**. The extension does not add OAuth to the local endpoint; **do not publish that endpoint directly** without an external access-control layer.

See the [User guide](usage.md) for approved persistent terminals and multitasking, or [MCP compatibility](compatibility.md) for older connector arguments.

## Portable ZIP

After running `npm run package`, create a portable source archive using Python 3:

```bash
python scripts/make-portable.py
```

On Windows, `py scripts/make-portable.py` is also supported. The archive `MultiShell-MCP-Server-0.10.25-portable.zip` contains the top-level directory `MultiShell-MCP-Server-0.10.25` with source code, tests, scripts, documentation, the VSIX, and a SHA-256 integrity manifest.

`node_modules`, `out`, `dist`, private configuration, sessions, and tunnel data are excluded. Inspect the archive before sharing it.

## Platform compatibility

The VSIX bundles JavaScript and panel assets without Windows-specific native binaries. The automated tests have been validated on Windows, but **real-world Ubuntu testing is still pending**. See [Validation](validation.md).

The extension retains the technical identity `local-multishell.multi-shell-mcp-server` and the MIT license. [The project README](../../README.md) credits [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server).