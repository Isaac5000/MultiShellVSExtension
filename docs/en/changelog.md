# Release history

[Versión en español](../es/historial.md) · [Project index](../../README.md)

## 0.10.72 — Safe cleanup and bounded retention

- Real two-window VS Code tests prune stale isolated profiles only after verifying no active processes use them, keeping the newest failed diagnostic temporarily.
- Terminal integration tests clean completed isolated profiles without terminating unrelated terminals.
- Maintenance defaults to dry-run: npm run storage:cleanup. Use npm run storage:cleanup -- --apply to remove expired test profiles and verified idle tunnel backups; installed extension versions managed by VS Code are never deleted.
- Maximum 16 waiting commands per terminal. Excess requests are rejected without terminal input.

## 0.10.71 — Preferred skills without automatic execution

- Per-workspace and optional global favorites persist as bounded exact paths in VS Code state; no SKILL.md is duplicated or loaded into context automatically.
- The panel can mark/unmark a favorite without restarting MCP. MCP tool discovery marks preferred entries and lists them first, including modern skills/list without changing the standard manifest schema.
- Global preferences remain invisible without explicit existing global-skill access. Workspace ownership and read-only skill authorization remain enforced.
- Regression tests cover paging, duplicate names, scope isolation, permission revocation, remote owner routing, and accessible panel controls.

## 0.10.70 — Fail closed when bundled tunnel binaries are missing

- Fresh starts require a SHA-256 verified Tunnel Client and companion bundled in the OS-specific VSIX. Idle globalStorage copies can no longer become the selected executable.
- Removed the extension-host runtime downloader and adjusted the former Install action to Verify bundled client. A corrupt or incomplete VSIX displays a reinstall error; keys and existing profiles remain untouched.
- Continue adopting a live previously owned tunnel only when its PID, start identity, arguments and verified executable match the ownership lock.
- Added fail-closed regression tests and updated local validation and distribution guidance. No paid API or GitHub Actions workflow.

## 0.10.69 — One required native VSIX per platform

- Default `npm run package` now produces exactly one VSIX with the verified official Tunnel Client and cloudflared for the target OS and architecture.
- Removed redundant integrated/platform packaging aliases. `npm run package:all` builds the same single VSIX plus the optional independent MCP plugin ZIP.
- Updated Windows build/validation scripts, portable-source archive selection, VSIX privacy checks, and bilingual installation instructions to use the native installer.
- Legacy generic VSIX distribution is discontinued. Platform-native binaries remain necessary; cross-platform packaging targets and safe adoption of previous processes are preserved.

## 0.10.68 — Verify surviving tunnel processes across VSIX upgrades

- Reattach a tunnel launched from a previous installed version when both the old bundled binary and its kernel process identity can be independently verified against the ownership lock.
- Reject stale PIDs, forged fingerprints, unrelated extension directories, and modified/unverifiable previous binaries. New launches continue using the current bundled executable.
- Added a failing-before/fixed-after cross-version regression; preserved all existing tests, profiles and credentials.
- Audited distribution scripts, test caches and documentation; updated installation guidance without deleting reusable integration fixtures.

## 0.10.67 — Prefer bundled tunnel on automatic start

- Manual start and autostart now prefer the SHA-256 verified native executable inside the platform VSIX. An idle globalStorage copy is no longer selected.
- Safe exception: a running legacy child is retained only when its process identity matches the extension-owned lock. Stale, forged or missing lock state cannot select it.
- Added a red/green regression for automatic startup, stale PID and generic VSIX fallback. No existing tunnel, credentials or profiles are changed by building this release.

## 0.10.66 — Bundled official tunnel per platform

- Platform-specific VSIX build embeds only the matching official Tunnel Client and cloudflared binaries, SHA-256 checked, with licenses.
- Shared TypeScript/JavaScript runtime is minified for smaller VSIX and installed footprint.
- Fresh installs use the verified bundled executable without a separate download or copy in globalStorage.
- Existing verified globalStorage executable takes precedence to preserve safe adoption of live tunnel processes.
- Use npm run package:integrated; the generic slim VSIX remains available for compatibility.
- macOS Gatekeeper/notarization behavior is not verified for directly downloaded upstream ZIP binaries.

## 0.10.65 — Skills-assisted security review

