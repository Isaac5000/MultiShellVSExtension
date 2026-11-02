# MultiShell MCP Agent Plugin

Portable Agent Plugins package for ChatGPT and Codex, with an Agent Skills workflow and an onboarding skill.

## Local installation

The repository marketplace is `.agents/plugins/marketplace.json`. Install the `multishell-mcp` plugin from the `multishell-local` source on a supported local ChatGPT/Codex client. The plugin is **not installed automatically** by building the VSIX.

The bundled `mcp.json` points to `http://127.0.0.1:3000/mcp`, a local VS Code connection. It works only where a client can reach the same loopback interface and port. Change the port if necessary; connect a remote ChatGPT Work client using your existing secure registered MCP tunnel, not a public exposure of the local unauthenticated server.

The packaged skills themselves do not need server access to be readable, but they cannot call MultiShell tools without a connected and enabled MCP server. No skill implicitly grants shell execution or modifies VS Code permissions.

## Layout

- `plugin.json`: portable Agent Plugins manifest
- `mcp.json`: local Streamable HTTP MCP connection for suitable desktop clients
- `skills/setup/SKILL.md`: safe onboarding
- `skills/multishell-mcp/SKILL.md`: MultiShell usage workflow
- `skills/multishell-mcp/references/tool-guide.md`: usage examples

See `../../docs/es/skills.md` or `../../docs/en/skills.md` for the full project documentation.
