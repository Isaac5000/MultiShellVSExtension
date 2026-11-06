# MultiShell MCP — Skills-assisted security and performance audit

Date: **5 November 2026**. Local `main` worktree, Git reference `951337b`, with pre-existing uncommitted changes.

## Scope and method

Reviewed the project with `mcp-builder`, `systematic-debugging`, `test-driven-development`, `differential-review`, `verification-before-completion`, and `node` skills. Focus areas: file and checkpoint persistence, MCP tool registration, local authentication and packaging. The historical Git baseline does **not** contain all pending local work, and this is not a claim of exhaustive coverage across the whole repository.

New production changes were preceded by failing regression tests. No third-party skill scripts, paid inference APIs or alternative AI models were executed.

## Fixed findings

### 1. Checkpoint file replacement between inspection and read

**Severity: moderate**, contingent on a malicious or compromised local process able to alter the checkpoint directory.

Previously, `src/chat-handoff-store.ts` used `lstatSync(path)` followed by an independent `readFileSync(path)`. A file swapped in between those operations could be accepted as a trusted checkpoint if it contained matching metadata.

**Red:** `node test/test-chat-handoff-read-race.cjs` failed because substituted JSON was accepted.

**Fix:** bind the operation to a single descriptor, request `O_NOFOLLOW` where supported, check `dev/ino` and regular-file status before and after, verify metadata and size, and cap the read to 16 KiB. **Green:** swapped content is rejected; the original record remains accessible.

### 2. Unbounded full-file line replacement

**Severity: moderate** for VS Code extension-host availability.

Previously, `replace_lines_code` in `src/tools/scoped-file-tools.ts` read, split and reconstructed the entire source file. A sparse **64 MiB** file could be rewritten simply to change line one.

**Red:** `node test/test-file-edit-size-limit.cjs` failed because the oversized edit was accepted.

**Fix:** a **32 MiB** whole-file editing cap, enforced before reading the source and before publishing a replacement. Streaming ranged reads and filesystem copy remain separate, with their existing limits. **Green:** oversized edits are refused without modifying the file.

### 3. MCP safety annotations

**Contract improvement, not a confirmed vulnerability.** The tool registry now accepts explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations. Local file/checkpoint reads advertise read-only semantics; checkpoint saves explicitly advertise mutation and possible overwrites. The HTTP tools/list regression was demonstrated red before the change and green after.

### 4. Keep development skill metadata out of VSIX

The project-level `skills-lock.json` records third-party skill source hashes and remains available to developers but is excluded from the VSIX using `.vscodeignore`. Package privacy tests verify both the ignore rule and packaged contents.

## Residual risks and scope limits

- MCP commands run with the actual VS Code user's privileges, not inside an OS sandbox; retain Workspace Trust and explicit shell selection.
- Full defense against malicious concurrent ancestor renames requires OS-specific primitives (e.g. Linux `openat2`), beyond portable Node's path checks.
- Checkpoint locks are deliberately not cleared automatically after a crash; safe local intervention may be necessary.
- The tunnel-client binary, all multi-provider integrations, and every third-party skill script were **not** exhaustively audited. Imported skill instructions were read; their auxiliary scripts were not executed.
- Tool annotations describe effects to clients but **do not enforce authorization**.

## Evidence and release gate

- Targeted red/green security regressions and existing file, checkpoint and MCP HTTP tests.
- `npm audit --omit=dev --audit-level=high` reported **zero vulnerabilities** in its examined dependency set.
- `npm run lint` and `npm run bundle`: **exit code 0**.
- `node scripts/run-tests.cjs --batch=N --batches=3`: **51/51 + 50/50 + 50/50 = 151/151 test suites passed**.
- `npm run package:all`: **exit code 0**; VSIX 0.10.65 produced as a candidate; its final integrity hash is checked after packaging this report.
- `test/test-package-privacy.cjs` and `test/test-documentation.cjs` passed. `skills-lock.json` and the metered inference module are absent from VSIX.
- `git diff --check`: **exit code 0**.
- Local tunnel `/readyz` and `/healthz` both returned **HTTP 200**, without any restart.
- Installed extension is still **0.10.64**. The source candidate is 0.10.65; the new version has not been installed or live-tested after installation. Nothing has been published to GitHub.

**Release gate:** all suites pass; VSIX contents and privacy verified; tunnel health checked; installed-version behavior validated separately after an intentional manual update.

Documentation compatible with 0.10.69.