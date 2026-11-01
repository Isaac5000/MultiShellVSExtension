# Release history

[Versión en español](../es/historial.md) · [Project index](../../README.md)

## 0.10.25 — Isolated execution and pager protection

- New `execute_isolated_command_code` MCP tool runs non-interactive commands in a separate OS process using the selected session's working directory, even when its integrated terminal is busy or protected following a timeout.
- The isolated process disables Git paging (`GIT_PAGER=cat`, `PAGER=cat`), blocks interactive Git authentication prompts (`GIT_TERMINAL_PROMPT=0`), and closes standard input. No `q` or `Ctrl+C` is sent to the user's terminal.
- Cancellation and timeouts attempt to terminate the isolated process tree, reporting an error when termination cannot be confirmed. Output is limited to 1 MB, reports truncation and preserves UTF-8 characters.
- Added `.gitattributes` to normalize text to LF and remove Git LF/CRLF conversion warnings without touching the user's global configuration.
- Added regression tests for output, working directory, no-pager environment, cancellation, timeouts and output caps. **53/53 suites**, TypeScript compilation, zero-warning ESLint and 23-file VSIX packaging passed.
- Existing integrated terminal commands retain their protections; no compound or unrecognized command is silently rewritten.

## 0.10.24 — Output-verified interactive exit and bounded output drain

- Automatic exit no longer sends `q` merely because output appeared. `more`, `less`, `man` and `top` require recognizable pagination or interactive screen output; full-screen monitors require alternate-screen entry.
- Noninteractive help, version, batch, and `man` query options are excluded (e.g. `top -bn1`, `less --help`, `more /?`).
- Conditionally allowlisted `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` and `tig`. Without confirmed full-screen entry no key is sent. Native Linux behavior still needs testing.
- Removed the deferred 120 ms `q` timer which could fire after the program ended.
- If VS Code confirms completion but the output iterator remains open, drain for up to 750 additional milliseconds. The FIFO then releases with `output_incomplete=true` and `truncated=true`. A process without confirmed completion remains protected.
- Added regression coverage for command options, simulated screens and lingering iterators: **51/51 passing suites**, six additional interactive-test repetitions, lint and VSIX packaging verified. Late completion-event races cannot be eliminated completely without extra VS Code API support.

## 0.10.23 — Panel creation without an external modal and updated packager

- Creating user-owned terminals via **Create terminal** in the sidebar uses the form's local approval without an additional Windows/VS Code modal.
- Each internal approval is short-lived and single-use, bound to the exact shell ID, canonical working directory and shared-directory permission. HTTP clients cannot generate these permits; remote requests retain their **Requests** approval.
- Updated the `@vscode/vsce` packager from 3.9.2 to 4.1.0; source builds now require Node.js 22 or newer.
- Added a regression suite covering hub and worker windows as well as invalid or forged approvals. **50 automated suites**.
- Production dependencies have no known advisories; some development dependencies retain moderate `minimatch` findings without compatible fixes according to `npm audit`.

## 0.10.22 — Race conditions and active command protection

- MCP will not inject commands into a terminal with an observed manually started shell execution; no `Ctrl+C` is sent.
- A cancelled FIFO queue item cannot advance later requests ahead of earlier commands still running.
- A broken output stream cannot release a still-running terminal; completion evidence or explicit manual recovery is required.
- Restored user terminals require saved ownership data. Matching a temporary terminal's name and directory never upgrades it to a persistent session.
- Creation requests cancelled during approval or persistence roll back; temporary shell creation is rechecked after the worker responds.
- Added execution-race and creation-cancellation regression tests. **49/49 passing suites**; ESLint, dependency audit and 23-file VSIX verified.

## 0.10.21 — More frequent automatic recovery and distinct icons

- **Re-enable MCP automatically** when a restored terminal matches recent idle evidence, its process ID and directory, with no known outstanding execution.
- Idle evidence is updated after execution events and every 15 seconds, as well as on deactivation, reducing missed state during Reload Window.
- The automatic pagers' exit option uses a **log-out** icon while MCP recovery uses a **shield** icon.
- Ambiguous states, active processes and unverified completion still require manual confirmation; no probe commands are injected.
- Compilation, tests and packaging completed: **48/48 suites**, ESLint and production audit passed; 23-file VSIX verified.