- Added locally versioned MCP, debugging, TDD, differential review, verification, and Node.js skills. No independent AI model is used.
- Closed a checkpoint read time-of-check/time-of-use race with verified file descriptors and bounded reads.
- Limited full-file line replacement to 32 MiB to avoid excessive extension-host memory use.
- Added explicit MCP safety annotations for the reviewed read and write tools.
- Excluded `skills-lock.json` from VSIX while retaining it in the source repository.
- Added red/green regression tests for each corrected behavior. See the linked audit report.
- No extension install, tunnel changes, Git publication, or paid API use.

## 0.10.64 — Remove unsupported continuation prototypes

- Removed fake-chat continuation UI, synthetic rollover engine and their unused runtime code.
- Removed independent API/local-model agent prototypes: they cannot advance regular ChatGPT web chats and are outside this extension goal.
- Removed associated demos, tests and obsolete instructions; no standalone MCP SDK client bundle is shipped.
- Kept actual shell tools, tunnel integration, permissions and bounded cross-chat checkpoints with manual handoff.
- Existing user checkpoints and tunnel configurations are never removed or modified.

## 0.10.63 — Safer cross-chat handoff selection

- New read-only `chat_handoff_list_code` shows scoped task checkpoints, status and revision.
- `chat_handoff_load_code` now rejects implicit recovery when multiple unfinished tasks exist or only completed tasks remain.
- Handoff messages rediscover the current exact shell after VS Code reload rather than embedding a stale shell ID.
- Cross-process capacity lock prevents simultaneous creations from exceeding 24 handoffs.
- Removed MCP deletion based on an unverified `human_confirmed=true` model argument. Cleanup requires explicit local maintenance.
- No tunnel changes, paid inference or automatic ChatGPT chat creation.

## 0.10.62 — MCP checkpoints for ChatGPT chat handoff

- Added `chat_handoff_save_code`, `chat_handoff_load_code` and `chat_handoff_delete_code` for real ChatGPT-chat progress transfer without model inference.
- Bounded local state: 24 records of at most 16 KiB each; atomic writes and expected-revision checks protect newer progress.
- Checkpoints are scoped to machine and project directory. Every operation requires an exact live shell; obvious credential strings are rejected.
- Added bilingual handoff guides and client skill instructions for a new chat in the same ChatGPT Project.
- Does not automatically create chats or activate metered APIs. The existing tunnel is untouched.

## 0.10.61 — No-extra-billing policy

- Disabled the metered Responses API CLI and excluded its inference adapter from VSIX. Legacy accounting inspection and reconciliation remain available.
- Added `free-agent-cli.cjs` for deterministic offline simulation or `ollama-local` inference using an already installed local model.
- Ollama runs as a separately owned child with `OLLAMA_NO_CLOUD=1` and random loopback port, without automatic model downloads or API keys.
- Model-triggered commands remain disabled; an explicitly selected `git diff --check` verifier is permitted. Existing memory, write, step and deadline quotas remain.
- Subscription-based providers are not enabled until extra-credit spending can be ruled out. No real Codex execution or paid API usage was performed.

## 0.10.60 — Continuous bounded-batch coordinator

- New `continuous-runner.cjs` repeats normal `batch_limit` pauses without extra confirmations under the same approved goal and cumulative budgets.
- Durable per-goal coordinator lease, heartbeat, batch count and read-only `continuous-status` inspection.
- CLI options `--continuous`, `--max-batches` and `--verbose`; real API runs still require `--live --approve`.
- New mocked end-to-end CLI, rollover, cross-process stop and safe recovery tests. No paid API requests were made.
- Does not automatically start after reboot or control ChatGPT web conversations.

## 0.10.59 — Isolated MCP client for persistent agents

- Bundles MCP SDK v2 into a standalone client so VSIX installations do not depend on development node_modules.
- Authenticates using a local token file and requires a 127.0.0.1 endpoint, exact shell_id and validated workspace identity.
- Exposes only listing/reading, bounded SHA-256 creates/replacements and predefined verification commands with explicit permission.
- Durable reservations for uncertain writes, per-run and per-goal quotas and rejection of changed machine/workspace identity.
- Real local MCP read and end-to-end mocked API + actual local MCP CLI validated without charges or workspace edits.
- Does not install itself, modify the existing tunnel or automate external ChatGPT web conversations.

## 0.10.58 — Optional real API adapter and tunnel recovery hardening

