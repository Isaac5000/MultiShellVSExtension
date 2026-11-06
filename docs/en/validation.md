# Testing, validation, and troubleshooting

## Persistent agent and SQLite memory (0.10.57)

- Focused suites cover SQLite persistence, isolated lexical memory retrieval, checkpoint recovery, session ownership and handoffs, cross-process writer locks, local file import and CLI operations.
- Tests exclusively use a fake adapter, never live models, MCP shell commands or paid APIs.
- Crash recovery leaves work paused or blocked until locally reauthorized.
- The standalone simulator requires **external Node.js 24+**; the VS Code extension itself keeps its existing runtime requirements.

## Simulated continuation and persisted recovery (0.10.56)

- Focused coverage includes fake agent stage accounting, context handoffs, explicit consent, budgets, idempotence, thread identity, malformed checkpoints and VS Code persistence.
- Restored goals are always paused until explicitly reauthorized. Corrupted local snapshots are rejected and storage writes are serialized.
- New conversations are **fake**, with no calls to Codex or other real AI providers, and no widened MCP permissions.
Cross-chat persistence is verified by test/test-chat-handoff-http.cjs and test/test-chat-handoff-store.cjs. No automatic-chat simulator exists.

## Panel and MCP protocol optimization (0.10.55)

- Passing tests: `test-bounded-map`, `test-ai-provider-status-parallel`, `test-panel-config-status-parallel`, `test-panel-hidden-refresh`, and `test-mcp-compact-responses`.
- Independent client profile checks run with up to six profiles concurrently, with ordered results and no secret caching.
- Hidden views skip periodic window, file and SecretStorage polling and refresh when shown again.
- Shell, file and native VS Code MCP tools use compact JSON, preserving data and access controls.
- **144/144 automated suites passed across five batches**, with compilation, bundle, ESLint and strict TypeScript passing.
- Real graphical VS Code tests remain blocked by the active updater; no installer process was terminated.

## Agent Skills indexing and caching (0.10.54)

- Regression cases cover edit/add/remove invalidation, SHA-256 integrity, path and symlink checks, object isolation, compact JSON and direct UTF-8/binary Base64 resource handling.
- Synthetic Windows fixture, 180 skills/360 files, nine pages: ~6.99 s originally, ~0.87 s warm and ~1.28 s on the initial scan.
- Access and containment checks are still required; external MCP Skills responses keep `ttlMs: 0`.
## Asynchronous isolated jobs (0.10.53)

- New regressions cover background job lifecycle, HTTP MCP tools, full coordinator replacement, processing while the integrated terminal remains busy, scoped AI access, panel feedback and shell-ID revocation.
- Start returns a `job_id` immediately. Status polling retrieves partial output and completion without replay. Explicit cancellation targets only MultiShell-owned isolated child processes.
- **133/133 automated suites passed** in five batches. Compilation, strict TypeScript and ESLint have been verified. Real graphical VS Code tests remain pending while its updater blocks launching an isolated extension host.
- Safety limits: 12 concurrent jobs, 96 history entries, 30-minute retention and the latest 16 KiB of output. Jobs cannot be recovered after the owning VS Code window itself restarts.



## PowerShell 7 installed and live VS Code integration (2026-11-04)

- **Environment:** PowerShell 7.6.9 runs on Windows. The `pwsh.exe` WindowsApps execution alias is launchable but Node's `fs.existsSync()` returns false. Both `test:vscode` and `test:windows` now validate launchability with `pwsh --version`, covered by `test-test-shell-resolver.cjs`.
- **Complete suite:** **126/126 automated suites passed** in five batches and were aggregated without duplicates. ESLint, TypeScript compilation, bundling and `git diff --check` passed.
- **Live integration:** `test:vscode` was started using an isolated profile, but VS Code refused to launch it with `Code is currently being updated`. The active `CodeSetup-stable-...` installer held the update mutex and the harness expired after 180 seconds without starting its extension host. No user or installer process was terminated.
- **Remaining:** finish the VS Code update, then run `npm run test:vscode` and `npm run test:windows`. Real terminal behavior, the unwanted Windows Terminal window and two-window failover remain unverified.

## Gateway and test hardening (2026-11-04, unreleased)