## 0.10.20 — No duplicate managed primaries after reload and streamlined panel

- Open terminal context menus now paint above the action buttons of later rows.
- Removed the manual language selector: the panel uses VS Code's language when set to Spanish and falls back to English for other languages.
- **Reload Window** reattaches at most one managed primary per window, preferring the saved ID. A late restored original replaces an unused startup fallback only if that fallback has never executed commands; potentially active processes are preserved.
- Saved idle evidence from a clean shutdown allows automatic recovery of terminals matching the original process PID and directory. Ambiguous identity or activity still requires manual confirmation.
- Expanded and revised recovery and panel tests. **48 suites defined but not yet run together**. The extension was not reinstalled and the tunnel was not restarted.

## 0.10.19 — Safe automatic recovery of restored terminals

- Restored primary and user-owned terminals are automatically unlocked after VS Code reports a definite shell-integration command completion and no other observed execution remains active.
- Ambiguous events, missing integration, unrelated terminals, and lack of reliable idle evidence keep the guard in place. No potentially interrupting probe commands are run.
- Added regression tests for completion events during and after restoration: 45 automated suites in total. Manual confirmation remains available when the evidence is insufficient.

## 0.10.18 — Temporary terminal preference inheritance

- Temporary MCP terminals inherit their owning window's automatic-exit preference, not the requesting terminal's override.
- Live changes to a window's preference apply to existing terminals without their own override. Individual terminal overrides take priority.
- Reused temporary terminal IDs no longer inherit stale preferences from earlier sessions.
- Added a regression suite for window isolation, live changes, overrides, and ID reuse: **44 automated test suites**.

## 0.10.17 — Per-terminal interactive exit and request inbox

- Added global `multi-shell-mcp.interactiveAutoExit` setting (enabled by default), with a per-window toggle and per-terminal overrides in the panel.
- Conservative recognition of standalone `less`, `more`, `top`, `htop`, and `man` commands: attempts `q` only after output arrives while the same execution is still active; avoids pipelines, compound commands, and unknown programs.
- AI requests to create persistent user terminals are queued in the owning window's **Requests** tab, with approve/deny actions, expiry, and disconnect cleanup.
- Only the local panel can approve; neither public MCP tools nor the internal control endpoint expose approval.
- Two new regression suites, 43 total. Tunnel configuration is unchanged.

## 0.10.16 — Explicitly approved user terminals and multitasking

- Added `create_user_shell_code`: the AI can request a persistent user-owned terminal only when the human explicitly asks. A local VS Code modal shows its ID, directory, and directory-sharing option. Panel creation also requires this approval, even through the internal control API. Denial, cancellation, or expiry prevents creation.
- `create_shell_code` remains limited to temporary `mcp` terminals and cannot be promoted to `user` through extra arguments.
- Closing a user-owned terminal through MCP requires separate confirmation. Panel closure retains a single confirmation.
- Approved terminals remain persisted even with the panel closed. Concurrent saves of sessions, aliases, and removals are serialized.
- Tested parallel execution across user terminals, per-terminal FIFO, and reconnection without duplicate terminals after reload.
- Added three regression suites, bringing the total to 40. The tunnel's protocol and configuration were unchanged.

## 0.10.15 — Connection recovery and primary terminal protection

- Timeouts in automatic primary terminals preserve the running process and block new commands until it finishes, preventing destructive closures or overlapping execution.
- When shell integration is unavailable and no command started, a timeout permits retry without destroying or indefinitely locking the terminal.
- HTTP listeners retain lifetime error handlers and expose health status.
- Heartbeats detect unexpected hub listener closure, release resources, and trigger controlled coordinator election.
- Window workers handle listener errors and can restore ephemeral ports without creating duplicate terminals.
- File operations are denied for disconnected workers until reconnection.
- Expanded to 37 automated suites without changing the tunnel client, its configured ports, or MCP protocol.

## 0.10.14 — Transactional startup, reconciliation, and file protection

