# Continue a ChatGPT task across conversations

**MultiShell MCP 0.10.64:** chat-native progress save and restore through MCP. No Codex, local model or metered inference API is involved.

## Supported workflow

ChatGPT uses the existing MultiShell MCP tools and periodically calls `chat_handoff_save_code` after meaningful milestones. The server persists a bounded, structured snapshot (not the full chat) on the local machine. When the user opens another ChatGPT chat inside the same Project, ChatGPT can call `chat_handoff_load_code` and inspect the real project state before resuming.

The checkpoint holds the objective, acceptance criteria, concise summary, completed and remaining steps, artifacts, risks, next safe action and status. A unique handoff ID and monotonic revision prevent accidental stale overwrites. Recovery requires an exact shell ID in the same machine/workspace; after VS Code reload, call `list_shells_code` again to find the current exact shell.

### First conversation

Ask ChatGPT to save verified progress using `chat_handoff_save_code` after milestones and before context is exhausted. Keep the returned `handoffId` and next-chat prompt. Never store secrets, passwords, token values or verbatim transcripts.

### New conversation

Open another chat in the same ChatGPT Project and ask:

> Continue the MultiShell MCP project task from the last checkpoint. Use `list_shells_code` to identify the exact project shell and `chat_handoff_load_code` to recover the latest checkpoint. Verify the actual working tree, tests, and command outcomes before performing any edits. Do not replay uncertain side effects.

If multiple unfinished tasks exist, automatic latest-checkpoint selection is refused: use `chat_handoff_list_code` and choose the exact `handoffId`. Completed-only records are not automatically resumed. You may supply a specific `handoffId` to retrieve an older goal. Subsequent saves of the same goal require `expected_revision`.

## Not available

**An MCP server cannot initiate another ChatGPT turn or create another ChatGPT web chat by itself.** OpenAI's Apps SDK `sendFollowUpMessage` allows a rendered **widget** to request a follow-up in the **current conversation**. It does not document creating a new chat or an unlimited automated sequence. ChatGPT Work supports longer tasks but does not guarantee automatic rollover of regular chats. The user must still create the next chat; a checkpoint makes that transition recoverable.

See the [official feasibility review](chatgpt-autonomous-continuation-feasibility.md).

The MCP server also cannot read the ChatGPT chat's remaining context tokens. Save after milestones rather than relying on a last-second handoff.

## Security and storage

Read access follows MCP file permissions; saving checkpoints additionally requires file-edit permission. Remote deletion is not exposed as an MCP tool. Data stays in a bounded per-user state directory outside the source repository. Maximum 24 handoffs, each limited to 16 KiB. Workspace/machine fingerprints and revision checks prevent unrelated projects or stale messages from overwriting records. Checkpoints do not grant tool execution permissions. Remote MCP deletion is disabled: a model-supplied `human_confirmed=true` flag is not real human consent. Existing checkpoints require explicit local maintenance to remove; nothing is silently deleted. No model inference or metered API is invoked by these tools.

After VS Code reload, call `list_shells_code` and choose the **current exact shell**; do not reuse an old shell ID from a saved prompt. The handoff ID remains stable. A cross-process capacity lock prevents simultaneous saves from exceeding the checkpoint quota.

Documentation compatible with 0.10.72.
