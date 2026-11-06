# User guide

[Español](../es/uso.md) · [Index](../../README.md)

## Faster Agent Skills (0.10.54)

Discovery uses stat-validated indexes to avoid repeated file parsing and path traversal, while retaining authorization and resource checks. For details see [Agent Skills](skills.md).
## Long-running commands without blocking a terminal (0.10.53)

Use **`start_background_command_code`** with `shell_id`, `command` and optional `timeout` (milliseconds). It returns a `job_id` immediately. Poll **`get_background_command_code`** with the same `shell_id` and `job_id` for state, elapsed time, exit code, partial output and possible wait hints. **`list_background_commands_code`** lists recent jobs, including an ID whose response was lost. **`cancel_background_command_code`** only cancels that isolated child process, never a persistent VS Code terminal or unrelated process.

Jobs execute in independent OS processes using the selected shell's directory, **not its environment variables, aliases or history**. They can run while the integrated terminal is busy. There is no automatic `Ctrl+C`, `q`, `Enter` or credential entry. Known interactive commands are rejected; detected prompts are best-effort hints, not proof of a deadlock. The isolated mode disables Git credential prompts and pagers.

Each VS Code worker permits 12 active background jobs, up to 96 retained records, 30-minute retention and the most recent 16 KiB of output per job (with truncation reporting). Jobs survive a **coordinator** switch or HTTP listener restart while their owning VS Code window stays alive. They **do not survive an owning-window or VS Code process restart**. Never automatically replay a command after losing its response; inspect `list_background_commands_code` first.

The panel displays active job count, duration, a safe allowlisted command label without arguments and potential wait hints. Its cancellation action requests explicit local approval. Scoped AI gateways require `shell` or `full` permission and the exact authorized shell; read/edit profiles cannot manage jobs.



Applies to **MultiShell MCP Server 0.10.68**. See [Installation](installation.md) for setup, or [MCP compatibility](compatibility.md) for older connector arguments.

Open **Ctrl+Shift+P → MultiShell MCP: List available skills** to search and copy names, including global Codex skills when authorized. ChatGPT can also call `list_skill_names_code(shell_id="fallouttraduccion")` or use the legacy read-only `cwd="@mcp"`, `command="skills fallouttraduccion"` control query.

For project skills, see [Agent Skills](skills.md) and call `list_skills_code` with the selected shell.

Open the sidebar's **Skills** tab to search names and descriptions in this window's project. **Copy for ChatGPT** prepares an instruction containing the selected path and primary terminal; paste it into your MCP-connected chat. Terminal creation approvals appear directly in the separate **Requests** page, without a nested disclosure. Personal skills require the existing global read permission.

## Connect ChatGPT: create the custom MCP plugin after starting the tunnel (0.10.52)

The **ChatGPT → ? How to connect ChatGPT using MCP** entry under **AI Connections** covers the entire process. Installing and starting `tunnel-client` in VS Code alone does not register a ChatGPT plugin.

