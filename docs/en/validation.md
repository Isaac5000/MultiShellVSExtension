# Testing, validation, and troubleshooting

[Español](../es/validacion.md) · [Index](../../README.md)

Reference version: **MultiShell MCP Server 0.10.25**. Complete Windows validation: **51/51 passing automated suites**, ESLint clean, production dependency audit with no known vulnerabilities, and a verified 23-file VSIX. This does not guarantee absolute reliability or replace testing the installed VSIX, multiple real VS Code windows, or the live tunnel.

## Automated tests

From the repository root, with Node.js 22 or later and dependencies installed:

```bash
npm run test:multishell
npm run lint
npm run package
```

For complete Windows validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

The script runs tests and ESLint, checks known production dependency vulnerabilities using `npm audit --omit=dev --audit-level=low`, builds the VSIX, and verifies its contents. The package must not contain `node_modules`, uncompiled TypeScript, `out` outputs, native executables, or the tunnel client.

Automated coverage includes MCP HTTP, multi-window routing, aliases, file/read permissions, path traversal and symbolic links, FIFO queues, concurrency, cancellation and timeouts, terminal restoration, simulated modal approval, concurrent persistence, bilingual UI, Workspace Trust, and server recovery.

## Testing the installed extension

Before running commands, verify that the panel shows **ON**, the actual port, and the correct window. Use the **Windows** tab to verify IDs.

If you see `Restored shell ... requires confirmation`, the extension has preserved a restored terminal. **Inspect its process in VS Code** and select **Re-enable MCP** only after that process ends. Never force unlock while a command is still running. Then try a short command, such as `git status --short`.

Control requests such as `windows` or `shells` with `cwd="@mcp"` verify that the MCP service responds, **but do not prove that a terminal is ready to execute commands**.

### Manual verification checklist

- [ ] Confirm the installed VSIX matches the version being tested and the panel reflects the real port and status.
- [ ] Run a short command in the primary terminal after handling any restored-terminal confirmation.
- [ ] Open **two real VS Code windows**, check their coordinator/worker roles and separate IDs, and run commands in different terminals simultaneously.
- [ ] Create a temporary terminal using `create_shell_code` and verify it has `mcp` origin.
- [ ] **Only with explicit user authorization**, request a persistent terminal using `create_user_shell_code`; check the requests inbox, reject without creation, and approve with the correct metadata.
- [ ] Create and close user-owned terminals in the sidebar, checking for a single approval dialog and no interruption after denial.
- [ ] Run two parallel tasks in different user terminals and two consecutive commands in the same terminal; verify FIFO order and no overlap.
- [ ] Reload VS Code with user terminals open: restore their IDs without duplication and automatically re-enable sessions with verified idle evidence; prompt only for ambiguous cases.
- [ ] Confirm that primary and user-owned terminals **preserve their processes** after a timeout; temporary terminals may use a different policy.
- [ ] Test coordinator failover, worker disconnection, and recovery without mixing project files or terminal ownership.
- [ ] Verify tunnel reconnection after reloading the extension, without altering tunnel profiles or credentials.
- [ ] Confirm Workspace Trust prevents startup in untrusted folders and that Spanish/English UI text displays correctly.

## If the connector or commands fail

| Symptom | Check |
| --- | --- |
| `Restored shell ... requires confirmation` | The existing terminal is protected until you confirm that its command is finished |
| `Command timed out ... preserved` | The process may still be running; do not submit another command to that terminal yet |
| `Window ... offline` | Check that the owning VS Code window is open and its worker has reconnected |
| MCP answers `windows`, but commands fail | Check the busy state, shell integration, and restored-terminal confirmation |
| Panel displays ON, but ChatGPT cannot connect | Verify the local endpoint, the tunnel destination port, and the external connector |
| `create_user_shell_code` is missing | Refresh the tool schema or reconnect the MCP connector after updating the VSIX |

The ON indicator reflects the **local extension**, not proof that the remote tunnel is healthy.

## Packaging and portability

The VSIX should contain `extension/dist/extension.js`, `media/`, `package.json`, these documentation guides, and the license, without secrets or OS-specific binaries.

After creating the VSIX, `python scripts/make-portable.py` builds an archive containing source files, tests, scripts, docs, and a SHA-256 manifest. It must exclude `node_modules`, `out`, `dist`, private profiles, and credentials.

## Ubuntu

**Real-world validation is still pending:** Bash/Zsh, file permissions, suspend/resume, terminal recovery, and tunnel connectivity. A JavaScript-only package avoids Windows-native dependencies, but does not establish full Ubuntu support.

See [Usage](usage.md) for normal operations and [Installation](installation.md) for configuration.

## Live user-owned terminal tests — November 1, 2026

These tests ran against the **active** Windows MCP server. The persistent user terminal `prueba` was created through `create_user_shell_code` after local VS Code approval. The auxiliary terminals `prueba_aux` and `prueba_http` are temporary MCP-owned terminals.

| Test | Observed result |
| --- | --- |
| Five-second blocking command in `prueba` | Completed normally (`exit_code=0`) without closing the terminal |
| Thirty-second block in `prueba` with a one-second counter in `prueba_aux` | **True concurrency:** 30 ticks; total elapsed 30.324 seconds; both exited with code 0 |
| Two commands sent to `prueba` during a six-second operation | **FIFO confirmed:** the second started 66 ms after the first completed |
| One-second timeout with a six-second process in `prueba` | The process was preserved; overlapping commands were rejected; normal execution resumed after the original finished |