- **AI gateways:** `stopOne()` keeps a gateway tracked until `stop()` succeeds. A failing shutdown and safe retry are covered; failed shutdown prevents unsafe credential rotation.
- **Real VS Code harnesses:** `test:vscode` and `test:windows` now send the required per-installation local credential from an isolated profile token file without logging secrets. The 80 command exercise runs in 20-request waves.
- **GitHub Actions disabled (2026-11-06):** removed `.github/workflows/ci.yml` because of a billing-related account lock. Building, linting, regression testing and native packaging remain available through local `npm` commands; pushes and pull requests no longer launch jobs.
- **Batched suite:** run `npm run bundle`, then `npm run test:batch -- --batch=1 --batches=5 --report=.vscode-test/test-results/batch-1.json` (repeat for 2–5). `node scripts/aggregate-test-reports.cjs .vscode-test/test-results` detects failures, duplicates and missing batches.
- **Webview:** structural checks verify IDs, CSP, nonce and local resources without a fixed SHA-256 that would reject legitimate markup edits.
- **Local verification:** **125/125 suites passed** in five groups of 25; bundling, compilation, ESLint and strict TypeScript also passed. Reports are in `.vscode-test/test-results`.
- **Remaining checks:** real graphical tests require PowerShell 7 (`pwsh`), not available in the checked environment. Local Linux/macOS testing, client sign-in and Windows Terminal startup behavior remain unverified; no GitHub Actions jobs are configured.

## Unreleased refactor of v0.10.52 code (2026-11-04)

- Extracted static webview markup to `src/panel-markup.ts`, initially verifying byte-for-byte equivalence. The current regression checks identifiers, CSP, nonce and resource paths without permanently pinning a hash.
- Moved registration of eight tunnel commands out of `activate()` into `registerTunnelCommands`, retaining the original order and command handlers.
- Removed an unused import and two redundant stored controller properties, preserved compatibility parameters, and simplified remote AI gateway window hiding.
- **All 119 automated suites passed** in five batches (24 + 24 + 24 + 24 + 23). Compilation, bundling, ESLint and TypeScript `noUnusedLocals`/`noUnusedParameters` checks also passed.
- No new version number or published VSIX. Real VS Code UI behavior, remote tunnel connectivity and the Windows Terminal startup symptom still need hands-on validation after installation.

**0.10.51 result:** all 116 automated suites passed in five batches (24 + 23 + 23 + 23 + 23); TypeScript compilation, VSIX/plugin packaging, ESLint and `git diff --check` succeeded. Production npm dependency audit reported 0 advisories. Manual post-install checks remain for VS Code startup, the unwanted Windows Terminal window, and ChatGPT connectivity over a real tunnel.


## Validation 0.10.52 — Authenticated AI gateways and scoped directory listings

**Regression result:** all 118 automated suites passed in five batches (24 + 24 + 23 + 24 + 23), including the new directory-swap regression and detection of legacy unauthenticated MCP client configurations. The provider catalog no longer advertises automatic installation for clients requiring an individually authenticated gateway.

`test-authenticated-local-config.cjs` and `test-ai-panel.cjs` verify that legacy URL-only configs are not treated as authenticated or silently installed. `test-ai-connection-render.cjs` checks that the obsolete automatic setup button is gone and managed legacy entries can still be disconnected. `test-list-file-race.cjs` deterministically reproduces external directory names during an ancestor swap and requires denial. Copied Bearer examples contain only a placeholder, not the stored credential.

**Remaining manual checks:** sign in from actual Gemini/Claude/Cursor/Copilot clients after secure credential setup; confirm no new Windows Terminal window after the upgrade; verify the ChatGPT tunnel still works. Portable Node.js protections mitigate but cannot formally eliminate all filesystem rename races.

## Validation 0.10.51 — MCP hardening and startup console

Regressions: `test-runtime-hardening.cjs` enforces main-listener auth, HTTP 401 before JSON parsing and 32-request HTTP 429 throttling; `test-security-audit-probes.cjs` checks that deterministic symlink swaps cannot return or replace external canaries; `test-native-shell-compat.cjs` checks safe single-shell fallback and ambiguous-shell rejection; `test-tunnel-lifecycle.cjs` checks environment-backed local auth headers and Windows child launch options.

**Manual check after installation:** stop and start the managed tunnel once in the panel, then restart VS Code. Confirm no extra Windows Terminal window appears and ChatGPT can still invoke tools using the same `tunnel_id`. No user-created terminals were terminated as part of the tests.

**Technical boundary:** portable Node.js lacks descriptor-relative open primitives needed to prove total freedom from all adversarial ancestor-rename races. Tests cover the reproduced race schedules, not every possible OS-level interleaving.

## Validation 0.10.51 — ChatGPT custom MCP plugin setup and removed unused keys

`test-chatgpt-plugin-guide.cjs` verifies that the ChatGPT guide covers official **Add custom MCP server** / **Tunnel** setup and reuses the same `tunnel_id` across Platform, MultiShell and ChatGPT. It checks four authorized official links (Tunnels, runtime keys, ChatGPT and custom MCP help) and ensures the ChatGPT plugin instructions **never request the tunnel runtime API key**. Onboarding tests ensure Gemini CLI and Claude Code no longer show unnecessary API key fields and that legacy keys require explicit user deletion.

**Regression:** 113/113 suites across four batches (29 + 29 + 29 + 26); TypeScript and ESLint passed. These tests validate the instructional and local UI behavior, **not actual custom plugin registration in a ChatGPT account**, workspace tunnel associations, or third-party OAuth consent.

