# Agent Skills integration

[Español](../es/skills.md) · [Project index](../../README.md)

**MultiShell MCP Server 0.10.72** supports workspace Agent Skills: `SKILL.md` directories with YAML `name` and `description` metadata.

## Faster skill discovery (0.10.54)

Directory indexes reuse metadata and SHA-256 hashes only while file identity and timestamps match. Added, changed and deleted skills are detected on each request without an external cache TTL. Window/AI permissions, path containment, symlink checks and read limits remain enforced.

Skill tool responses use compact JSON. MCP `resources/read` transfers text directly as UTF-8 and keeps Base64 for binary resources. Cache bounds: 4096 paths, 2048 metadata entries/8 MiB and 8192 digests.

In a local synthetic Windows fixture of 180 skills and 360 files, nine native pages improved from ~6.99 s to ~0.87 s warm (~1.28 s cold). These figures are not cross-platform guarantees.
## Where to place skills

The **MultiShell MCP → Skills** sidebar tab browses the project owned by that window. **The path is always visible directly beneath the skill name** (long paths are visually truncated, with the full path available on hover). The copy icon sits to the right of the name. Only the **description** starts collapsed: select “Description” to expand it. Expanded details remain open while more results load and reset when the window or workspace changes. Search names or descriptions, select workspace or personal scope, and use **Show more skills** to continue (40 per page). **Copy for ChatGPT** copies an instruction containing `load_skill_code`, the exact path and the primary terminal's full identifier: paste it into a chat connected to MultiShell MCP. Duplicate names retain their paths so that you can select them explicitly.

You can browse the local catalog while the server is stopped; start it before copying the instruction. **Detect skills again** refreshes the list after skills are installed or changed. Reading requires a trusted workspace and file permissions. Personal skills respect the existing global access setting; the configuration button opens its options without granting access automatically. Internal plugin directories such as ECC are not added automatically: place skills you want to share in a supported source. If your connector caches an older schema, refresh its tools to expose `load_skill_code`.

Under the working directory of the selected shell:

```text
my-project/
└── .agents/
    └── skills/
        └── review-code/
            ├── SKILL.md
            ├── references/
            │   └── guidelines.md
            ├── scripts/
            │   └── validate.py
            └── assets/
```

The extension also discovers `.github/skills/` and `.claude/skills/` without copying folders. Each directory name must match the YAML frontmatter `name`.

```yaml
---
name: review-code
description: Review code changes and checks when asked to audit a project.
---

Read references/guidelines.md, then review changes before suggesting fixes.
```

### VS Code quick picker

Use **Ctrl+Shift+P → MultiShell MCP: List available skills** to find skills without remembering paths. In v0.10.37 the picker scans every catalog page (rather than stopping after the first 100), shows each skill's purpose and copies its **name** when unique, or its exact **`skill_path`** when names collide. It no longer scans the VS Code host process's directory when no trusted workspace folder is open.

`list_skill_names_code` now filters by **name before pagination**. For workflow searches by description, use `find_skills_code`, which still includes description matches.

## Access skills through MCP

1. Call `list_shells_code` and choose the project `shell_id`.
2. Call `list_skills_code` with that `shell_id`; inspect names, descriptions, and exact `skill_path` values.
3. Call `read_skill_code` using the same `shell_id` and returned `skill_path` to load `SKILL.md`.
4. Use `read_skill_file_code` when the skill refers to supplementary documentation, templates, or scripts, with a relative path inside that skill. Binary files can be read as base64.

Read-only MCP resources are also available: `skill://index.json` enumerates discoverable skills across connected windows, while `skill://workspace/...` addresses individual files. This index works with clients supporting the corresponding discovery format; not all clients implement it.

Discovery happens on demand; adding or editing a project skill needs no extension restart. This capability requires the **file** permission in `multi-shell-mcp.enabledTools` and a trusted VS Code workspace.

## Official MCP Skills protocol (2026-07-28)

Since v0.10.31, the server advertises `io.modelcontextprotocol/skills` through `server/discover` when the client uses the modern MCP revision. Clients can call `skills/list` to discover skills, `skills/get` to retrieve one skill entry, and `resources/read` to read its files.