The thirty-second tasks began at almost the same time: 17:31:31.167 and 17:31:31.164 UTC. The blocked task completed at 17:32:01.180 UTC.

**Observed limitation:** two concurrent `execute_shell_command_code` requests through this ChatGPT session's legacy connector ran sequentially (two twelve-second tasks took about 28 seconds). The same tasks submitted as two direct MCP HTTP requests **did run concurrently**, isolating the issue to the connector invocation path rather than the server's general execution model.

**Additional issue to investigate:** the legacy shell tool occasionally returned partial output without an `exit_code` for a long Node.js command, even though the process completed and wrote its JSON report successfully.

### Reproduce these checks

From a **third terminal** distinct from either command destination, with the shells already present and MCP running:

```bash
node scripts/probe-live-concurrency.cjs prueba prueba_aux 30
node scripts/probe-live-fifo.cjs prueba 6
node scripts/probe-live-timeout.cjs prueba
```

The scripts do not create or unlock terminals. They write local results to `scripts/probe-live-*-results.json`, which is ignored by Git. Never run the test client inside the target terminal expected to execute its blocking command.

The project's primary terminal remained protected by an earlier timeout throughout these checks and was **not forcibly unlocked or terminated**. These checks do not validate real window reload, Ubuntu suspend/resume, or continuous remote tunnel availability.

## Tests added in 0.10.19

- Conservative detection for `less`, `more`, `top`, `htop`, and `man`; compound commands, pipelines, and editors never receive automatic keystrokes.
- Simulated terminal output tests: sending `q` without Enter, disabling the per-window setting, and confirming per-terminal override precedence.
- User request inbox: approval, denial, cancellation on disconnect, and shutdown cleanup.
- Verification that the internal control endpoint cannot approve requests without a local panel action.
- Panel controls: window policy, terminal exception, and inbox denial.

Command detection and the UI have been tested with simulated VS Code APIs. Real behavior with `less` should be checked after installing the new extension without disrupting the active tunnel.
### Temporary-terminal inheritance (0.10.19)

The `test/test-temporary-autoexit-inheritance.cjs` suite verifies that temporary terminals inherit the window setting rather than the creator override, follow live window changes, honor terminal overrides, discard stale exceptions on reused IDs, and remain isolated across windows. The test uses a mock VS Code API; live testing with real windows remains pending.
### Automatic recovery of restored terminals (0.10.19)

The `test/test-automatic-restored-recovery.cjs` suite verifies that a definite shell-integration completion event automatically unlocks restored primary and user-owned terminals, including when it arrives during reattachment. It also confirms that unrelated terminals, ambiguous exit codes, and still-active executions do not remove the safety guard and that no probe commands are sent to preserved processes. Without verifiable completion evidence, manual idle confirmation remains required. These are mocked VS Code tests; real restored-terminal behavior needs verification after installing the new version.
## Regression coverage added in source version 0.10.22

- `test/test-restored-idle-proof.cjs`: match process identity, directory and saved idle state; reject replaced processes and ambiguous activity.
- `test/test-late-main-recovery.cjs`: a late restored primary replaces a newly created fallback only when the fallback has not been used.
- `test/test-busy-main-recovery.cjs`: a used fallback cannot be destroyed or duplicated by a late original main.
- `test/test-restored-controller.cjs` and `test/test-restored-shells.cjs`: only one managed primary even if older physical mains remain.
- `test/test-panel-layout.cjs` and `test/test-panel.cjs`: opened terminal menus appear above later action buttons; panel language follows VS Code without a manual selector.

**Automated validation complete:** all 49 suites ran together in the `audit022` temporary terminal; the 0.10.22 VSIX has been built and verified. Reload behavior with the newly installed package still needs real-world testing. Historical physical orphaned terminals are not automatically closed without adequate safety evidence.
### Recovery checks added in 0.10.22

Tests have been extended to distinguish the recovery and automatic-exit icons, observe execution-state notifications, and reject unsafe restoration. Idle evidence is saved during ordinary activity, not only on deactivation. **Automated validation passed; a real reload with 0.10.22 installed is still outstanding.**
### New concurrency regressions in 0.10.22

- `test/test-execution-races.cjs`: FIFO cancellation, manual shell commands, a manual start between queued commands, output stream errors and ambiguous execution status.
- `test/test-restored-user-shells.cjs` and `test/test-restored-user-controller.cjs`: only saved `user` sessions reattach; temporary and unowned sessions cannot be promoted.
- `test/test-user-shell-authorization.cjs`: disconnected requests during approval or persistence do not leave unacknowledged user terminals.
- No complete protection is possible if VS Code fails to emit manual command start events or cannot establish the terminal's idle state.
### Interactive-output regression coverage for 0.10.25

The new `test/test-interactive-safety.cjs` distinguishes noninteractive options from pager sessions, tests alternate-screen detection, rejects sending `q` on ordinary output, and checks bounded 750 ms draining when output lingers after confirmed completion. Additional Linux monitors are mock-tested only; their native behavior still requires Linux validation.
### Isolated execution regression (0.10.25)

Run `node test/test-isolated-command.cjs` after compilation. It checks that an isolated subprocess uses the selected working directory, suppresses Git pagers and prompts, limits output to 1 MB, handles timeout and cancellation, and never writes into the integrated terminal. Also run `npm run test:multishell`, `npm run lint`, and `npm run package`. Test counts and packaging should only be recorded after execution.