## Validation 0.10.49 — Guided provider setup and credential security

Regression fix: the legacy panel test mocked `workspaceState` without `globalState`. The provider-credential status reader now supports this testing fallback, and `test-panel.cjs` waits for the initial valid state and always disposes refresh timers after an assertion failure. The hanging `node test/test-panel.cjs` was reproduced and fixed, with a verified zero exit status. All **112 regression suites** passed across four batches (29 + 29 + 29 + 25).

`test-ai-provider-onboarding.cjs` verifies 10 bilingual provider guides, official HTTPS resources, suitable per-provider fields, secure per-profile SecretStorage and safe public URL validation. It asserts secrets never appear in metadata or Webview snapshots, rejects HTTP/localhost/embedded credentials, blocks foreign fields and checks selective clearing. `test-ai-panel.cjs` checks save/clear actions, trust rules, unsafe URL rejection and catalog-verified documentation opening. `test-ai-connection-render.cjs` checks **?** disclosures, command previews, empty password inputs for stored secrets and no credential leaks in rendered cards.

**Limit:** local application integration still requires real tests inside the user's AI client. These guides do not establish live Claude web/Grok OAuth or a public tunnel.

## Validation 0.10.48 — Independent AI authentication and isolation

New tests: `test-ai-access.cjs` checks constant-time Bearer comparison, exact shell ID authorization, cross-shell read/execute denial, global permission ceilings and changed-root refusal. `test-ai-gateways.cjs` creates five actual independent loopback MCP servers, sends simultaneous requests with five distinct credentials and checks cross-profile 401 responses, prohibited tool calls, cross-shell scope denial, hidden coordinator admin endpoints, untrusted origins (403), independent key rotation/revocation, opt-in autostart and immediate refusal on hub loss (503). `test-ai-panel.cjs` checks confirmation prompts and no key leakage to Webview snapshots.

Additional tests: `test-ai-gateway-limits.cjs` holds 32 authenticated MCP requests and verifies that the 33rd receives HTTP 429 with `Retry-After: 1`, while bad bearer tokens still receive HTTP 401. `test-package-privacy.cjs` checks the packaged VSIX excludes local `.mcp.json`, backup and temporary connector files.

**Evidence limits:** simulated MCP HTTP clients, not live Claude/Grok web connectors or an HTTPS tunnel. Provider account sign-in and safe public transport remain outstanding. The existing local port 3000 server continues to serve the OpenAI Tunnel Client without per-client identity isolation; these security policies apply to new authenticated gateway endpoints.

## Validation 0.10.47 — Visible AI cards and safe shell escaping

New tests:
- `test-ai-connection-render.cjs`: every script-referenced DOM ID exists in the webview and local/remote persisted profiles render separate cards.
- `test-interactive-escape-guards.cjs`: unclosed quotes, ambiguous backslash escapes and control characters never qualify for automatic pager termination, while safely quoted commands remain eligible. The PowerShell `>>` prompt produces a hint only.
- `test-interactive-safety.cjs` adds simulated pager-looking output for malformed commands and verifies no `q` is injected.

**Regression outcome:** 107 of 107 suites passed across four batches; TypeScript compilation, ESLint and bilingual documentation checks passed. These tests do not establish live external-AI sessions or perfect handling of every malformed shell command.

## Validation 0.10.46 — Provider-specific surfaces and explicit cloud connection boundary

`test-ai-provider-catalog.cjs` validates the local/remote surface registry, HTTPS official setup locations, bilingual transport requirements, local profile persistence without secrets and rejection of invalid localhost snippets for cloud profiles. `test-ai-panel.cjs` checks the UI cannot auto-install local MCP settings for a Claude web profile, does not claim remote connectivity and opens only catalog-authorized official setup URLs.

**Limitations:** tests are not evidence of live cloud-provider connections. No public authenticated HTTPS gateway, provider-issued OAuth credentials or per-profile tool authorization is deployed by this version. Local MCP port exposure remains unchanged. External account authentication and connector registration still follow the vendor's official process.

## Validation 0.10.45 — Fully graphical local client configuration

`test-ai-client-config.cjs` validates Copilot, Gemini CLI, Cursor and Claude Code using isolated temporary directories: safe JSONC merging and comment preservation, backups, idempotent setup, removing only owned entries, safe removal after port changes, existing-server conflicts, symlinks and exclusive write locks. `test-ai-panel.cjs` verifies configure/disconnect confirmations, Workspace Trust enforcement and prevention of profile deletion while its configuration is managed. `test-panel-layout.cjs` checks the visible configuration actions.

**Windows automated validation:** all 104 suites passed in four batches, TypeScript and ESLint passed. Client configuration tests only use temporary files; **no actual Copilot, Gemini, Claude or Cursor user settings were modified**.