- Integrated an optional OpenAI Responses API adapter with per-run authorization, read-only defaults and a default maximum of 12 steps per invocation.
- Durable request/write ledgers: 60 writes and 512 KiB per goal; uncertain responses never trigger automatic retries.
- Added mocked API tests, checkpoint rollover, authorization, goal completion and quota recovery tests; no real API keys were used.
- Improved safe tunnel ownership recovery after VS Code reload without stopping unrelated or unverified processes.
- The agent still cannot start ChatGPT web conversations or execute tasks using the MCP tunnel tools.

## 0.10.57 — Standalone persistent agent with SQLite memory

- New `persistent-agent/` subsystem: local SQLite history, FTS5 lexical recall, checkpoints, explicit local-document import and provenance.
- A standalone supervisor can run simulated agent turns with bounded steps, token counters, deadlines, manual stop, non-progress blocking and context handoff.
- Context and goals survive process restarts. Single-writer ownership and leases prevent duplicate workers, while stale execution recovery requires an explicit new start.
- Cross-platform CLI (requires Node.js 24+) supports goal creation, listing, simulation, recall, import, inspection and stop.
- `FakeWorkProvider` is the only available adapter. **No connection to real models, ChatGPT or paid APIs exists.**

## 0.10.56 — Independent simulated continuation and context recovery

- Codex-independent local fake agent simulates bounded continuation turns, budget checks, no-progress detection and a wall-clock limit.
- Simulated context exhaustion creates a new fake conversation while retaining the logical goal, a bounded verified checkpoint, remaining stages and all budgets. Old thread identities cannot control the goal.
- Demo metadata persists in VS Code WorkspaceState and always restores paused. The user must explicitly approve resumption in the panel; writes are serialized against stale overwrites.
- Corrected fake progress accounting: losing context does not count as completing a work stage.
- Added persistence, context-hand-off, authorization, invalid-snapshot and restart regression tests.
- **Ordinary MCP cannot wake real AI chats or create conversations in external services.** Such support still requires a client-owned adapter.

## 0.10.55 — Faster panel refresh and compact MCP replies

- AI profile credential-presence and client-config checks now run in bounded parallelism, up to six profiles, without caching secret values.
- Hidden panel views skip periodic I/O and refresh immediately when shown again.
- Shell, file and native VS Code MCP tools emit compact JSON with unchanged data and permission checks.
- **144/144 automated suites passed**, alongside compilation, bundle, ESLint and strict TypeScript.
- Real VS Code graphical tests remain pending while the updater holds its instance lock.

## 0.10.54 — Faster Agent Skills discovery and resource transfer

- Stat-validated directory indexes avoid repeated realpath lookups and YAML parsing on later pages.
- Bounded caches: 4096 directories, 2048 metadata entries/8 MiB and 8192 SHA-256 digests. Each request rechecks file identity and keeps permission, path and symlink validation.
- Skill tools send compact JSON. MCP `resources/read` transfers text as UTF-8 while preserving Base64 for binary data.
- Local synthetic benchmark (180 skills, 360 files): nine MCP Skills pages, ~6.99 s before, ~0.87 s warm and ~1.28 s cold.
- External `ttlMs: 0` remains unchanged to avoid client-side stale metadata.
## 0.10.53 — Asynchronous isolated commands and safe job recovery

- New MCP tools `start_background_command_code`, `get_background_command_code`, `list_background_commands_code` and `cancel_background_command_code` return job IDs immediately and expose progress without keeping the original MCP request open.
- Background child processes are owned by the selected VS Code worker; their output and cancellation are tracked independently of the integrated terminal. A regression proves jobs complete while the persistent terminal remains busy and untouched.
- Coordinator changes do not replay or lose worker-owned jobs while the worker stays alive. Closing a terminal revokes its jobs to prevent disclosure if a shell ID is later reused.
- Panel indicates active job counts, elapsed time, safe command labels without arguments and possible input hints, with local user confirmation before cancellation. Per-AI gateways enforce exact shell and command-permission scope.
- Up to 12 concurrent jobs per window, 96 history entries, 16 KiB recent output and 30-minute retention. A full owner-window restart does not preserve job state.
- Includes earlier unreleased gateway stop hardening, authenticated graphical test harnesses, PowerShell 7 WindowsApps detection, multi-platform CI and structural panel verification.
- All 133 automated suites passed before packaging. Hands-on VS Code tests remain subject to the updater blockage when active.



## 0.10.52 — Authenticated local clients and directory-listing protection