Each entry contains the complete YAML frontmatter and a complete file manifest with **SHA-256 digests and raw byte sizes**. Same-named skills across different VS Code windows retain separate URIs; none silently shadows another. Listings support pagination. The server declares `directoryRead: false`, so `resources/directory/read` is not enabled or advertised.

Legacy MCP clients retain `list_skills_code`, `read_skill_code`, and `read_skill_file_code`. Modern tool registration reuses the same shell ownership and permission guards.

## Installable ChatGPT and Codex plugin

The portable plugin lives at `plugins/multishell-mcp/`, with `plugin.json`, `mcp.json`, and `setup` and `multishell-mcp` skills. Its repo-local marketplace is `.agents/plugins/marketplace.json` (`multishell-local`).

Run `npm run package` to build one VSIX with the verified official tunnel for this OS. Run `npm run package:all` if you also want the optional plugin ZIP. On Windows x64 this produces `multi-shell-mcp-server-0.10.72-win32-x64.vsix` and (when requested) `multi-shell-mcp-plugin-0.10.72.zip`. Install the local plugin from the repo marketplace on a supported client and approve the installation. Building does not install it automatically.

**Important:** the bundled `mcp.json` points to `http://127.0.0.1:3000/mcp`, which is reachable only on the same computer at the default port. Cloud-hosted ChatGPT Work needs a separately registered, secure MCP tunnel connection. Do not expose the local unauthenticated server to the public internet. The plugin packages skills but grants no additional permissions.

## Native Codex and ChatGPT usage

- **Local Codex:** can discover repository skills in `.agents/skills/` natively without using MCP. This repository provides `.agents/skills/multishell-mcp/SKILL.md` as an example of safe MultiShell workflows.
- **ChatGPT with the MCP connector:** can discover and read workspace skills through the new MCP tools. This does not automatically install them as native ChatGPT skills.
- **Plugin distribution:** installable skills in a product skill picker require the appropriate plugin packaging. Merely connecting an MCP server does not register native client skills.

## Global Codex skills (0.10.32)

MultiShell can read the signed-in OS user's existing skills **in place**, without copying them into each workspace. Supported sources are `~/.agents/skills/` (personal), `~/.codex/skills/` (legacy-compatible), and `~/.codex/skills/.system/` (file-backed system skills). Installation-directory links are only accepted when their targets remain within the authorized user home directory. Links inside the selected skill are rejected; global approval does not authorize reading unrelated home files.

The `multi-shell-mcp.globalCodexSkills` setting is **off by default**. Enable it in VS Code Settings or open the Command Palette action **MultiShell MCP: List available skills** and approve the global access prompt. File reading permission (`multi-shell-mcp.enabledTools.file=true`) is also required. Enabling this setting permits connected MCP clients, including remote-tunnel clients, to read your global skill files. Scripts are never run automatically.

There are three easy ways to list **names only**:

1. Use **MultiShell MCP: List available skills** from the VS Code Command Palette. Search by name and select to copy it.
2. Use `list_skill_names_code(shell_id="fallouttraduccion",scope="all")` in a refreshed ChatGPT MCP connector. Use `scope="global"` for global-only or `query="graph"` to filter names.
3. With an older cached ChatGPT tool schema, use `execute_shell_command_code(command="skills fallouttraduccion global",cwd="@mcp")`. This is a read-only control query; it does not execute a terminal command. Omitting `global` lists all available skills.

Results include alphabetized unique `names` and separate `entries` carrying `scope`, `source`, and exact `skill_path` where names collide. Use the returned `skill_path` when opening a specific skill. Treat external skill text as untrusted instructions.

## Independent windows and machines (0.10.33)

Each skill request selects an explicit `shell_id`. MultiShell forwards skill reads to the **worker that owns that terminal**, where the owning VS Code window enforces its own permissions and filesystem roots. Window and terminal discovery include a local-installation `machine_id` alongside `window_id`. This is an installation identifier, not a hardware fingerprint.

Two windows may provide different skills bearing the same name. Their `skill://workspace/...` URIs remain separate, and name matching never silently discards one. If a worker goes offline, requests fail rather than falling back to the hub machine's files. Global skills belong to the worker machine's OS user and are only exposed when both hub and worker permit global reads.