**Limits:** no live AI application sign-in or post-configuration MCP discovery has been verified. “Configured” means an on-disk MCP entry was checked, not proof of a live AI client session. MultiShell still lacks per-client MCP identity authorization and isolated shell/tool permissions.

## Validation 0.10.44 — Requests UI, five-client concurrency and load

Updated `test-panel-layout.cjs` and `test-panel.cjs`: the Requests view has one heading and count with directly visible approvals/empty state, without a nested `<details>`.

New suites:
- `test-five-ai-clients.cjs`: five independent MCP HTTP clients, one coordinator, five workers, 147 calls. Cross-shell execution overlap, shared-shell FIFO, no pending queues, response routing and deliberate negative proof of missing per-client identity authorization.
- `test-five-ai-one-window.cjs`: five clients, one coordinator, five simulated shells in one worker, 207 calls. Distinct workspace roots, prevented accidental sharing and progress while one shell is blocked.
- `MULTISHELL_SOAK_SECONDS=30 node --expose-gc test/connection-soak.cjs`: 6,756 simulated commands in 30.1 seconds, 48 ms p95 request latency, 46.56 ms p99 event-loop lag, no unexpected errors, heap growth within test thresholds.

**Final code validation:** HTTP request cancellation now flows to tool dispatch using request-scoped `AsyncLocalStorage` and combines with the SDK's signal when present. The 100-request/80-cancellation regression passed **three consecutive executions**, and the full `npm test` log contains **PASS: 103 test suites** after this change. ESLint and npm audit also passed (zero known vulnerabilities). The MCP terminal channel reattached during the integrated run, so the final result was read from its saved log rather than the tool's exit response.

The earlier intermittent overload failure remains a reason not to claim universal 100% cancellation reliability. An experimental mock without proper shutdown was excluded from the suites. Real five-provider acceptance and physical Linux/macOS testing remain pending.

**Limits:** synthetic workers/terminals, not five actual AI products or real compilations. Per-shell FIFO is not per-AI identity authorization; one MCP caller can request another caller's shell, and editing operations have no universal client-specific file lock. Use distinct worktrees/directories for concurrent writers; do not expose the unauthenticated local MCP port publicly.

## Validation 0.10.43 — Structured menu and local AI clients

New tests `test-panel-navigation.cjs`, `test-ai-connections.cjs` and `test-ai-panel.cjs` cover active navigation, credential-free local profiles, MCP client setup snippets, explicit security acknowledgement, untrusted workspace rejection and preservation of external processes. The redesign does not change existing terminal execution or permissions.

No additional AI is considered verified before an end-to-end call from its real client. All local client profiles currently share server-wide tool permissions.

## Validation 0.10.42 — Lock, process recovery and port hardening

**98 of 98 automated suites passed on Windows** in four batches after stabilizing port-restart and FIFO network-order tests. TypeScript, ESLint and `npm audit --audit-level=low` passed with zero known vulnerabilities. New regression coverage includes concurrent stale-lock reclaim, lock replacement during asynchronous checks, orphaned recovery guards, native Windows process identity, simulated reattachment and stop, and atomic YAML-preserving port synchronization. Ambiguous identities fail closed.

The live external tunnel is not modified during testing; remote end-to-end testing and physical Linux/macOS acceptance are still pending.

## Validation 0.10.41 — Integrated Tunnel tab

Panel regression tests now cover installation, profile creation/reuse, start, native disconnect confirmation, autostart, local host validation and absence of API keys in outgoing webview snapshots. These are manager-mocked tests, not a live production connection. **95 of 95 automated suites passed** on Windows, divided into four groups to avoid MCP terminal timeouts. TypeScript and ESLint also passed. Manual VSIX acceptance and a real remote-tunnel connection remain pending.

## Validation 0.10.40 — Tunnel Client v0.0.19 Manager

- **94 of 94 automated suites passed** on Windows, including extension command registration, ZIP extraction and SHA-256 integrity, interprocess locks, imported profile checks, and simulated Tunnel Client start/restart/stop.
- TypeScript, ESLint, bilingual documentation and `npm audit --audit-level=low` passed, with **0 known vulnerabilities** reported.
- The setup flow stores runtime API keys in `ExtensionContext.secrets`, initializes isolated profiles, and does not overwrite or terminate an already running external tunnel.
- Installation logic supports Windows, Linux and macOS on x64 and ARM64. **Physical installation and acceptance testing on Linux/macOS are still pending.**
- **Pending:** true end-to-end testing through a live tunnel managed by the new commands using user-provided credentials. This was deliberately skipped to preserve the current external session.


[Español](../es/validacion.md) · [Index](../../README.md)

Reference version: **MultiShell MCP Server 0.10.51**. Validation includes compilation, ESLint, npm audit, regressions, HTTP load, and real VS Code windows with isolated profiles. Current results and their limits are recorded below; local tests do not establish external tunnel continuity.

