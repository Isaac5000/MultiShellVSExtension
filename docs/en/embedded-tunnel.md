# Bundle the official tunnel with the extension

**MultiShell MCP 0.10.72.** The extension uses a single **TypeScript/JavaScript** codebase running on VS Code's Node.js runtime across Windows, Linux and macOS. The official tunnel still uses native OpenAI Tunnel Client v0.0.19 and cloudflared binaries. Its authentication and transport are not reimplemented.

## One VSIX per platform

Each platform-specific VSIX ships just one verified official OS/architecture bundle, its license evidence and the shared JavaScript extension. Supported *build targets* are `win32-x64`, `win32-arm64`, `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`. Windows x64 packaging was inspected locally. Other runtime targets have not been exercised on their respective operating systems.

**macOS exception:** OpenAI's directly downloaded release ZIPs are not notarized and may be blocked by Gatekeeper. OpenAI recommends `brew install openai/tools/tunnel-client` on macOS. Creating a Mac-targeted VSIX does not prove Gatekeeper compatibility, and bypassing notarization is not advised.

## Build the integrated installer

From the project root:

```bash
npm run package
```

The command bundles/minifies JavaScript, verifies the pinned upstream archive, and generates **only one platform-specific VSIX**, such as `multi-shell-mcp-server-0.10.72-win32-x64.vsix`. Use `npm run package:all` if you also need the separate optional MCP plugin ZIP.

For another OS/architecture:

```bash
npm run package -- --target=linux-arm64
```

The builder downloads the **official** release archive only at build time, caps its size, verifies the pinned SHA-256 and extracts an allowlist of binaries and license documents into an isolated temporary extension. An already authenticated archive can be passed using `--archive=/path/to/tunnel-client.zip`. Build-only archives are cached in `.vscode-test/official-tunnel-archives`, excluded from both Git and VSIX.

`npm run package:all` builds the **same integrated VSIX** and the optional independent MCP plugin ZIP; it never creates a second VSIX.

## Runtime layout and migration

On a fresh installation the extension verifies both native binary hashes and launches the packaged tunnel directly, without a second globalStorage copy or a runtime download. Credentials, profiles and runtime locks remain in secure user storage.

On an upgraded installation, a surviving older tunnel is adopted only after verifying its running process identity and executable against the ownership lock. Otherwise, the bundled native executable takes precedence. Nothing is overwritten, stopped or removed automatically. Safe cleanup of the legacy executable copy requires a separate, explicit user action after the tunnel is stopped and the new installation is verified.

## Disk usage

The JavaScript bundle shrinks from 3,559,546 bytes to approximately 2.07 MB after safe esbuild minification. This does **not** shrink the native tunnel and cloudflared binaries (approximately 66.9 MB unpacked on Windows x64). The integrated Windows x64 VSIX is approximately 31 MB compressed, but the installed binaries must still occupy their actual uncompressed size. A universal pure JavaScript port is not interchangeable with the verified official native tunnel.

Only Windows x64 staging and VSIX contents have been checked with the actual upstream release at this point; other platform runtime behavior and macOS notarization remain unverified.

Sources: [official tunnel release](https://github.com/openai/tunnel-client/releases/tag/v0.0.19), [OpenAI tunnel client macOS installation](https://github.com/openai/tunnel-client/blob/master/README.md), [VS Code platform-specific packages](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Native executable selection (0.10.72)

On each **new launch**, including autostart, the extension prioritizes its own SHA-256 verified native executable. A globalStorage copy is selected only to safely adopt a live legacy process whose PID, start identity, executable and arguments match the verified ownership lock. Stale locks and inactive legacy files cannot override the embedded path. Only integrated VSIX installers are now produced.

## Verified adoption after an extension upgrade

A surviving tunnel started by an older installed VSIX can be adopted when its former extension directory still exists and the official binary passes hash checks. The ownership lock must also match the running PID, kernel start time, executable and invocation. A stale lock, removed older VSIX or unrelated process is left untouched; new launches prefer the current integrated binary. Installation/reload may interrupt the MCP connection, so install updates deliberately.

## Native integrity requirement (0.10.72)

Every fresh start requires the official binaries **inside the installed native VSIX**, verified by SHA-256. Neither the Verify action nor autostart downloads to globalStorage. Missing or altered binaries require reinstalling the correct platform VSIX. Old copies can be used only to reattach a live process with matching ownership fingerprint, never to start a new one. Existing credentials, profiles and unrelated processes are untouched.