1. Under [OpenAI Platform — Tunnels](https://platform.openai.com/settings/organization/tunnels), create or select a tunnel and copy its **`tunnel_id`**. Associate it with the target ChatGPT workspace. Tunnel creation requires **Tunnels Read + Manage**.
2. Under [Platform — API keys](https://platform.openai.com/settings/organization/api-keys), create a **restricted runtime API key** with **Tunnels Read + Use**. Do not run the daemon with an admin key.
3. Under **MultiShell → OpenAI Tunnel**, install Tunnel Client, provide the **same `tunnel_id`** and runtime key, create the profile and select **Connect**. Keep the local MCP server running.
4. Under **ChatGPT → Plugins → + → Add custom MCP server**, configure a custom MCP plugin with a **name** (e.g. MultiShell MCP), optional **description**, **Connection: Tunnel**, and select your tunnel or enter the **same `tunnel_id`**. Select the MCP server's supported authentication; current local MultiShell does not implement OAuth. **Never enter the tunnel runtime key into the ChatGPT plugin form.**
5. Acknowledge the risk warning, select **I understand and want to continue**, click **Create as a plugin**, inspect the discovered tools and test the plugin from a chat. If the tunnel is missing, verify **Tunnels Read + Use** access and the target workspace association.

The custom MCP plugin created within ChatGPT is **not** the local `multi-shell-mcp-plugin-*.zip` package and is not created automatically by the tunnel client. See the [official ChatGPT custom MCP connection guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

**Removed unnecessary fields:** Gemini CLI and Claude Code no longer prompt for optional API keys during ordinary account login. Previously saved legacy keys can be explicitly removed using **Delete old key**; the update does not delete them automatically. Separate API profiles retain relevant credential fields.

## Provider-specific setup in the graphical panel (0.10.49)

Every **AI Connections** profile includes a **? How to connect** disclosure. It displays provider-specific prerequisites, verified copy-only commands (**never automatically executed**), official installation/account links and editable configuration fields for the relevant client surface.

**Gemini CLI example:** 1) install Node.js 20+; 2) review and run `npm install -g @google/gemini-cli` if needed; 3) run `gemini` and sign in with Google; 4) select **Configure automatically** to preserve other MCP servers while registering MultiShell in the local user configuration; 5) verify using `/mcp list` inside Gemini or `gemini mcp list` in a terminal. Normal Google sign-in **does not require an API key**. As of 0.10.52, Gemini CLI no longer displays an API key input; the separate **Gemini API** profile retains its corresponding field.

**Claude Code** shows official cross-platform setup options, account sign-in and `claude mcp list`. **Cursor and Copilot** show their local configuration guidance. **Claude web, Grok, Gemini Interactions API and Mistral** show public HTTPS requirements and official connector pages. OAuth browser consent remains with each external vendor.

Where applicable, fields cover a **public HTTPS MCP URL**, **connector ID**, **provider API key**, and **MCP Bearer token**. Keys are entered as password inputs, stored separately for each profile in **VS Code SecretStorage**, never returned to Webview state, and can be cleared or replaced individually. Non-secret HTTPS URLs and connector IDs are saved as metadata after validation (no embedded passwords, query secrets or localhost). Deleting a profile removes its onboarding settings.

A provider API key is separate from the MCP Bearer credential and the OpenAI Tunnel ID. ChatGPT's own **?** guide explains both the existing **OpenAI Tunnel** setup and the separate creation of a custom MCP plugin inside ChatGPT. **Saving a field does not expose a port, create an HTTPS tunnel, authenticate a vendor account or make a cloud connector live.** Secure transport and external vendor registration remain outstanding.

## Independent authenticated AI gateways in the panel (0.10.48)

This release introduces the **server-side authorization foundation required before external tunnels**. Each AI connection can have its own authenticated MCP listener, separate from the main coordinator on port 3000, but still using the same shared MultiShell routing core.

Fully graphical local workflow:

1. Start MultiShell in the **hub** VS Code window, open **AI Connections**, and create/select a profile.
2. Under **Independent MCP access**, select an existing exact shell ID and permission level: **Read only**, **Read and edit**, **Read and run commands**, or **Full**. Select **Set up isolated access** and approve the scope.
3. Select **Start gateway**. The card shows a local URL, such as `http://127.0.0.1:38100/mcp`, with a distinct listener port per profile.
4. **Copy private key** retrieves the independent credential from VS Code SecretStorage after an explicit warning. The key is never serialized to Webview state or written into project files. Compatible MCP clients must send `Authorization: Bearer <key>` to the corresponding endpoint. This is NOT an AI account API key nor a cloud-tunnel credential.
5. **Rotate key** revokes the previous secret and stops only its gateway. **Revoke** removes the saved credential and policy; **Autostart** is opt-in and applies only while this window is the active hub.

The permission gate checks exact shell identity and the original workspace root, forbids cross-shell access, terminal creation/closure and alias changes. Global MultiShell tool settings remain an upper bound on permissions.