Agent Skills regressions cover `SKILL.md` parsing, YAML metadata, multi-window scoping, path safety, `skill://index.json` resources, and read permissions. See [Agent Skills](skills.md).

## Automated tests

From the repository root, with Node.js 22.13 or later and dependencies installed:

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

If a restored terminal awaits verification, MultiShell automatically inspects the PowerShell runspace. **Check availability** retries without a manual confirmation dialog. A failed query never proves idle state; also verify shell integration for integrated commands.

Control requests such as `windows` or `shells` with `cwd="@mcp"` verify that the MCP service responds, **but do not prove that a terminal is ready to execute commands**.

### Manual verification checklist

- [ ] Confirm the installed VSIX matches the version being tested and the panel reflects the real port and status.
- [ ] Run a short command in the primary terminal after automatic recovery.
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
| Pending recovery state | Automatic PowerShell runspace inspection; failed verification retains protection |
| `Command timed out ... preserved` | The process may still be running; do not submit another command to that terminal yet |
| `Window ... offline` | Check that the owning VS Code window is open and its worker has reconnected |
| MCP answers `windows`, but commands fail | Check the busy state, shell integration, and automatic recovery verification |
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

`test/test-automatic-restored-recovery.cjs` covers definite completion events. `test/test-terminal-recovery-regressions.cjs` adds lost events, busy runspaces, activity invalidating a query, pre-dispatch cancellation, and stale readers. `test/test-shell-readiness.cjs` inspects a dedicated PowerShell process to distinguish idle state, silent work, and input waits.
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
### Interactive-output regression coverage for 0.10.27

The new `test/test-interactive-safety.cjs` distinguishes noninteractive options from pager sessions, tests alternate-screen detection, rejects sending `q` on ordinary output, and checks bounded 750 ms draining when output lingers after confirmed completion. Additional Linux monitors are mock-tested only; their native behavior still requires Linux validation.
### Isolated execution regression (0.10.27)

Run `node test/test-isolated-command.cjs` after compilation. It checks that an isolated subprocess uses the selected working directory, suppresses Git pagers and prompts, limits output to 1 MB, handles timeout and cancellation, and never writes into the integrated terminal. Also run `npm run test:multishell`, `npm run lint`, and `npm run package`. Test counts and packaging should only be recorded after execution.
### Incomplete-command regression (0.10.27)

After compiling, run `node test/test-pending-interactive-commands.cjs` and `node test/test-recovery-reasons.cjs`. They cover pager and input-prompt hints, silent periods, output stream closure without completion, prematurely emitted completion events, and FIFO guards. The tests must never inject keys into real processes. Run `npm run test:multishell` and `npm run lint` before packaging a VSIX.

## Validation 0.10.27 — November 2, 2026

- `npm run test`: **57/57 suites**, including compilation and bundling.
- `npm run lint`: no errors or warnings. Native VS Code diagnostics: no errors or warnings.
- `npm audit`: **0 known vulnerabilities**, including development dependencies. ESLint 10 and minimatch 11.0.1.
- `npm run test:vscode`: **12/12 real checks**, using a separate profile, folders, port, and test terminals. Requires PowerShell 7; `MULTISHELL_TEST_SHELL` selects its executable and `VSCODE_EXECUTABLE` selects VS Code.
- Real checks cover startup, commands, parallelism, FIFO, isolated execution, temporary timeout, process preservation, manual activity, unfinished input, idle restoration, busy restoration, and a lost completion event. The final three cases instantiate the compiled manager inside VS Code; they do not establish full application-restart acceptance.
- Inspection recognizes both an available runspace and an empty PSReadLine prompt. A currently busy runspace overrides an older idle snapshot. New execution activity invalidates an in-flight inspection.
- No exit code is invented when only idle state can be verified.

After `npm run bundle`, repeat real checks with `npm run test:vscode`. Reports are saved under `.vscode-test/terminal-integration/`, excluded from Git and the VSIX. Real window reload with persistent sessions, multiple real windows, the tunnel, and Linux remain unverified. Unverifiable shells remain protected; isolated execution remains available for non-interactive work.

## Connection validation 0.10.28 — November 2, 2026

| Check | Result |
| --- | --- |
| `npm run test` | **63/63 suites**, including compilation and bundling |
| `npm run lint`, native VS Code diagnostics | No errors or warnings |
| `npm audit --audit-level=low` | **0 known vulnerabilities**, including development dependencies |
| `npm run test:vscode` | **12/12 checks** with real PowerShell terminals |
| `npm run test:windows` | **6/6 scenarios** with two real windows, fresh profiles, and a private test port |
| `npm run test:connection` | **46,056 commands in 180 seconds**, 12 concurrent requests, 76 worker reconnects, and 30 coordinator restarts |