- Fixed a broken post-0.10.51 integration: legacy automatic client setup still wrote an unauthenticated main-port URL. Such setup is now refused; old entries are shown as unverified while managed entries remain removable without deleting unrelated settings.
- **Copy configuration** uses the per-profile scoped AI gateway URL and a Bearer placeholder, never the coordinator's internal token or a SecretStorage secret. Users must provide their client credential securely; this is not presented as fully automatic.
- Removed the unusable automatic setup button. Updated bilingual documentation and plugin guidance to describe authenticated local gateways.
- Added a deterministic directory-swap regression: `list_files_code` could reveal filenames from an outside folder when the directory changed during `readdir`. Listing now verifies entries and the directory before returning results.
- Prior 0.10.51 protections remain. Total elimination of all filesystem races and the absence of a Windows Terminal window still require separate proof / a real post-install check.

## 0.10.51 — Secured MCP listener and hidden Windows tunnel startup

- Production main MCP HTTP requests now require the installation's private local token. Tunnel Client injects the credential from environment variables on the local MCP hop only; the secret is not saved in YAML or sent to ChatGPT.
- Authentication runs before JSON parsing. The main listener and individual AI gateways both enforce a 32-active-request limit (HTTP 429).
- Scoped reads use open file descriptors and verify containment and file identity before returning data; non-regular files are rejected. Atomic writes revalidate before publication, and copies after staging. Deterministic symlink-swap regressions were added.
- Native VS Code tools allow an omitted `shell_id` only when exactly one shell exists; ambiguous selections are rejected.
- Windows tunnel startup no longer requests a detached console process; this targets the observed Codex App Server / Windows Terminal startup window.
- **Restart the managed tunnel once after upgrading**. An already-running tunnel process cannot receive new environment-backed authentication headers.
- Portable Node.js does not provide descriptor-relative filesystem operations needed for an absolute guarantee against all ancestor rename races. These defenses cover the reproduced scenarios, not all possible schedules.

## 0.10.50 — ChatGPT custom MCP plugin setup and streamlined guidance

- ChatGPT's **AI Connections** guide explains that **Add custom MCP server → Create as a plugin** in ChatGPT is required separately from a running Secure MCP Tunnel.
- Details include `tunnel_id` from Platform Tunnels, ChatGPT workspace association, a separate Tunnels Read + Use runtime API key, plugin name and optional description, **Tunnel** connection, compatible authentication, risk consent and tool verification.
- Direct links to Platform Tunnels, runtime API keys, ChatGPT and the official custom MCP plugin setup guide. The runtime key belongs in **OpenAI Tunnel** only, never in ChatGPT's plugin form.
- Removed unnecessary optional API key inputs from normal Gemini CLI and Claude Code login flows. Previously stored credentials remain until the user explicitly selects **Delete old key**.
- Clarified local versus cloud client labels, bilingual instructions and the bundled portable plugin setup skill.

## 0.10.49 — Guided per-AI setup and secure panel fields

- Fixed a legacy-panel mock mismatch that could leave a Node test process running after an initial snapshot failure. Added `workspaceState` fallback for provider statuses, first-state readiness checks and unconditional test timer cleanup.

- Every AI profile exposes a **?** guide with provider-specific prerequisites, official commands (copy-only, never run), verified documentation links and authentication cautions.
- Gemini CLI: Node.js 20+, official npm install, Google browser sign-in, existing automatic local MCP setup and verification through `gemini mcp list`. Distinct from Gemini web and Gemini API.
- Per-client data fields include a public HTTPS MCP URL, connector ID, optional provider API key and optional MCP Bearer token where appropriate. Secrets are stored only in VS Code SecretStorage, never in Memento/Webview snapshots/client configuration; individual fields can be cleared.
- ChatGPT retains its existing OpenAI Tunnel tab with contextual help and official source links. The guide never executes installer commands.
- Public HTTPS URL validation excludes credentials, URL parameters and private endpoints. Saving metadata never exposes ports, launches a tunnel or creates cloud vendor registrations.
- Added 10-guide coverage, per-profile secure-storage tests, masked field rendering checks, and safe field actions.

## 0.10.48 — Authenticated independent MCP AI gateways