**NOT a public connector yet:** localhost URLs cannot be accessed by Claude web, Grok or other cloud-hosted AIs. Version 0.10.48 neither publishes an HTTPS tunnel nor automatically registers vendor OAuth. Public access requires a separately tested authenticated transport and the provider's own setup flow. Never expose the raw 3000 listener or open 38100–38199 to the Internet.

## Terminal safety and visible AI profiles (0.10.47)

Saved **AI Connections** must render one card per persisted profile, in sync with the count. This fix does not delete or migrate existing profiles.

**Automatic interactive exit** can still be configured by window or terminal. It only sends `q` to recognized standalone pagers whose current screen confirms an interactive prompt. Unbalanced quotes, ambiguous shell escapes or a `>>` continuation prompt **never justify automatic input or process termination**. Persistent terminals remain reserved when a command times out until completion or verified idle status.

For maintenance commands, do not use `exit` to report test status in integrated PowerShell and avoid heavily nested `node -e` quoting; use reviewed temporary scripts and print the exit status without terminating the terminal.

## Provider-specific AI connection surfaces (0.10.46)

**AI Connections → New** separates **Local / Desktop** (Copilot, Claude Code, Gemini CLI, Cursor and other MCP clients) from **Cloud / API** (Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio and Cursor remote). Selecting a provider shows its distinct transport and requirements.

- **ChatGPT:** retain existing Secure MCP Tunnel controls.
- **Copilot / Claude Code / Gemini CLI / Cursor local:** extension-owned configuration can be installed into their local settings from the panel. “Configured” only verifies the file and does not mean the client has accepted tools or established a live session.
- **Claude web/Cowork:** custom connectors are configured in Claude; they connect from Anthropic infrastructure and require public authenticated HTTPS (OAuth or supported request headers).
- **Grok web:** Grok custom MCP connector requires a reachable HTTPS URL and compatible credentials; localhost is not reachable from the cloud.
- **Gemini Interactions API:** supports `mcp_server` tools using Streamable HTTP and `snake_case` names, including authorization headers; not the same product as Gemini web.
- **Mistral Work/Studio:** register custom MCP connectors using official mechanisms, with product and role requirements.
- **Cursor remote:** HTTPS Streamable HTTP and compatible authentication.

Remote profile cards explicitly show **Pending authenticated HTTPS gateway** and **Official setup**; they do not copy a localhost URL as a remote connector. **This version does not start an inbound gateway or register connectors in vendor accounts.** Authenticated per-connection identities, request authorization and a compatible tunnel must be implemented before a remote connector can safely become active.

The main MCP listener now authenticates the ChatGPT tunnel locally; other local clients should use individual authenticated gateways scoped to their permitted shell and tools.

## Secure per-AI local gateway setup (0.10.52)

1. Open **MultiShell → AI Connections** and create or select a client profile.
2. Provision a **separate authenticated gateway** bound to the exact shell ID and desired permission level. Start it and optionally opt in to autostart for future sessions.
3. Select **Copy configuration**. The snippet contains the scoped loopback gateway URL (ports 38100–38199) and `Authorization: Bearer YOUR_PER_CLIENT_GATEWAY_KEY`, which is **only a placeholder**.
4. Obtain the **individual gateway secret** through the local UI and enter it using the client's secure credential configuration, replacing the placeholder. Never paste it into chats, Git repositories or shared files. The copied example contains no secret.
5. Verify tool discovery in Gemini CLI, Claude Code, Cursor or Copilot. A saved configuration file alone does not establish that a client authenticated successfully.
6. Legacy entries pointing directly at port 3000 are reported as **obsolete/unauthenticated**. MultiShell-owned entries can still be inspected and removed with **Disconnect**; no old user configuration is silently deleted.

**Compatibility change since 0.10.45:** the former **Configure automatically** feature is not offered. It wrote an unauthenticated URL which stopped working when the main listener gained authentication in 0.10.52. We do not copy MultiShell's internal coordinator token to other applications' JSON configuration files. Fully automatic integration will need secure, provider-specific credential provisioning. The portable plugin does not contain credentials.

