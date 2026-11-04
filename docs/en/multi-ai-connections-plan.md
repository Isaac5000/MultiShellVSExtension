# Future plan: MultiShell UI and multi-AI connections

> **Status:** local UI and client setup implemented in 0.10.43–0.10.47; version 0.10.48 adds **per-client authenticated loopback MCP gateways**, individual credentials, shell permissions and revocation. **Still pending:** public HTTPS tunnel, provider-specific login/registration and live acceptance tests. Original proposal November 3; security phase begun at the user's request on November 4.
> **Prerequisite:** prevent PowerShell's integrated console from taking the foreground at VS Code startup without interrupting the existing MCP tunnel or terminals.
> **Baseline:** MultiShell MCP Server 0.10.52.

## Provider-specific client surfaces as of 0.10.46

AI Connections now differentiates local applications from cloud/API clients. Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio and Cursor remote can be recorded as explicitly **pending** profiles, with tailored transport/auth requirements and provider-owned setup pages. Neither localhost URLs nor unverified public connection states are presented as working remote connections.

Actual remote-connector enablement remains gated on:

1. Per-connection identities and secret storage, revocation and **server-enforced** tool and shell authorization.
2. Authenticated loopback-bound gateway with abuse controls and session isolation, tested against unauthorized and cross-profile requests.
3. User-approved outgoing HTTPS tunnel adapter with verified transport and per-instance process/port ownership; never publicly expose raw port 3000.
4. Vendor-specific registration/auth steps: Claude custom connector OAuth/headers, Grok custom MCP, Gemini Interactions API mcp_server with headers and snake_case names, Mistral Connector, Cursor remote. Accounts and OAuth consent may require a vendor-owned page; don't invent registration APIs.
5. Verified end-to-end MCP calls under the intended permissions before showing a Connected status.

**Status:** step 1 is implemented for the new protected endpoints, and step 2 partially implemented on loopback (request authorization, origin checks, scoped sessions; advanced abuse controls remain). Steps 3–5 remain pending. **Do not deploy public tunnels** until traffic-limiting and provider-specific HTTPS exposure are validated.

## Goal and design

Evolve MultiShell into a single MCP core connected to multiple AI clients through **independent transports, identities, credentials and authorization policies**. Keep Windows/Linux/macOS and Spanish/English support. The existing OpenAI Tunnel Client is specific to OpenAI and is not a universal transport.

The narrow sidebar should have a compact server status header, vertical navigation (Overview, Terminals, Windows, Requests, Skills), a dynamic **AI Connections** collection, and an Administration section (Permissions/Security, Activity/Diagnostics, Settings). Never add one tab per AI provider.

**Overview:** service, hub/worker, current window, connections and alerts. **Terminals:** shells and FIFO/busy/ownership state. **Requests:** approvals with explicit identity. **Skills:** search and scope filters. **AI Connections:** connection identity, provider, transport, verified health, credentials, permissions, autostart, reconnection history, diagnostics. **Settings:** MCP port, interactive auto-exit and advanced options.

The New Connection wizard has five stages: (1) provider/client and actual MCP capability, (2) supported local/HTTPS/private-tunnel transport, (3) authentication and SecretStorage key management, (4) per-connection least-privilege tools/windows/shells, (5) verifiable connection and permission tests.

## Preliminary provider matrix (reverify official support before implementation)

| Client/provider | Candidate integration | Caveat |
|---|---|---|
| ChatGPT/Codex | OpenAI Secure MCP Tunnel or authorized remote MCP | Preserve the existing working integration |
| Claude | HTTPS remote MCP/OAuth | Product/plan-dependent |
| Gemini | CLI or API MCP | Do not infer web-app support from API/CLI |
| GitHub Copilot | MCP in VS Code / compatible product | Cloud vs local capabilities differ |
| Cursor | Local or remote MCP | Verify version and auth |
| Perplexity | Supported custom MCP connector | Subscription/product dependent |
| Mistral | Compatible client or development environment | Not every interface supports MCP |
| Grok/xAI | API/development-tool MCP | Does not automatically imply chat-web support |
| DeepSeek | MCP-capable client/harness | Do not assume native API tool execution |

## Architecture and security

```text
AI Client -> Transport Adapter -> Authenticated MCP Gateway
 -> Identity and Per-Request Authorization -> Single MultiShell MCP Core
 -> Local Window Router -> VS Code terminals and tools
```

- Reuse current MCP server, window/shell IDs and routing.
- Extract a transport interface around OpenAI-specific `TunnelManager`, rather than cloning its state machine.
- Current single health port (8080) and global lock cannot represent independent simultaneous tunnels unchanged. Scope health ports, process identities and locks by connection.
- Shared authenticated HTTPS gateway may serve multiple clients; retain private tunnels when appropriate.
- Never expose secrets to webview snapshots, process arguments, unprotected settings or logs. Keep secret storage independent per connection.
- Require validated client identity and explicit permissions **on every MCP request**, not merely a friendly client label.
- Do not publish the current localhost MCP server to the public internet without a dedicated authentication and authorization layer.
- Preserve Workspace Trust, local persistent-terminal approvals, per-shell FIFO, timeout protection, and strict process ownership/reload logic.
- Do not duplicate running terminals, workspaces or storage for each provider.

## Phased implementation (not authorized yet)

0. Fix and verify PowerShell startup visibility first, preserving all running tools.
1. Reorganize UI and add a dynamic AI Connections section without breaking the OpenAI tunnel.
2. Add credential isolation, identities, per-connection policies, revocation and security tests.
3. Build an authenticated HTTPS gateway and local/HTTPS/private-tunnel adapters. Verify one additional real client end-to-end.
4. Add more providers gradually, with simultaneous-connection, reload, permission and cross-platform acceptance tests.

## Acceptance and unresolved choices

Pass only when existing ChatGPT/OpenAI setup remains functional, multiple identities have independent authorization, prohibited tools cannot be invoked even with forged MCP requests, FIFO remains correct, and connected state derives from real checks. Cover existing automated suites plus integration tests and physical Windows/Linux/macOS runs.

Not yet decided: HTTPS gateway vendor, quotas/limits, exact plans supported by each provider, OAuth implementation details, or costs.

**Scope boundary:** this document records research and design only. It does not authorize multi-provider implementation or destructive migration.