**Current boundary:** internal worker networking uses local loopback (`127.0.0.1`). Two computers do not automatically share one MultiShell hub. To use several computers from ChatGPT, configure **one secure MCP connection per machine** and explicitly select the server, window and shell. Never expose the unauthenticated local port on a public interface. Federating workers over the network would require an authenticated, encrypted bridge.

## Read and discovery improvements (0.10.34)

Modern `skills/list` hashes only the current page, with at most twenty manifest attempts. An invalid cursor does no manifest hashing. Unavailable skills can produce a shorter page; follow `nextCursor` whenever present. Each returned manifest remains complete.

Terminals sharing the exact same root in one window share discovery. Different roots, windows, and machines remain separate. Reads reject files that change during access, and a changed `SKILL.md` cannot be advertised with its previous metadata.

The bundled workflow distinguishes metadata discovery, selective reference loading, and host-side activation with digest verification. Reading skill text through a tool does not install or activate a native skill by itself. Legacy `@shell:` selectors and `@mcp` controls are also adapted when a connector uses the modern protocol, while preserving routing-header validation and read permissions.

## Remaining boundaries

Catalogs return up to 100 entries per page, with filtering before the limit and cursor continuation. Skills supplied by installed plugins, including ECC's plugin cache, are not an additional automatic source. Support should use an explicit source selector and consent rather than scanning arbitrary cache files.

Filesystem reads are still synchronous, although allocations, file counts, and per-page manifest work are bounded. Async reads are a further improvement for slow or network-mounted directories. Native client activation, remote tunnel behavior, and Linux operation require their own validation.

## Security and limits

Skills are **read, never automatically executed**. Bundled `scripts/` or an `allowed-tools` frontmatter field grant no additional permissions. Running scripts remains a separate reviewed action; use `execute_isolated_command_code` only for appropriate noninteractive tasks.

File reads stay inside the selected skill and its authorized project or global source. Absolute paths, `..` traversal, and internal links are rejected. User-global skills are not automatically exposed. Catalog pages are capped at 100 skills, `SKILL.md` at 128 KiB, supporting files at 16 MiB, and modern manifests at 512 files and 16 MiB total. Reads remain bounded even when a file grows during the request.

Skill text is untrusted project content and must not override user approvals or MCP permissions.

[Back to MCP compatibility](compatibility.md) · [Testing and validation](validation.md)

## Simple MCP workflow (0.10.35)

1. Select the project `shell_id` using `list_shells_code`.
2. Call `find_skills_code(shell_id="my-project", query="build")` to search project skill names and descriptions. Results include ready-to-use `load_arguments`.
3. Pass those arguments to `load_skill_code`, or provide an exact name such as `skill="code-review"`. Ambiguous names return candidates for explicit path selection.
4. Read selected references with `read_skill_file_code` using the returned `next.arguments`.

Filtering happens before the response limit. Use `cursor` and `limit` for larger catalogs; continue with `next_cursor` and the same query/scope. Existing tools remain available. Each scan examines at most 4096 entries and warns when that limit is reached. Catalogs can change between pages; avoid editing the catalog while traversing it for a consistent result.

New tools default to `project`. Personal skills require explicit `scope="global"` or `all` and local global-access permission, which is never enabled automatically. Loading instructions does not run them or install a native client skill. ECC plugin sources still require explicit integration; this release does not broaden their permissions.

Documentation compatible with 0.10.58.


Current installers: multi-shell-mcp-server-0.10.67.vsix y multi-shell-mcp-plugin-0.10.67.zip

## Preferred skills (0.10.72)

In MultiShell MCP > Skills, select the star beside a skill to make it preferred. Exact paths are saved in VS Code workspace state (at most 24), without copying SKILL.md or opening a terminal. Favorites appear first, even when they previously belonged to later pages. Click the star again to remove the preference.

Personal skills can be preferred globally only when multi-shell-mcp.globalCodexSkills was already explicitly enabled. The star never enables this permission. MCP discovery tools identify favorites and modern skills/list ranks them first without changing its standard schema; ChatGPT still controls whether instructions are read. Preferences are independent per workspace and store paths only.