## Requests view and five concurrent MCP clients (0.10.44)

Requests now has a single page with heading, count, explanation, direct approvals and an empty state; there is no redundant disclosure.

**One coordinator listening on local port 3000 is sufficient for five MCP clients** in our synthetic tests. Five distinct shells may share one VS Code window or be spread across windows. Different shells can execute simultaneously, whereas calls targeting the same `shell_id` run FIFO.

**Not per-AI isolation:** client profiles do not currently authenticate callers or restrict their tool/shell visibility. Assign a distinct shell and preferably a separate working directory/Git worktree to each AI to avoid file collisions. Remote tunnels may add their own limits; the single coordinator is a single point of failure. Synthetic test throughput does not predict five real-model workloads or validate a multi-AI remote gateway.

## Structured navigation and multi-AI local profiles (0.10.43)

The sidebar offers **Overview**, **Terminals**, **Windows**, **Requests**, **Skills**, **AI Connections**, **Tunnel** and **Settings**. Open **Menu** to select a page, then the navigation folds to free vertical space. MCP port and interactive command auto-exit now live under **Settings**.

In **AI Connections**, ChatGPT opens the existing private OpenAI Tunnel Client manager. The **New** action stores local-only setup profiles for VS Code/GitHub Copilot, Claude Code, Gemini CLI, Cursor and other MCP clients. Only provider, label and creation timestamp are persisted. **Copy configuration** creates a local snippet for the current MCP port, following an explicit safety confirmation. You must install it manually in the other client and verify its connection.

**Security boundary:** these profiles do not establish an external session, authenticate client identities, store API keys, create tunnels, or independently enforce tool permissions. All local clients currently share the MCP server's global tool permissions; the loopback HTTP listener must not be published to the Internet. Clients may request editing or shell execution if those tools are globally enabled.

Examples: VS Code's `.vscode/mcp.json` uses `servers`, Gemini CLI uses `mcpServers` and `httpUrl`, Cursor uses `mcpServers` with `url`, and Claude Code uses `claude mcp add --transport http`. Merge each snippet with the client's existing configuration; MultiShell does not modify that client automatically.

## Integrated tunnel sidebar (0.10.41)

**0.10.42 improvement:** a tunnel launched by this extension can be reattached after a VS Code reload if its persisted process identity can be verified. Ambiguous or legacy processes stay external/detached and are never terminated. Stop an active managed tunnel before changing MCP ports; extension-created profiles update safely, imported profiles never change.

Open the **Tunnel** tab. Select **Install client** to download and verify Tunnel Client v0.0.19. Enter an existing **Tunnel ID**, a new profile name and the runtime **API key** in the masked field, then select **Create profile**. You may also reuse a compatible local profile without overwriting its YAML; the existing-profile picker requests a key in a native secure prompt.

Select **Connect** and optionally enable **Start tunnel automatically**, confirming the modal. **Disconnect** requires confirmation, stops only the extension-owned process, and disables autostart. External tunnels are not terminated. **Update key** replaces the saved secret without editing the profile.

The status differentiates managed, external and reload-preserved processes and paused automatic retries. The API key is sent once to the local VS Code extension host, stored in SecretStorage and never returned in webview snapshots or saved to project files. This tab does not create remote tunnels: a valid platform Tunnel ID and runtime key must already exist.

## 1. Start the server and select a terminal

1. Open a folder in VS Code and grant **Workspace Trust**.
2. Open the **MultiShell MCP** sidebar and select **Start** if the server is stopped.
3. Copy the terminal's ID or alias. In ChatGPT, say something like `shell=my_project: run git status`.

Selection is **not global**: each operation must identify its destination. The extension cannot infer which ChatGPT conversation sent a request. With several windows open, you can also copy a `window_id` from the **Windows** tab.