- Initial per-AI authenticated MCP endpoints: mandatory bearer authentication per HTTP request, independent 256-bit credentials in VS Code SecretStorage, stable localhost ports 38100–38199, no registration/control endpoints.
- Server-side per-profile policy bounds an exact shell ID and original root, read/edit/command/full tool scopes; gateway clients cannot create or close terminals, rename aliases or enumerate other windows.
- Panel actions configure isolated access, start/stop, copy local URL, copy key after a native warning, rotate, revoke and toggle opt-in autostart. Credentials never enter Webview snapshots.
- Hub-role or Workspace Trust loss immediately blocks new traffic; revocation of one client preserves others.
- Maximum 32 in-flight MCP requests per authenticated gateway (HTTP 429, Retry-After) without changing the legacy OpenAI listener.
- Excluded local `.mcp.json`, connector backups and temporary files from VSIX and Git, with an archive privacy regression.
- Five actual loopback MCP listeners tested simultaneously with independent tokens, cross-shell denial and concurrent command execution.
- **Not yet implemented:** managed public HTTPS tunnel transport, provider-specific OAuth/header acceptance testing, live Claude web/Grok/cloud connector trials.

## 0.10.47 — AI connection visibility and safe interactive escaping

- Fixed saved AI profiles showing in the count but not as cards: the missing `id="aiFormHelp"` caused a null DOM reference and aborted rendering.
- Added HTML/JS DOM-ID consistency and local/cloud profile card rendering tests.
- Auto-exit now fails closed on unbalanced quotes and ambiguous shell escapes, never injecting `q` into an unidentified command or guessing with Enter/Ctrl+C.
- PowerShell's `>>` continuation prompt is surfaced as a diagnostic hint only; no process termination or speculative keystrokes.
- Documented safer command execution practices to avoid complex inline quoting and `exit` in persistent PowerShell sessions.

## 0.10.46 — Provider-specific AI connections and client surfaces

- AI Connections now distinguishes local desktop/CLI clients from cloud/API surfaces, with provider-specific MCP transports, prerequisites and official setup links.
- Added pending profiles for Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio and Cursor remote, retaining existing Copilot, Claude Code, Gemini CLI, Cursor local, and ChatGPT Tunnel Client.
- Remote profiles explicitly require a future authenticated HTTPS gateway; they cannot produce unsafe localhost snippets, launch public tunnels or claim connectivity. Cloud account auth and per-client authorization remain outstanding.
- Added provider registry, panel, persistence and invalid-remote-config tests.
- No public exposure of MCP port 3000 and no active extension replacement.

## 0.10.45 — Automatic local MCP client setup from the panel

- **AI Connections** offers **Configure automatically**, **Refresh status**, **View file** and **Disconnect** for Copilot, Gemini CLI, Cursor and Claude Code, without user-run CLI commands or JSON copying.
- Copilot uses portable user `mcp-config.json`; Gemini uses user `settings.json`; Cursor uses user `mcp.json`; Claude Code uses the opened workspace's `.mcp.json`.
- Structured JSON/JSONC merge, backups of pre-existing configuration, exclusive writes, concurrent modification and symlink checks, refusal of incompatible entries, and removal only of extension-owned settings.
- Native confirmation and Workspace Trust gates. No independent AI authorization or external login is bypassed. A configuration entry does not prove the AI has established a live MCP session.

## 0.10.44 — Flat Requests view and five-client concurrency coverage

- Requests now displays one heading, count, approval controls and empty state without a second nested disclosure.
- Five independent MCP HTTP clients tested against one coordinator: five shells on five workers and five shells in one worker. Verified cross-shell concurrency, same-shell FIFO and queue cleanup.
- A 30-second local synthetic soak completed 6,756 commands (48 ms p95) without unexpected errors. These are NOT real-model workloads.
- Important boundary: local AI setup profiles do not authenticate callers; one MCP client can address another client's shell. Per-client authorization and a protected gateway remain outstanding.
- Request-scoped HTTP cancellation now reaches tool dispatch through AsyncLocalStorage; the 100-request/80-cancellation case passed three repeats and the complete regression log recorded 103 passing suites. Saturation remains an area for continued monitoring.

## 0.10.43 — Structured sidebar and multi-AI local MCP profiles

- Collapsible vertical navigation, Overview page and separated Requests, AI Connections and Settings, retaining existing terminals, skills and OpenAI tunnel controls.
- Local setup profiles for VS Code/Copilot, Claude Code, Gemini CLI, Cursor and generic MCP clients. Strict profile-name validation, secret-free persistence, clipboard examples and native confirmation before sharing access to MCP tools.
- Profiles do not imply verified client connections or independent authorization. No remote endpoint or public gateway is enabled.
- Navigation, UI authorization, storage, generated snippet and regression tests. Live additional-client and per-identity gateway tests remain pending.

## 0.10.42 — Tunnel recovery and process safety

