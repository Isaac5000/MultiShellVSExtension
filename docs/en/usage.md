# User guide

[Español](../es/uso.md) · [Index](../../README.md)

Applies to **MultiShell MCP Server 0.10.25**. See [Installation](installation.md) for setup, or [MCP compatibility](compatibility.md) for older connector arguments.

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

The AI submits `create_user_shell_code` with a `shell_id`, optional working directory (`cwd`), and a `window_id` when needed. **No terminal has been created yet.** The request appears in the owning VS Code window's **Requests** tab with the ID, directory and sharing choice. The terminal is created **only after you select Approve creation**. Rejecting, cancelling or letting the request expire prevents creation.

Clicking **Create terminal** in the native sidebar form authorizes that local operation without opening a second modal. A single-use permit is bound to the requested ID, directory and sharing option. Undocumented `create_shell_code` arguments or calls to the coordinator's internal control API cannot bypass approval. **The AI cannot approve its own request.**

An MCP request to close a user-owned terminal through `close_shell_code` requires a separate local confirmation. The panel shows only one closing prompt. User-owned terminals retain their classification; running commands in a temporary terminal does not convert it into a persistent one.

**Security boundary:** MultiShell cannot verify the original wording of a request in ChatGPT. Approval in the owning window's **Requests** tab is the effective authorization step for remote creation. It also cannot prevent an already authorized shell command from starting external processes; this is not an OS sandbox.

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

**Safe automatic recovery:** after restoring a session, MultiShell waits for a definite command-completion event from VS Code shell integration. When such an event arrives (including an exit code, with no other observed execution active), the terminal is unlocked automatically without sending commands or signals. If the shell was already idle before restoration and no completion event can be observed, manual confirmation is still required: VS Code does not expose a reliable "terminal is idle" property for restored processes. Probing with a command is unsafe because the API may send `Ctrl+C` to interrupt an existing process.

**User-owned and primary automatic terminals** preserve their processes when a command times out. While the command is still active, MCP rejects new commands for that terminal to prevent overlap. If VS Code reports completion, the terminal becomes available again automatically.

If VS Code misses the completion event, the panel may display **Timed out · process preserved**. Check that the command really finished, or interrupt it yourself, before clicking **Re-enable MCP**. This action **does not terminate a process**: it only authorizes the MCP queue to use the terminal again. Approving too early can cause overlapping commands.

Temporary MCP terminals use a different timeout policy: they may be closed after timeout to avoid reusing an execution in an unknown state. If shell integration was unavailable and a command never started, a timeout must not destroy the primary terminal.

### After reloading VS Code

When VS Code preserves the physical terminal instances, MultiShell attempts to reconnect them using stored IDs, directories, and metadata. It must not create duplicate user-owned terminals. Restored terminals are enabled automatically when a verified completion event or saved idle evidence matches the original process and directory. Ambiguous cases still require manual confirmation.

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

Instead of an immediate modal alert, requests from `create_user_shell_code` appear in the owning window's **Requests** tab with terminal ID, directory, and directory-sharing choice. Select **Approve creation** or **Deny**. Requests have a limited lifetime and disappear on client cancellation or server shutdown. No terminal is created without local approval.

Terminals created directly from the panel use the Create button as local approval and do not open another modal. Closing user-owned terminals retains separate authorization.
## Window reload and interface language

In 0.10.22, after **Reload Window**, MultiShell manages one `main` terminal per window and can automatically re-enable previously idle terminals when their physical identity matches. Older primary terminals are not registered as additional managed sessions; potentially active residual processes are never closed without reliable safety evidence.

The panel follows the VS Code language automatically: Spanish when selected, English for all other languages. There is no manual language dropdown.
## Improved automatic recovery in 0.10.22

The extension records idle evidence after execution changes and periodically while running. Following a reload, it checks that the same physical terminal is present (process ID and directory) and no outstanding command is known. When the evidence matches, MCP is re-enabled without interaction; otherwise, manual confirmation remains. **No probing commands or signals are sent.** The recovery button uses a shield icon while automatic exit uses a distinct log-out icon.
## Execution and restoration safety (0.10.22)

- Shell-integration execution events prevent MCP from injecting commands while a manually started command is active; no `Ctrl+C` is sent.
- Cancelling a queued item cannot allow later requests through before earlier executions finish.
- If output reading fails, the terminal stays reserved until VS Code reports command completion or the user explicitly confirms it is idle.
- Only user-owned terminals with saved ownership metadata are reattached. A matching name and directory is insufficient to promote a temporary shell to a `user` session; legacy untracked terminals are not adopted.
- Disconnected creation requests are rolled back when the pending request is identifiable; unrelated active user terminals are not closed.
## Post-completion output draining (0.10.25)

If VS Code confirms command completion but the output iterator remains open, MultiShell drains it for **750 ms** before releasing the FIFO gate and returning `output_incomplete=true` and `truncated=true`. Without a completion event, the normal timeout and process-preservation protections remain in effect. Real Linux behavior and every Windows PowerShell configuration still require direct validation.