The panel shows coordinator/worker status, port, current project, terminal list, aliases, activity, queued commands, search, and quick actions. Each active window has a primary automatic terminal that cannot be closed through MCP.

## 2. Choose a terminal type

| Type | Tool or action | Authorization and behavior |
| --- | --- | --- |
| Primary | Created automatically for each window | Protected from MCP closure; recovered when VS Code reloads if possible |
| Temporary | `create_shell_code` | MCP may create it for auxiliary work; always has `mcp` origin |
| User-owned | `create_user_shell_code` or the panel's **New** action | Remote requests require local approval; panel-created terminals use the Create button; has `user` origin and is persisted |

### Ask the AI to create a user terminal

Make an explicit request, for example:

> Create a persistent user terminal named `tests` in a separate working directory. I will approve it in VS Code. Then use `shell=tests`.

The AI submits `create_user_shell_code` with a `shell_id`, optional working directory (`cwd`), and a `window_id` when needed. **No terminal has been created yet.** The request appears in the owning VS Code window's **Requests** disclosure below **Current window** with the ID, directory and sharing choice. The terminal is created **only after you select Approve creation**. Rejecting, cancelling or letting the request expire prevents creation.

Clicking **Create terminal** in the native sidebar form authorizes that local operation without opening a second modal. A single-use permit is bound to the requested ID, directory and sharing option. Undocumented `create_shell_code` arguments or calls to the coordinator's internal control API cannot bypass approval. **The AI cannot approve its own request.**

An MCP request to close a user-owned terminal through `close_shell_code` requires a separate local confirmation. The panel shows only one closing prompt. User-owned terminals retain their classification; running commands in a temporary terminal does not convert it into a persistent one.

**Security boundary:** MultiShell cannot verify the original wording of a request in ChatGPT. Approval in the owning window's **Requests** disclosure below **Current window** is the effective authorization step for remote creation. It also cannot prevent an already authorized shell command from starting external processes; this is not an OS sandbox.

## 3. Run tasks in parallel

Commands targeting **different terminals** can run concurrently. Within the **same terminal**, commands use a FIFO queue: one finishes before the next begins.

For example, assign `shell=tests` to tests and `shell=build` to compilation. If both tasks modify the same Git repository, prefer separate **Git worktrees**.

MultiShell normally prevents a new terminal from sharing exactly the same working directory as another. `allow_shared_directory=true` permits this only when requested; the user-terminal approval dialog identifies that choice. Sharing a directory can cause collisions involving Git, builds, and temporary files.

Relative working directories resolve against the owning VS Code window's workspace folder. Valid absolute paths are also supported. Specify the correct `window_id` for MCP creation when several windows are connected.

For non-interactive Git checks, builds, and tests, prefer `execute_isolated_command_code`. It uses the selected shell's working directory without sending any input to that terminal, so it works even if the terminal has a preserved running command. Its subprocess has no terminal session variables/aliases. Git paging and interactive Git credential prompts are disabled with `GIT_PAGER=cat`, `PAGER=cat`, and `GIT_TERMINAL_PROMPT=0`. Do not use it for interactive tools, and do not run writes or builds concurrently in the same checkout.

If an integrated-terminal Git command unexpectedly presents a pager, exit it manually with `q`. For integrated Git commands, use `git --no-pager diff --check` or `$env:GIT_PAGER='cat'; git diff --check` on PowerShell. Never assume a timeout means the process has ended.

## 4. Aliases and identity

Each terminal has a unique ID and may have a short alias such as `tests`, `1`, or `minecraft`. The panel displays `shell=alias`; use its three-dot menu to rename an alias. Collisions across windows are checked, and reserved aliases cannot be reused.

The panel can copy either a selector or a ready-to-paste instruction for ChatGPT. An alias selects a destination; **it does not authenticate a conversation**.

## 5. Timeouts, busy states, and recovery

**Read-only diagnostics:** `external_busy`, `recovery_reason`, `execution_phase`, `input_wait_hint`, and `output_silent_seconds` describe activity and waits. No hint or silent interval alone proves a stuck process. Automatic recovery reconciles stale state with PowerShell's actual runspace; it never automatically answers passwords or confirmations.