- Exclusive stale-lock recovery prevents two VS Code windows from deleting each other's fresh locks; crash-leftover recovery guards fail closed.
- A detached extension-owned tunnel can be reattached after Reload Window only when PID, kernel start time, executable path and command fingerprint match. Ambiguous or pre-0.10.42 processes are never adopted or killed.
- MCP port changes synchronize extension-owned YAML profiles atomically while idle, retaining other fields and comments. Active managed tunnels block the port change; imported profiles remain read-only.
- New concurrent lock, native identity, reattachment and port regression tests; stabilized asynchronous port and FIFO tests. All 98 suites, TypeScript, ESLint and npm audit passed on Windows. Physical Linux/macOS and remote end-to-end acceptance remain pending.

## 0.10.41 — Tunnel management in the sidebar

- New bilingual **Tunnel** tab for status, verified installation, profiles, Tunnel ID, masked API key, connect, disconnect and autostart.
- Actions gated by Workspace Trust, with native disconnect/autostart confirmations and preservation of external tunnel processes.
- No credentials in webview snapshots. Additional panel-action, secret non-disclosure and regression tests.
- Windows compilation, lint, tests and VSIX packaging; live remote-tunnel and physical Linux/macOS acceptance remain outstanding.

## 0.10.40 — Integrated Tunnel Manager using Tunnel Client v0.0.19

- First opt-in TypeScript tunnel manager; local commands for verified installation, configuration, start, status and stopping owned processes.
- Official v0.0.19 with pinned SHA-256 for six Windows, Linux and macOS x64/ARM64 packages.
- Extension global-storage profile, `SecretStorage` runtime API key, safe `init` and `doctor` without PowerShell launcher scripts.
- Autostart remains off by default; only the MCP hub may launch the tunnel and external instances are not replaced.
- Added release integrity and manager safety tests; physical cross-platform acceptance remains pending.

- Safe reuse of existing profiles with strict local target, credential reference and official OpenAI control-plane host validation.
- Persistent cross-process launch lock to prevent duplicates across reloads and windows; bounded backoff and retry circuit breaker.
- Additional simulated tests of the complete tunnel lifecycle, recovery, locks and cross-platform profile lookup.

## 0.10.39 — Complete migration to MCP SDK v2

- Removed the SDK v1 direct dependency, legacy HTTP transport and legacy server registration implementation.
- A single `@modelcontextprotocol/server` factory serves both 2025 and 2026 protocol eras through `127.0.0.1:3000/mcp` using `createMcpHandler` with `legacy: 'stateless'`.
- Preserved legacy `@mcp` command shortcuts, per-window skills, permissions, Host/Origin HTTP restrictions, cancellation and request cleanup.
- Modern tool responses now explicitly include `resultType`, `ttlMs` and `cacheScope`. Disabled tools are rejected under either protocol era.
- Migrated the legacy client regression to SDK v2's legacy mode and added dual-era tests covering matching tools/resources, modern metadata and absence of v1 imports.
- The tunnel launcher, profile and executable remain unchanged. No **Skills** UI changes.

## 0.10.38 — Compact, expandable Skills entries

- Each skill shows its **name with its path directly underneath**, always visible. Only the description starts collapsed and opens via the keyboard-accessible “Description” disclosure.
- The compact copy icon sits **to the right of the skill name**, outside the disclosure. Long paths visually truncate with a full hover tooltip, and copying does not toggle the description.
- Open descriptions survive pagination and same-window updates, and reset when the workspace or permission context changes.
- Reduced vertical spacing, retained access to full text, narrow-sidebar support, VS Code theme styles and ES/EN localization.
- Added a regression that executes the actual panel renderer against a simulated DOM and checks independent controls, retained state, permissions, and accessibility.

## 0.10.37 — More reliable skill picker and name searches

- Structural audit of 18 TypeScript source files with Graphify (310 nodes and 897 edges), with temporary graph output outside the repository.
- `list_skill_names_code` now filters by name **before pagination**, preventing description-only matches from hiding later matching skill names.
- The VS Code Command Palette picker traverses all catalog pages, displays descriptions and copies exact skill paths when names are duplicated.
- The picker honors the VS Code UI language and no longer treats the extension host working directory as a project when no workspace folder is open.
- Regression coverage for over 100 skills, misleading description matches, duplicate names and empty VS Code windows. Existing file permissions and window ownership are preserved.
- Updated active guides and installer references to match this release.

## 0.10.36 — Skill browser in each window's sidebar