- Failure to persist the primary terminal ID after startup now cleans up the server while preserving the physical terminal, allowing a clean retry.
- Reconciliation stages assignments before publishing them and attempts to roll back worker alias changes if a later update fails; rollback failures are reported.
- Concurrent file modifications targeting the same paths are serialized, and complete replacements are published from temporary files.
- No-overwrite file creation/copy uses exclusive publication; moves and renames of regular files protect targets against concurrent replacement.
- Added three regression suites, for 35 total, covering persistence failure, partial reconciliation, and concurrent destructive operations.
- No changes to Tunnel Client's profile, credentials, URL, protocol, or binary.

## 0.10.13 — Isolation, restarts, and file streaming

- Terminal IDs cannot collide with aliases reserved by pending rename operations.
- Primary-terminal restoration rejects foreign directories, duplicated terminal objects, and identities without sufficient ownership evidence.
- Shutdown awaits pending heartbeats and prevents a coordinator election after stopping.
- Unresponsive windows are marked offline until communication recovers.
- Rapid configuration updates are queued so a second port change is not silently lost; rollback respects newer requests.
- HTTP `Host` validation complements `Origin` validation while preserving the local Tunnel Client 0.0.18 contract.
- UTF-8 line ranges are read using streaming; base64 size is checked before loading files.
- Fixed corrupted Spanish characters in the panel.
- Expanded to 32 automated suites, including isolation, lifecycle, and large-file cases.

## 0.10.12 — Session and alias robustness

- Alias persistence failures no longer publish an unconfirmed in-memory alias; concurrent renames of the same terminal are serialized.
- Worker snapshots are validated as a whole before coordinator assignments change, rejecting duplicate or conflicting IDs.
- User-owned terminals with a missing completion event can be restored to MCP use after explicit confirmation that their command ended, without killing the process.
- Added three regression suites (29 total), without changes to the tunnel URL, authentication, or profile.

## 0.10.11 — Security, recovery, and tunnel compatibility

- MCP file-reading and file-editing permissions are enforced independently; file errors use `isError`.
- HTTP cancellation propagates to queued shell commands while preserving user processes already running.
- `Origin` filtering was added without changing the URL or no-OAuth profile of Tunnel Client 0.0.18.
- Partial coordinator startups are cleaned up; the primary terminal is protected against closure, and restored primaries require confirmation.
- Alias changes reserve names during concurrent operations and are persisted when initiated through MCP.
- Tool-permission changes can restart live connections with rollback. The panel refreshes periodically only when its snapshot changes.
- Server version is synchronized with the package; 26 suites and strict interface linting were verified.
- External tunnel distribution is excluded from Git and VSIX; its credentials and profile remain unchanged.

## 0.10.10 — Close-terminal button fix

- Replaced webview `window.confirm` with a native VS Code modal.
- Close actions from the icon or menu are handled by the host and dispose of the real terminal only after confirmation.
- Cancelling preserves the terminal and clears the pending close state.
- Added UI, cancellation, primary-protection, and closure tests.

## 0.10.9 — Reload recovery without working-directory metadata

- Saved user-terminal IDs and working directories enable reconnection even when VS Code omits `creationOptions.cwd` during restoration.
- Conflicting reported directories are rejected. Untracked sessions still require a verifiable directory in the workspace.
- Physically duplicated terminal identities are never adopted.
- Added regression tests for incomplete metadata, isolation, idle confirmation, and coordinator recovery.

## 0.10.8 — User-terminal reconnection and timeout protection

- User terminals created from the panel are safely reattached after VS Code reload, retaining IDs, directories, and aliases.
- Older `MCP [id]` terminals are migrated only when they belong to the same project, avoiding adoption of unrelated or duplicate terminals.
- MCP execution after reload requires explicit confirmation that the previous command is idle. Manually closed user terminals are removed from saved state and are not recreated.
- Terminals are classified by origin: `user`, `mcp`, or `automatic`.
- Panel-created user terminals preserve their processes on timeout, unlike temporary MCP terminals; pending calls are cancelled and new calls rejected while the prior process runs.
- Availability automatically returns after the real command completes. Origin and timeout states are displayed in the bilingual panel.
- Added restoration, lifecycle, isolation, and queue regression tests.