**Safe automatic recovery:** completion events and saved evidence are complemented by a separate PowerShell diagnostic runspace. Only an open, available foreground runspace outside a debugger breakpoint is accepted. Silent commands, nested shells, and input waits stay protected. Activity during inspection invalidates its result. No command is submitted to the terminal's foreground runspace.

**User-owned and primary automatic terminals** preserve their processes when a command times out. While the command is still active, MCP rejects new commands for that terminal to prevent overlap. If VS Code reports completion, the terminal becomes available again automatically.

If VS Code misses a completion event, MultiShell automatically inspects actual readiness and clears stale activity only after confirming idle state. **Check availability** repeats inspection without manual idle confirmation or interrupting a running command.

Temporary MCP terminals use a different timeout policy: they may be closed after timeout to avoid reusing an execution in an unknown state. If shell integration was unavailable and a command never started, a timeout must not destroy the primary terminal.

### After reloading VS Code

When VS Code preserves physical terminals, MultiShell reattaches their IDs and directories without creating duplicates. Sessions recover through trusted events, saved evidence, or PowerShell runspace inspection. Still-running processes remain preserved.

Terminals from other projects, duplicate IDs, or conflicting metadata must not be adopted. If VS Code has actually terminated a process, the extension cannot restore that process.

**Closing a user terminal manually** differs from reloading VS Code: closing removes its saved identity, and it should not be recreated.

## 6. Multiple windows and connections

One window acts as **Coordinator** and exposes a single local HTTP MCP endpoint. Other windows are **Workers** using auxiliary local ports. Their status and IDs are available in the panel.

The extension monitors local server availability and attempts recovery after an unexpected closure. File operations against an offline worker are blocked until it reconnects. An ON indicator means the **local extension** is active; it **does not prove that the remote tunnel is connected**.

The default port is **3000**, bound to `127.0.0.1`. The panel supports ports 1024–65535. **Changing the local port does not reconfigure Tunnel Client**: update the tunnel destination separately when needed. Avoid port changes during active work.

For older connectors using `cwd="@mcp"` and `cwd="@shell:<alias>"`, see [MCP compatibility](compatibility.md).

## 7. Permissions and security

The extension requires a trusted project through **Workspace Trust**. MCP tool permissions can be configured through `multi-shell-mcp.enabledTools`: `shell`, `file`, and `edit`.

The MCP server listens on a loopback address. It remains compatible with Tunnel Client 0.0.18 and the external `sample_mcp_remote_no_auth` profile: it does not add its own OAuth requirement or mandatory headers to `/mcp`. `Host` and `Origin` headers are checked, but remote access and credentials are governed by the tunnel. Never expose this local endpoint directly to the internet.

All commands run with the VS Code user's actual privileges; **there is no container isolation**. See [Testing and troubleshooting](validation.md) for a verification checklist.

## Automatic exit from interactive programs

The `multi-shell-mcp.interactiveAutoExit` setting is **enabled by default**. The MultiShell panel has a switch for the **current window** and each terminal's three-dot menu lets you enable, disable, or inherit that window setting.

**Precedence:** terminal override → window preference → global default. An AI-created temporary terminal **inherits the preference of its owning window, never the exception of whichever terminal requested its creation**. When the window preference changes, existing temporary terminals without their own exception immediately reflect the new effective value in the panel and use it for subsequent commands. Recreating a temporary terminal with the same ID cannot revive an obsolete exception from its previous instance. Each VS Code window maintains an independent policy.

The extension recognizes standalone `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` and `tig`. It **never sends `q` merely on first output**: a recognizable paging prompt (`-- More --`, `(END)` or `:`), an interactive `top` header, or an alternate-screen entry must be observed. Help, version, non-interactive modes, pipelines and compound commands are excluded. This is intentionally conservative and cannot cover every language, pager, platform or configuration.