Sustained load uses real HTTP and MCP servers with a simulated terminal API. It checks every command's output and destination, empty queues, and cleanup of sessions, requests, and listeners. The final run had no unexpected errors; latency p95 **42 ms**, p99 **52 ms**, maximum **102 ms**. Retained heap grew **6,113,760 bytes** after requesting garbage collection, below this test's 32 MB limit. This does not establish leak-free operation over days. The report records hashes of the compiled modules used.

Protocol tests open **40 official MCP SDK clients** and execute 220 commands, including 60 requests sharing the same JSON-RPC ID. Further regressions cover 30 worker restarts, 20 coordinator restarts, 100 queued commands with 80 cancellations, connection loss during active work, expired registrations, stale responses, invalid JSON, incorrect headers, and incomplete uploads. A valid silent 17-second command survives the HTTP reception limits.

The six real-window checks cover: two-window connection; 80 commands; coordinator failover without replaying a write or terminating the other window's process; rejoining; reload of a used idle primary; and reload during a 30-second command. The final case retains the same PID, rejects an overlapping command, and automatically recovers once the process finishes. Interrupted requests return an expected error; no success is claimed and no command is replayed.

To repeat, run `npm run bundle`, then the three scripts `test:vscode`, `test:windows`, and `test:connection`. The first two require VS Code and PowerShell 7. The two-window harness currently runs on Windows; it owns its profiles and closes only its instances. `MULTISHELL_SOAK_SECONDS` accepts 30 to 1800 seconds. Reports are written under `.vscode-test/`, excluded from Git and the VSIX.

**Still pending:** manual acceptance of every panel and approval flow, full application exit, suspend/resume, native Linux shells, and actual tunnel or external connector outages. These automated results do not guarantee zero hangs in every environment. Recovery never treats silence as idle evidence or interrupts user processes.

## Verified fixes in 0.10.29 — November 2, 2026

- `npm run test`: **66/66 suites**, including compilation and bundling, using the existing test system.
- `npm run lint` and native VS Code diagnostics: no errors or warnings. `npm audit --audit-level=low`: zero known vulnerabilities.
- `test/test-connection-mutation-cancellation.cjs`: reproduces and prevents creation after disconnect and delayed approval closing a user terminal after request cancellation. Uses real HTTP and MCP with a simulated terminal API.
- `test/test-connection-stale-actions.cjs`: five late-response scenarios covering aliases, creation, closure, and successful or failed discovery. Checks the new connection retains its routes, aliases, and availability.
- `test/test-shell-manager-disposal.cjs`: settles active and queued requests and removes all their listeners while awaiting integration or a missing completion event; preserves the physical terminal and never dispatches the queued command.
- `npm run test:vscode`: **12/12 checks** on real terminals. `npm run test:windows`: **6/6 scenarios** with two real windows, including coordinator failover and reload with an idle or busy primary, preserving the same PID and recovering automatically.
- Additional load for this revision: **15,444 commands in 60 seconds**, 25 worker reconnects and 10 coordinator restarts; no unexpected errors or retained queues/controllers. Latency p95 39 ms, p99 50 ms, maximum 86 ms. Retained heap grew 5,696,824 bytes after requesting garbage collection. Compiled modules match the report hashes.

These checks are automated; even real VS Code tests do not replace complete manual panel acceptance. Coverage percentage was not measured. Native Linux, suspend/resume, and actual external tunnel outages remain unverified. Previous 0.10.28 results remain historical and are not attributed to this revision.
## Agent Skills verification in 0.10.30 — November 2, 2026

- `npm run test:multishell`: **68/68 passing suites**, including real HTTP MCP protocol, `skill://index.json`, YAML metadata, three skill search locations, two-workspace isolation, traversal and size limits.
- `npm run lint`: zero warnings; `npm audit --audit-level=low`: **0 known vulnerabilities**.
- `npm run package`: `multi-shell-mcp-server-0.10.30.vsix` built and inspected, **25 packaged files**, including ES/EN guides and the runtime bundle. Development `.agents/` and `node_modules` are not packaged.
- `git --no-pager diff --check`: passed. The repository's `.agents/skills/multishell-mcp` example is tested.

**Limit:** real installed-extension checks for this release (window reload, native skill consumers, external tunnel) have not yet been rerun. Historical live VS Code results below belong to earlier releases.

## Validation of 0.10.31 — Official MCP Skills and portable plugin

- `npm run test:multishell`: **72/72 passing suites**, including TypeScript compilation and bundling. Coverage includes the official MCP v2 client negotiating `2026-07-28`, `server/discover`, `skills/list`, `skills/get`, `resources/read`, pagination, SHA-256, resource limits and multi-window isolation.
- Legacy MCP client initialization remains compatible; prior shell, permission, queue, cancellation and recovery regressions still pass.
- `npm run lint`: **zero errors or warnings**; `npm audit --audit-level=low`: **zero known vulnerabilities**.
- The portable plugin contains its manifests, repository-local marketplace, setup skill and operational MultiShell skill. Installation requires the user's approval.
- `npm run package:all` builds a VSIX installer and a separate plugin ZIP; packaging checks ensure development directories and loose dependencies are not included.

