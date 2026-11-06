# Feasibility of autonomous ChatGPT continuation via MultiShell MCP

**Reviewed 5 November 2026.** Scope: regular ChatGPT conversations and an
MCP tool server, with no billable API keys, no replacement AI/model, and no
undocumented browser automation.

## Verdict

**The exact requirement cannot be guaranteed through currently documented
official MCP server interfaces.** A server does not own the ChatGPT conversation
lifecycle, and cannot automatically create a successor ChatGPT web chat when
the host's context becomes exhausted.

- MCP 2026-07-28 Streamable HTTP is client-request-oriented. The client sends
  POST requests, and server-to-client input requests are handled *within* a
  client-initiated Multi Round-Trip Request (MRTR). This does not give the
  server the power to create a ChatGPT conversation or start a new model turn.
- ChatGPT's custom MCP plugin documentation describes invoking tools from
  ChatGPT, not externally managing ChatGPT conversations.
- No official MCP tool can report the precise remaining ChatGPT conversation
  context budget. Saving checkpoints after each meaningful milestone reduces
  loss, but does not guarantee a last-second rollover.
- An exact guarantee would require new, explicitly authorized host capabilities:
  initiating or scheduling another model turn, reporting context exhaustion,
  creating a new chat in a specific Project, and atomically transferring a
  checkpoint, with quota, permission, and stop guarantees.

This is a conclusion about **today's supported integration contract**, not
a claim that OpenAI can never provide those features.

## ChatGPT widget exception

OpenAI's Plugins UI API documents
`window.openai.sendFollowUpMessage({prompt})` (also `ui/message`).
A *rendered widget* can ask ChatGPT to post a follow-up message in the
current conversation. This is not a background MCP server command.

Such a widget could support a user-triggered one-click **Continue** action,
but it does not expose a documented method to create another ChatGPT chat,
read the remaining context budget, or guarantee endless host-driven turns.
The widget path has **not** been tested end-to-end against ChatGPT for this
project and is not presented as working automated continuation.

## Official alternatives

| Feature | What it offers | Gap |
| --- | --- | --- |
| ChatGPT Chat + MCP | Regular chat using authorized tools | No server-controlled next turn or chat creation |
| ChatGPT Projects | Shared files, instructions and context across chats | Does not auto-create successive conversations |
| ChatGPT Work | Long-running delegated tasks, optionally in the background | Different execution mode; no guarantee of infinite regular-chat rollover |
| Dots | Ongoing agent that can start visible cloud threads | Different product/rollout; personal availability currently lists Pro tiers outside EEA/UK/Switzerland, not regular Plus in the EEA |
| Plugins UI follow-up | Widget-driven message in current chat | No documented new-chat operation or perpetual chain |
| OpenAI API / Agents API | API-managed runs and conversations | Separately metered; explicitly disallowed for this project |
| Undocumented browser automation | Could click ChatGPT UI | Unsupported, fragile and not permitted by this project's requirements |

Usage included in a subscription is never assumed to be unlimited.
No additional credits or paid fallback is authorized.

## Installed MultiShell 0.10.63 verification

Run the **read-only diagnostic** against the already running local MCP server:

```powershell
node test/manual-chatgpt-host-boundary.cjs 19ce8934-64c9-4523-b3d8-3b45c2aa38f4
```

Observed: authenticated MCP connection; 32 advertised tools; the three
`chat_handoff_*` operations (list, load, save); real checkpoint retrieved
successfully. No tool provided by this server can create a ChatGPT conversation
or cause the host to send another turn. The declared local server
capabilities are `extensions`, `resources`, and `tools`.

**Test limit:** the local server tool list does not inspect private ChatGPT
host capabilities. The integration conclusion relies on the published MCP
and OpenAI contracts, not solely the absence of a local tool name.

## Supported, non-billable workflow

1. Keep ChatGPT as the assistant and MultiShell as its tool provider.
2. Save compact progress at meaningful milestones with
   `chat_handoff_save_code`, including verified results and unresolved risks.
3. In a manually started chat in the same Project, rediscover the exact
   shell with `list_shells_code`, list available goals with
   `chat_handoff_list_code`, and load the intended ID with
   `chat_handoff_load_code`.
4. Inspect actual project files, tests, processes and uncertain side effects
   before any resumed command.
5. Reconsider the missing capability only when an official, host-authorized
   chat creation and continuation interface becomes available.

**Goal status:** externally blocked for autonomous rollover of ordinary
ChatGPT chats. Reliable manual chat handoff and bounded persistence have
been implemented and verified. No new release or tunnel restart is justified
by this finding.

## Primary sources

- [MCP 2026-07-28 Streamable HTTP](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx)
- [MCP 2026-07-28 Multi Round-Trip Requests](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/patterns/mrtr.mdx)
- [OpenAI custom MCP connections](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [OpenAI Plugins UI reference](https://developers.openai.com/plugins/reference)
- [OpenAI Plugins UI guide](https://developers.openai.com/plugins/build/chatgpt-ui)
- [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)
- [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [Dots rollout and threads](https://learn.chatgpt.com/docs/dots)

Compatible with 0.10.64.

Documentation compatible with 0.10.72.
