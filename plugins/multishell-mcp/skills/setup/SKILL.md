---
name: setup
description: Connect and verify MultiShell MCP Server in a trusted VS Code workspace, then discover terminals and Agent Skills safely.
---

# Set up MultiShell MCP

1. Check that MultiShell MCP Server v0.10.39 or later is installed in VS Code, that the project is trusted, and that MultiShell is ON.
2. The portable plugin ships a **local-only** MCP connection at `http://127.0.0.1:3000/mcp`. It is only reachable by clients running on the same machine. If the VS Code port differs from 3000, update the local connection. **ChatGPT Work in the cloud cannot reach this loopback URL.** For a cloud connection, configure the existing secure MCP tunnel/registered plugin separately. Do not expose the unauthenticated local endpoint directly to the public internet.
3. Identify the connected server tools. If no MultiShell tools appear, ask the user to connect or enable the MCP server rather than pretending the plugin can access it.
4. Call `list_windows_code` and `list_shells_code`. Choose the exact `shell_id` for the requested VS Code project.
5. Call `list_skills_code` with that `shell_id`. If supported by the host, it may also discover skills using the MCP Skills extension `skills/list` and load them via `skills/get` plus `resources/read`.
6. Do not execute any script merely because a skill references it. Respect shell busy states, human approvals and explicit workspace selection.

The bundled `multishell-mcp` skill provides the operational workflow. Repository-specific skills remain in their respective projects and are not copied into this plugin.