- The Skills tab searches names and descriptions, filters by scope and loads results in pages of 40.
- Each skill shows its description and path; “Copy for ChatGPT” prepares an MCP instruction with the exact path and current window's terminal.
- User terminal requests move into a disclosure between Current window and Terminals, available from every tab.
- Local discovery works while the server is stopped, global permissions remain enforced, stale searches are discarded and refreshes preserve focus.

## 0.10.35 — Easier skill discovery and loading over MCP

- New `find_skills_code` and `load_skill_code` tools: task/name/description search, loading by name, and explicit disambiguation.
- Search before response limits and paginated owner-worker catalogs.
- Modern discovery follows catalog pages without losing entries beyond number 100.
- Reading a skill never runs its scripts or enables global access.

## 0.10.34 — Bounded skill reads and efficient discovery

- Global skills retain authorized installation links, but internal files cannot link to unrelated personal directories.
- Reads bound allocations and reject files changing during access. Manifests reject a `SKILL.md` that differs from the content used for their metadata.
- Pagination builds at most the twenty manifests in the requested page, validates the cursor before file access, and yields between manifests.
- Terminals sharing a root in one window share discovery; different windows, machines, and roots keep independent catalogs.
- Updated plugin and repository skills with scope selection, progressive reading, and the distinction between reading files and host-side skill activation.
- Fixed modern-protocol compatibility with legacy `@shell:` selectors and `@mcp` skill controls while preserving routing-header validation, permissions, and legacy control response shapes.
- Six new regression suites and three skill/compatibility checks in real VS Code. Fixed incomplete Spanish limit documentation.

## 0.10.33 — Owner-window skills and machine-origin separation

- Skill discovery, reading, file access and manifests now execute inside the worker that owns the selected `shell_id`. The hub never opens a different worker's filesystem paths locally.
- Each window keeps its own workspace skills; global skills use the worker machine's home directory and require permission both at the hub and at the owning window.
- Registered windows expose a local installation `machine_id` alongside `window_id`. Same-named skills in separate windows retain distinct URIs.
- If the owning worker disconnects, requests fail rather than silently reading the coordinator's filesystem.
- Added a regression with two separate project roots, two simulated personal homes, different permissions, and both legacy and modern MCP clients.
- **Network boundary:** hub-to-worker connections still use `127.0.0.1`, so one hub aggregates only windows on its own machine. Multiple machines need separate MCP connections or a future authenticated, encrypted federation bridge.

## 0.10.32 — Global Codex skills and quick name listing

- Discover the user's existing skills from `~/.agents/skills`, `~/.codex/skills`, and `~/.codex/skills/.system` without copying files or executing scripts.
- New explicit opt-in `multi-shell-mcp.globalCodexSkills`, off by default to avoid exposing personal files to connected MCP clients, including remote tunnels.
- New `list_skill_names_code` tool returns sorted names, search filtering, `project/global/all` scope, and unambiguous entries for duplicate names.
- Legacy connector support: `execute_shell_command_code(command="skills <shell_id> [global|project]",cwd="@mcp")`, which does not execute a terminal command.
- New VS Code Command Palette **List available skills** action, with search, copy, and global-access approval.
- Integrates global skills with `skills/list`, `skills/get`, and MCP file resources while maintaining per-shell isolation and read permissions.
- Added path safety, permissions, symlink, and dual-protocol regressions. See [Validation](validation.md) for results.

## 0.10.31 — Official MCP Skills protocol and portable plugin

- Added MCP SDK v2 transport (`2026-07-28`): `server/discover` advertises `io.modelcontextprotocol/skills`. Existing v1 transport remains available to older 2025-era clients.
- Implemented paginated `skills/list` and `skills/get`; each skill entry contains the complete YAML frontmatter, a file manifest, and per-file SHA-256. Skills with the same name in different windows retain distinct URIs.
- `resources/read` remains workspace-scoped. Symlinks and incomplete or oversized manifests (over 512 files or 16 MiB) are rejected. Optional `directoryRead` is advertised as false.
- Regular tools, permissions, per-shell isolation, terminal recovery, and FIFO queues are preserved through a shared registration adapter.
- Portable `plugins/multishell-mcp` package includes a skill, onboarding, local MCP configuration and a repository marketplace. A separate ZIP can be built alongside the VSIX; installation remains user-controlled.
- Added official negotiation, manifest, security and dual-protocol regressions; see [Validation](validation.md) for results and limitations.