**Pending manual acceptance:** installing v0.10.31 in a real VS Code window, native plugin recognition and activation in a ChatGPT/Codex account, external secure-tunnel connectivity and Linux checks. A local `127.0.0.1` URL is not reachable from cloud-hosted ChatGPT Work.

## Validation of 0.10.32 — Global Codex Skills

- TypeScript compilation and bundling passed. `node scripts/run-tests.cjs`: **74/74 passing suites**, including new global skill and quick name-list tests.
- `test/test-global-codex-skills.cjs` checks all three Codex skill directories, filters, duplicate names, opt-in, reference reading, contained symlinks and path traversal rejection.
- `test/test-global-skills-mcp.cjs` checks `list_skill_names_code`, the legacy `cwd="@mcp"` shortcut, file permission enforcement and lack of an implicit default shell.
- The bundled extension activation regression checks the new VS Code Command Palette action and copying a skill name.
- A real directory scan on this Windows installation returned **14 valid personal Codex skills with no warnings**. No skill was copied into the extension or to another workspace.

**Pending:** user acceptance after installing the updated VSIX and live ChatGPT remote-connector validation. Real PowerShell 7 integration harnesses require `pwsh.exe`, which was unavailable in the previous environment check.

## Validation 0.10.33 — Skills owned by windows and machine origin

- `node scripts/run-tests.cjs`: **75/75 passing suites** after TypeScript compilation, including the new `test/test-skills-window-routing.cjs`.
- The new regression sets up two windows with separate project roots, two simulated user homes, distinct global read permissions and identically named skills. It checks legacy and modern MCP tools/resources and rejects requests to a disconnected owner.
- The hub's stored paths are deliberately replaced with non-existent paths, proving reads are performed in the owning worker rather than accidentally using the hub's local files.
- Window metadata includes `window_id` and the registered `machine_id`; same-named skills from different windows remain separate.

**Limit:** these tests simulate separate machine filesystems; they are not actual network connections between computers. Worker networking remains limited to `127.0.0.1`. Remote federation and installation in a user's real client need separate validation.

## Skill audit of 0.10.33 and fixes in 0.10.34 — November 2, 2026

Baseline 0.10.33 passed its **75/75 suites**, but new regressions reproduced five access/discovery weaknesses: global skill internal links leaving the selected skill, file growth after size validation, stale frontmatter in a new manifest, building manifests outside the requested page, and duplicate catalogs for terminals sharing a window and root.

In 0.10.34, `npm run test` passes **81/81 suites**, including compilation and bundling. `npm run lint` and the full npm audit finish without errors or known vulnerabilities. The six new regressions failed before the fixes and pass afterward.

- Privacy testing uses a synthetic home and a Windows directory link, without reading real credentials. Authorized installation links inside the home remain supported; internal links outside the selected skill are rejected.
- File-growth testing modifies a file after its size check and verifies rejection and descriptor cleanup. Manifest consistency testing changes `SKILL.md` between reading metadata and constructing the manifest.
- With 45 instrumented skills, the first page builds **20 manifests instead of 45**. Three pages build 20, 20, and 5; invalid cursors build none. This measures work performed, not latency differences between machines.
- Four terminals representing three distinct owner-window/root pairs produce three queries and entries; another window with the same path remains separate.
- `npm run test:vscode`: **15/15 checks** in real VS Code. Two new cases verify owner-worker discovery and reading, disabled global access, and modern manifests whose two resources match SHA-256 and byte size.
- A third new real VS Code check and `test-modern-legacy-selectors` exercise cached legacy schemas through the official modern MCP client: `@shell:` diagnostics, `@mcp` controls, no terminal execution for discovery, permissions, and rejection of mismatched routing headers. The same defect was observed through the active version 33 connector.
- `npm run test:windows`: **6/6 scenarios** with two real windows, including idle/busy primary reload, PID preservation, and automatic recovery.

The plugin and repository workflow skills remain synchronized. These tests are automated, including real VS Code checks; they do not establish native plugin installation or activation in a ChatGPT/Codex account. Native Linux, the external tunnel, slow network drives, and complete manual acceptance remain unverified. Coverage percentage was not measured.

## Skills panel 0.10.36 — November 2, 2026

- `npm run lint`: no errors or warnings. `npm run test`: **83/83 suites**, including compilation and bundling. The new panel suite covers 84 entries, description search, pagination, duplicates, exact paths, offline discovery, revoked permissions and zero terminal execution.
- Chromium UI with synthetic data: **15 interaction checks**, including stale responses, focus preservation, keyboard navigation and terminal approvals. English labels and absence of horizontal overflow at 240, 280 and 330 pixels were also checked.
- `npm run test:vscode`: **15/15 automated checks** in real VS Code with an isolated profile, including terminal recovery and MCP skill integrity. This does not establish manual acceptance of the new sidebar inside your usual window.
- `npm audit --audit-level=low`: 0 known vulnerabilities. Coverage was not measured. Pending: visual acceptance in a regular VS Code window, clipboard and remote ChatGPT loading, tunnel continuity and native Linux.