## 0.10.6 — Cleanup and portable distribution

- Removed an unused TypeScript import and misleading metadata identifying the upstream project as the publication repository.
- Preserved MIT license attribution in the README and license.
- Excluded development-only documentation from the installable VSIX while retaining it in source.
- Added a portable-installation guide and an allowlisted ZIP builder containing source, tests, scripts, and VSIX without local dependencies or user data.
- Updated portability documentation and checks.

## 0.10.5 — Workspace Trust

- Explicitly disables the extension in Restricted Mode using `capabilities.untrustedWorkspaces.supported=false`.
- Additional startup checks block manual and automatic MCP activation for untrusted folders, even if VS Code's extension restriction is overridden.
- Added tests for blocking and successful activation after trust is granted.

## 0.10.4 — Restored-terminal recovery

- Recognizes primary MCP terminal instances restored by VS Code and avoids duplicating them.
- Preserves the primary ID, preferring the recorded identity, and recovers older primary terminals as independent sessions instead of closing them.
- Excludes ordinary terminals and unrelated projects, with a short wait for delayed restoration.
- Reloading the extension or changing ports preserves physical terminals; an explicit stop retains its normal closure behavior.
- Added tests for restoration, command execution, safe closure, and uniqueness.

## 0.10.3 — Status bar label

- Displays `MultiShell MCP: ON · <port>` in green or `MultiShell MCP: OFF` in yellow.
- The status item still toggles the server.

## 0.10.2 — Configurable MCP port

- Shared port can be changed from the panel and propagated through global VS Code settings.
- Active instances restart, attempting rollback if the new port is unavailable.
- The status bar displays the actual port and ON/OFF state.
- External tunnels are not reconfigured automatically.

## 0.10.1 — Compact status indicator

- Simplified the status bar to an ON/OFF indicator with color; clicking toggles the server and the sidebar keeps detailed information.

## 0.10.0 — Windows hardening and bundled distribution

- Reintroduced native VS Code diagnostics, workspace/document symbols, definitions, and hover, routed by terminal owner.
- Retained compatible named arguments and legacy shell selectors.
- Added tests for window ownership, file boundaries, two-window routing, startup, alias failover, and MCP HTTP.
- Bundled the extension as self-contained JavaScript without `node_modules` or native binaries in VSIX.
- Updated Zod to a patched 4.x release and verified no known production dependency vulnerabilities.
- Added repeatable Windows QA commands and a manual checklist after reload.

## 0.9.1 — Relative paths, terminal lifecycle, and icon

- Relative terminal directories resolve from their owning VS Code workspace on Windows and Linux.
- Worker/coordinator cleanup handles manually closed terminals and releases aliases.
- Sidebar buttons remain right aligned and long IDs truncate safely.
- Copy-selector, copy-chat-instructions, and guarded close actions are separate.
- Replaced the inherited icon with an original two-terminal/coordinator graphic.

## 0.9.0 — Short terminal aliases

- Numeric and named aliases work as explicit selectors in MCP tools and legacy paths.
- Workspace-derived aliases receive unique suffixes on collisions; manual conflicts are rejected.
- The sidebar displays `shell=alias`, provides native rename input, and copies one-line instructions.
- Primary aliases persist per workspace, and worker aliases survive coordinator failover.
- No implicit active shell; complete shell IDs remain supported.

## 0.8.1 — Source cleanup

- Removed inactive legacy file/edit/diagnostic/symbol modules and their obsolete tests.
- Retained HTTP and multi-window integration tests.
- Removed unused development dependencies and configuration.
- Build steps clean generated output; tests and development files are excluded from VSIX.
- No intended changes to routing, legacy compatibility, or bilingual UI.

## 0.8.0 — Visual panel

- Introduced a responsive Spanish/English panel with workspace/window tabs, terminal status, and quick actions.

## 0.7.1 — Legacy connector compatibility

- Added explicit `@shell:<id>` selectors and read-only `@mcp` discovery.

## 0.7.0 — Multi-window support

- Introduced one primary terminal per window, coordinator/worker routing, and one shared public MCP port.