## 0.10.30 — Agent Skills integration

- Discover valid workspace skills in `.agents/skills/`, `.github/skills/`, and `.claude/skills/` without copying or executing files.
- Add `list_skills_code`, `read_skill_code`, and `read_skill_file_code` tools with mandatory `shell_id` and reads scoped to the selected skill.
- Publish `skill://index.json` and `skill://workspace/...` resources for clients that support MCP skill-resource discovery.
- Validate `SKILL.md` YAML, enforce size and path bounds, reject symlinks/traversal, and support on-demand reference and binary asset reads.
- Include a repository Codex skill in `.agents/skills/multishell-mcp/` and bilingual setup/security documentation.
- Added regression suites for discovery, reading, multi-window isolation and MCP protocol: **68/68 suites**, ESLint and full npm audit (no known vulnerabilities) passed; 25-file VSIX generated. No automatic script execution or native ChatGPT skill installation.

## 0.10.29 — Cancellation and late responses

- Temporary creation, closure, and alias changes receive client cancellation. A disconnected request cannot later create a terminal or close a user session after delayed approval.
- Creation, closure, alias, and discovery responses are checked against their originating connection. An older response cannot change or close a replacement terminal reusing that ID, remove its assignment, or mark the new window offline.
- Manager restart releases its pending requests and listeners, including missing shell integration or completion events. Preserving terminals does not retain the previous manager's waits or interrupt their processes.
- Compensation for failed creation is limited to its original connection. Local approvals remain enforced and already dispatched operations are not automatically replayed.
- Added three regression suites for mutation cancellation, stale responses, and manager disposal.

## 0.10.28 — Resilient connections, reconnection, and reload

- Fixed startup when restored terminal IDs encounter the coordinator's previous registration: only registration metadata retries for a bounded period, without taking sessions from live windows or replaying commands.
- Concurrent starts and stops share one operation; late events from an old listener cannot invalidate its replacement.
- Disconnects and server shutdown cancel queued commands. Already started primary and user shell processes are preserved.
- Reconciliation rejects stale connection responses; discovery of an unresponsive window is limited to two seconds.
- Incomplete headers expire after ten seconds and bodies after fifteen, with a one-second checking interval. These reception limits do not shorten long or silent command responses.
- Malformed tokens cannot throw; invalid JSON and oversized bodies return bounded errors without HTML stack traces.
- Added official MCP client protocol tests, restarts, disconnects, cancellation, sustained load, and real VS Code window checks. See [Validation](validation.md) for results and limits.

## 0.10.27 — Automatic recovery and safe dispatch

- PowerShell readiness is verified through a separate diagnostic runspace; idle terminals recover automatically, including after a lost completion event. No keystrokes or probe pipelines are sent to the terminal's runspace.
- Inspection distinguishes silent work and input waits; new activity invalidates an older result. Failed inspection retains protection.
- Fixed stale recovery records, cancellation during integration setup, dispatch over manual work, and stale-reader state contamination.
- The recovery button repeats automatic verification without manual idle confirmation.
- Updated ESLint and minimatch; full npm audit reports no known vulnerabilities.
- Added recovery regressions and real PowerShell inspection suites. **57/57 suites**, ESLint, full npm audit, and **12/12 VS Code 1.144.0 checks with PowerShell 7** passed. Real window reload and Linux checks remain pending.

## 0.10.26 — Diagnostics for apparently blocked terminals

- Shell lists and the panel now distinguish commands managed by MCP from external activity detected by VS Code (`external_busy`).
- Sessions awaiting verification expose `recovery_reason`: `restored_unverified` (restored without idle proof), `ambiguous_completion` (no reliable completion evidence), or `unverified_execution` (unknown execution state).
- Fixed misleading "available" status when a manually started command is observed, and promptly expose ambiguous completion status.
- Manual confirmation remains required only when reliable evidence is missing. No probing commands, keystrokes, or signals are sent.
- Incomplete commands now expose distinct phases: waiting for shell integration, running, output closed without a completion event, read failure awaiting completion, and process preserved after timeout.
- Passive hints for possible pagers, confirmations and credential prompts; long-output-silence warnings do not imply a confirmed deadlock.
- Fixed a completion race: when VS Code emits an end event before `executeCommand()` returns its execution identity, the event is buffered and matched to the correct command.
- Added regression tests for interactive prompts, pending completion, FIFO protection and early completion events. **Automated validation and VSIX packaging are pending** because no confirmed idle build terminal is available.

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