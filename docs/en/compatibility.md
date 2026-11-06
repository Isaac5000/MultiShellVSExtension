# MCP connector compatibility

[Español](../es/compatibilidad.md) · [Index](../../README.md)

MultiShell MCP 0.10.57 retains a compatibility layer for older connectors that do not expose `shell_id` explicitly. **Even through this layer, every operation must select a terminal.** There is no global active shell, and the extension cannot identify which ChatGPT conversation sent a request.

Use `list_skill_names_code(shell_id="fallouttraduccion",scope="all")` to get names from the project and Codex. When ChatGPT has a cached tool schema, use `execute_shell_command_code(command="skills fallouttraduccion",cwd="@mcp")` as a read-only control query. To include global Codex skills, explicitly enable the off-by-default `multi-shell-mcp.globalCodexSkills` permission. [Full guide](skills.md).

Version 0.10.39 uses **only MCP SDK v2**, while retaining 2025-era wire-protocol compatibility through `createMcpHandler` (`legacy: 'stateless'`). Clients do not need an SDK v2 migration to keep making valid legacy MCP requests. The tunnel continues to target `http://127.0.0.1:3000/mcp`; no launcher/profile change is required. Full end-to-end verification through the live tunnel remains pending.

## Current tools

When the MCP client has refreshed its tool schema, use tools with explicit arguments:

| Tool | Purpose |
| --- | --- |
| `list_windows_code` | List connected project windows and their `window_id` values |
| `list_shells_code` | List terminal IDs, aliases, and states |
| `create_shell_code` | Create a **temporary MCP terminal**; not a persistent user terminal |
| `create_user_shell_code` | Request a **user-owned terminal**, requiring approval in the owning window's **Requests** tab |
| `execute_shell_command_code` | Execute a command in the selected `shell_id` |
| `set_shell_alias_code` | Set or change a terminal alias |
| `close_shell_code` | Close a terminal; closing a user-owned one requires local approval |

The `list_skills_code`, `read_skill_code`, and `read_skill_file_code` tools expose workspace Agent Skills. Compatible clients can also use `skill://index.json` resources. See the [Agent Skills guide](skills.md).

File reading and editing tools operate within the selected terminal's allowed directory. Diagnostics, symbols, and other native VS Code operations run in the owning window.

### Request a persistent terminal

`create_user_shell_code` **does not grant approval to the AI**. It adds a request to the owning VS Code window's **Requests** tab, showing ID, directory and sharing choice. Denial or cancellation creates nothing.

`create_shell_code` cannot be upgraded to a user-owned terminal through extra fields. Closing a user-owned terminal also needs local approval. See the [User guide](usage.md) for the full behavior.

## Legacy connector: `@mcp` and `@shell`

Older clients may use `execute_shell_command_code` with `cwd="@mcp"` for **control queries that do not run a system shell**:

```text
execute_shell_command_code(command="windows", cwd="@mcp")
execute_shell_command_code(command="shells", cwd="@mcp")
execute_shell_command_code(command="help", cwd="@mcp")
```

To run a system command, select a terminal by ID or alias:

```text
execute_shell_command_code(command="git status", cwd="@shell:my_project")
```

`my_project` is an example alias; copy the real one from the panel or the response to `shells`. Commands in different terminals can run concurrently, while each terminal maintains FIFO order.

### File reading and editing

Prefix relative file paths with `@shell:<id>/`:

```text
read_file_code(path="@shell:my_project/src/main.ts")
```

Copy and move tools require **both paths to resolve to the same terminal**. Requests with missing selectors, cross-terminal paths, or paths outside the allowed scope are rejected.

The legacy layer supports **control queries and operations on existing terminals**. To access a newly introduced tool such as `create_user_shell_code`, the connector must refresh its current schema. If the tool is missing, refresh or reconnect the ChatGPT MCP connector after installing the VSIX. There is no reason to change the tunnel's credentials or profile to fix a cached schema.

## Integrated Tunnel Manager (new in 0.10.40)

The first integration phase uses official Tunnel Client **v0.0.19** without adding binaries to Git or changing the existing v0.0.18 distribution. Use the VS Code Command Palette:

1. **Tunnel — Install Official v0.0.19** selects Windows, Linux or macOS and x64/ARM64, downloads over HTTPS and checks the pinned official SHA-256 before extracting.
2. **Tunnel — Configure API Key and Profile** prompts locally for an existing Tunnel ID and runtime API key. It uses `init --sample sample_mcp_remote_no_auth`, refuses to overwrite an existing profile and stores the API key using `SecretStorage`.
3. **Tunnel — Start** verifies the local MCP listener, checks for an existing service on port 8080, runs `doctor` and starts a child process without opening an integrated terminal.
4. **Tunnel — Show Status**, **Stop (Managed Only)** and **Toggle Automatic Start** expose local management. Autostart requires explicit approval, starts off, and only runs from the elected hub window.

**Limitations:** the manager does not create a remote OpenAI Platform tunnel (an existing Tunnel ID is required), import the legacy Windows DPAPI file, overwrite existing profiles, or kill external tunnel processes. The health port is fixed at 8080 in this initial phase; multiple custom ports and multi-profile service ownership need further development. The key is stored in `ExtensionContext.secrets`, and the profile in global extension storage. Tunnel supervision after closing VS Code is not guaranteed, and its VS Code-hosted MCP server would also be offline.

Official release: https://github.com/openai/tunnel-client/releases/tag/v0.0.19

## Security and tunnel

The MCP endpoint defaults to `127.0.0.1:3000/mcp`. External tunnels are configured separately: the extension maintains its local contract without its own OAuth or new mandatory headers for Tunnel Client 0.0.18. Shell selectors and aliases **do not authenticate individual conversations**, and commands run with the user's actual privileges. Do not expose the local endpoint directly to the internet without access control.

See [Installation](installation.md) for updates and [Validation](validation.md) for connection testing.

## Authorization and interactive commands (0.10.19)

`create_user_shell_code` enqueues a request in the owning window's **Requests** panel instead of granting authorization. Only that local panel can approve or deny it. Neither the public MCP tool set nor the internal control endpoint exposes an approval operation. Expired or disconnected requests create no terminal.

The global `multi-shell-mcp.interactiveAutoExit` setting defaults to `true`. The panel supports a per-window preference with per-terminal overrides. Automatic exit only attempts `q` for recognized standalone interactive commands; universal detection of keyboard-waiting processes is not guaranteed.

Documentation compatible with 0.10.72.

Compatible with 0.10.59.

Documentation compatible with 0.10.60.

Compatible with 0.10.61.

Documentation compatible with 0.10.62.

Documentation compatible with 0.10.63.

Compatible with 0.10.64.
