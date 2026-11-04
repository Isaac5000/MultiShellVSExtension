---
name: setup
description: Configure the MultiShell VS Code MCP server for local AI clients or ChatGPT through a verified Secure MCP Tunnel and custom MCP plugin.
---

# Connect MultiShell MCP

1. Verify MultiShell MCP Server v0.10.52 or later is installed and **ON** in a trusted VS Code workspace. Its local MCP URL is `http://127.0.0.1:3000/mcp` by default (use the configured port). ChatGPT Work in the cloud cannot reach this loopback URL directly. The main local endpoint requires a private, installation-specific X-MultiShell-Local-Auth header. Do not expose the endpoint or disclose the token. The portable plugin declares an API-key custom header but does not ship credentials. The local Codex client must request/obtain this credential through its own secure connection setup, or use a MultiShell-managed authenticated per-client AI gateway configured in the extension.
2. **Local AI clients:** Gemini CLI, Claude Code, VS Code/Copilot and Cursor must first provision and start an authenticated per-profile gateway under **MultiShell → Conexiones IA**, then use **Copiar configuración** to obtain a gateway URL with a Bearer PLACEHOLDER. Replace it through the client's secure credential setup (never commit actual credentials). The former URL-only automatic installation is disabled because it cannot authenticate. Account sign-in happens in the client itself; a saved file does not prove connectivity.
3. **ChatGPT needs a separate custom MCP plugin** in addition to the running tunnel:
   - In [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels), create/select a tunnel and associate it with the target ChatGPT workspace. Record its `tunnel_id`. Tunnel creation requires **Tunnels Read + Manage**.
   - In [Platform Runtime API keys](https://platform.openai.com/settings/organization/api-keys), create a restricted runtime key with **Tunnels Read + Use**. Do **not** use an admin key.
   - In **MultiShell → Túnel OpenAI**, install Tunnel Client, enter that `tunnel_id` and the runtime key, configure the profile, and connect. Keep the local MCP server running.
   - In **ChatGPT → Plugins → + → Add custom MCP server**, give it a name (e.g. `MultiShell MCP`) and optional description, select **Connection: Tunnel**, and choose the tunnel or enter the **same `tunnel_id`**. Use the authentication appropriate to the MCP server (the existing local MultiShell sample is not an OAuth server). **Never enter the tunnel runtime API key in the ChatGPT plugin form.** Accept the risk warning, choose **Create as a plugin**, and verify the discovered tools.
   - A ChatGPT workspace user must have permission to create/use custom MCP plugins and **Tunnels Read + Use**. If the tunnel is missing, verify its workspace association. See the [official connection guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
4. **Do not confuse** this portable plugin package (skills/manifest) with the custom MCP plugin created inside ChatGPT. Neither simply installing this package nor starting Tunnel Client automatically creates the ChatGPT MCP connection.
5. Only after tools are visible: use `list_windows_code` and `list_shells_code`, select the exact `shell_id`, and optionally use `list_skills_code` or `load_skill_code`. Never execute referenced scripts without user authorization; honor shell busy states and workspace trust.

Do not request or reveal passwords, runtime API keys, cookies, or tokens in chat messages or plugin instructions. Keep runtime keys in the VS Code secure store.