## Simple skill workflow 0.10.35

The `test-skill-easy-workflow` regression uses real HTTP, the owning worker, and MCP v1/v2 clients. Its 121-skill catalog checks description search beyond entry 100, nonduplicated pages, loading by name, ambiguous-name candidates, exact-path selection, denied global access, and zero terminal commands. It also checks modern discovery includes entries beyond 100.

Real VS Code checks are distinct from this API test with simulated terminals. Native Linux, network drives, and native activation in a remote client remain unverified.

## Validation 0.10.37 — Skill audit and VS Code picker

- Graphify structurally scanned 18 files in `src/` (310 nodes and 897 edges) without LLM extraction. The graph was created outside the repository in a temporary directory.
- `node scripts/run-tests.cjs`: **84/84 suites passed** after compiling and rebuilding `dist/extension.js`. The new `test-skill-name-filter.cjs` includes more than 100 description matches and a later name match, through a real owner worker and HTTP MCP tool call.
- `test-bundled-startup.cjs` verifies results beyond the first 100 entries, exact paths for duplicate names, descriptions and locale in the picker, and no fallback to the extension process directory when no project is open.
- ESLint passed; `npm audit --audit-level=low` reported **0 known vulnerabilities**; `git diff --check` passed.
- The active skills guides now validate current installer references to prevent stale distribution instructions.

**Remaining acceptance:** install the new version in real VS Code and exercise the picker with real windows, separate computers and Linux. Regression tests do not establish native plugin compatibility with every client or absolute terminal reliability.

## Validation 0.10.38 — Compact Skills layout

- `npm run test`: **85/85 passing suites**, including the new disclosure regression. ESLint passed and npm reported 0 known vulnerabilities.

- `test/test-panel-skill-disclosure.cjs`: executes the real panel renderer against a simulated DOM. It verifies always-visible paths beneath skill names, initially collapsed descriptions, independent right-hand copy buttons, and retained open state while additional results load.
- `test/test-panel-layout.cjs` and `test/test-panel-skills.cjs`: check accessibility structure, search, pagination, permission boundaries, and copied instructions scoped to the correct terminal.
- Controls use native `details/summary` with keyboard interaction, VS Code localized labels, and safe `textContent` instead of unsanitized HTML.

**Pending:** manual visual acceptance in installed VS Code, particularly at very narrow sidebar widths and on Linux.

## Validation 0.10.39 — Single MCP SDK v2 implementation

- `node scripts/run-tests.cjs`: **88/88 suites passed** in the final regression run, covering both protocol eras, cancellations, reconnections, permissions and Agent Skills.
- ESLint and TypeScript compilation passed. `npm audit --audit-level=low` found 0 known vulnerabilities; `git diff --check` was also checked.
- Request cancellation handles closure of the HTTP response and underlying TCP connection before queued operations execute.

- The server uses only `@modelcontextprotocol/server`, with no direct `@modelcontextprotocol/sdk` dependency or imports in source.
- `test/test-sdk-v2-migration.cjs` checks official clients from both protocol eras, equivalent tools/resources, mandatory modern `resultType`, HTTP origin restrictions, permissions, and request cleanup.
- `test/test-connection-protocol.cjs` exercises the legacy initialization era with 40 clients, 220 operations, malformed requests and cleanup, while modern `server/discover` and SHA-256 verified skills remain supported.
- The endpoint remains `127.0.0.1:3000/mcp` with `legacy: 'stateless'`. Tunnel scripts and binaries have not been modified.
- `test-global-skills-mcp.cjs` covers v2's JSON-RPC errors for unregistered tools while preserving window isolation and local permissions.

**Pending acceptance:** an end-to-end live tunnel test and manual acceptance after installing the VSIX into VS Code. Automated tests alone do not verify those scenarios.

Documentation compatible with 0.10.72.

Compatible with 0.10.59.

Documentation compatible with 0.10.60.

Compatible with 0.10.61.

Documentation compatible with 0.10.62.

Documentation compatible with 0.10.63.

Compatible with 0.10.64.

## Safe disk maintenance (0.10.72)

The cleanup is conservative. npm run storage:cleanup previews old isolated test profiles and verified legacy tunnel backups; npm run storage:cleanup -- --apply deletes only known-safe inactive targets after process checks. Active processes, recent folders and unknown files are retained. The most recent failed test profile is temporarily retained. VS Code-managed installed extensions are never deleted.

Each terminal accepts at most 16 waiting commands; excess calls are rejected before sending input. The existing 32 concurrent HTTP requests and 1 MB isolated-command output limits remain in effect.
