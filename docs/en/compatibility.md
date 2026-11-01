# MCP connector compatibility

[Español](../es/compatibilidad.md) · [Index](../../README.md)

MultiShell MCP 0.10.25 retains a compatibility layer for older connectors that do not expose `shell_id` explicitly. **Even through this layer, every operation must select a terminal.** There is no global active shell, and the extension cannot identify which ChatGPT conversation sent a request.

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

## Security and tunnel

The MCP endpoint defaults to `127.0.0.1:3000/mcp`. External tunnels are configured separately: the extension maintains its local contract without its own OAuth or new mandatory headers for Tunnel Client 0.0.18. Shell selectors and aliases **do not authenticate individual conversations**, and commands run with the user's actual privileges. Do not expose the local endpoint directly to the internet without access control.

See [Installation](installation.md) for updates and [Validation](validation.md) for connection testing.

## Authorization and interactive commands (0.10.19)

`create_user_shell_code` enqueues a request in the owning window's **Requests** panel instead of granting authorization. Only that local panel can approve or deny it. Neither the public MCP tool set nor the internal control endpoint exposes an approval operation. Expired or disconnected requests create no terminal.

The global `multi-shell-mcp.interactiveAutoExit` setting defaults to `true`. The panel supports a per-window preference with per-terminal overrides. Automatic exit only attempts `q` for recognized standalone interactive commands; universal detection of keyboard-waiting processes is not guaranteed.