**Technical limitation:** the VS Code terminal API cannot reliably prove that a running application is waiting for keyboard input. When a program produces no usable output or its state cannot be confirmed, normal timeout protection remains: a user-owned terminal is preserved and its queue stays locked until completion.

## Persistent terminal request inbox

Instead of an immediate modal alert, requests from `create_user_shell_code` appear in the owning window's **Requests** disclosure below **Current window** with terminal ID, directory, and directory-sharing choice. Select **Approve creation** or **Deny**. Requests have a limited lifetime and disappear on client cancellation or server shutdown. No terminal is created without local approval.

Terminals created directly from the panel use the Create button as local approval and do not open another modal. Closing user-owned terminals retains separate authorization.
## Window reload and interface language

In 0.10.22, after **Reload Window**, MultiShell manages one `main` terminal per window and can automatically re-enable previously idle terminals when their physical identity matches. Older primary terminals are not registered as additional managed sessions; potentially active residual processes are never closed without reliable safety evidence.

The panel follows the VS Code language automatically: Spanish when selected, English for all other languages. There is no manual language dropdown.
## Improved automatic recovery in 0.10.22

The extension saves idle evidence and automatically checks PowerShell when restoring or retrying protected sessions. The shield button repeats verification; it does not authorize a blind unlock. Unverifiable shells remain protected. Non-interactive work can use `execute_isolated_command_code`, with separate variables and aliases.
## Execution and restoration safety (0.10.22)

- Shell-integration execution events prevent MCP from injecting commands while a manually started command is active; no `Ctrl+C` is sent.
- Cancelling a queued item cannot allow later requests through before earlier executions finish.
- If output reading fails, the terminal remains reserved until a completion event or reliable automatic idle verification.
- Only user-owned terminals with saved ownership metadata are reattached. A matching name and directory is insufficient to promote a temporary shell to a `user` session; legacy untracked terminals are not adopted.
- Disconnected creation requests are rolled back when the pending request is identifiable; unrelated active user terminals are not closed.
## Post-completion output draining (0.10.27)

If VS Code confirms command completion but the output iterator remains open, MultiShell drains it for **750 ms** before releasing the FIFO gate and returning `output_incomplete=true` and `truncated=true`. Without a completion event, the normal timeout and process-preservation protections remain in effect. Real Linux behavior and every Windows PowerShell configuration still require direct validation.

## Connections and reload (0.10.28)

When a window reloads, the coordinator can retain its previous registration for up to 12 seconds. The new instance automatically waits for that registration to expire and reattaches the original terminal. This registration retry is bounded to 15 seconds; a window that remains live retains ownership.

If the connection breaks during a command, the original request can fail while its process continues. Queued commands are cancelled and **already dispatched commands are never automatically replayed**. Check the state and result before resubmitting an operation that changes data. A primary or user shell becomes available again when its process can be verified as idle.

Discovery of an unresponsive window expires after two seconds; other windows remain usable. Incomplete HTTP headers have a ten-second limit and bodies a fifteen-second limit, checked every second. These limits apply to receiving a request, not to legitimate command duration or a silent process.

## Cancelled operations and reconnection (0.10.29)

Request cancellation also reaches temporary creation, closure, and alias changes. Pending operations check cancellation before applying; a closure approval received after disconnect cannot close the user terminal. Local approvals remain mandatory.

After reconnection, a response from the previous connection is discarded: it cannot rename a replacement terminal, remove its assignment, or mark it offline. If the connection changes during an operation, inspect the current state before repeating it; a lost response does not establish whether the operation ran.

When the extension restarts its manager, previous requests settle and their listeners are removed. Preserving a terminal process does not retain the old manager's waits. Queued commands are not dispatched during restart.

Documentation compatible with 0.10.72.

Compatible with 0.10.59.

Documentation compatible with 0.10.60.

Compatible with 0.10.61.

Documentation compatible with 0.10.62.

Documentation compatible with 0.10.63.

Compatible with 0.10.64.
