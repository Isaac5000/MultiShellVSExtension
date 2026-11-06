# MultiShell MCP 0.10.66 integrated install validation

**Date:** 5 November 2026. **Unchanged branch:** `main`; previous HEAD `951337b`. Existing uncommitted local work remains untouched.

## Method

Used the local `systematic-debugging`, `verification-before-completion`, `test-driven-development`, `differential-review`, `mcp-builder`, and `node` skill instructions. Tests were reproducible and integrity-based. No new branch, installed extension replacement, tunnel stop or restart was performed.

Reusable read-only diagnostic:

```powershell
node test/manual-integrated-install.cjs
# Functional native executable check using a throwaway synthetic profile:
node test/manual-integrated-native-init.cjs
```

It inspects the actually installed extension, native binary hashes, tunnel health and MCP tools. It does not invoke shell execution or write tools over MCP.

## Recorded results

| Verification | Result |
| --- | --- |
| Actually installed extension | `local-multishell.multi-shell-mcp-server@0.10.66` |
| Installed JS bundle vs local build | Identical SHA-256 |
| Embedded official tunnel | `0.0.19`, `--version` exit 0 |
| Native `init` with synthetic data | Passed: isolated temporary profile created and removed, no tunnel started |
| Tunnel and cloudflared hashes | Match `verified.json` |
| Live MCP tools | 32 |
| Exact project shell discovery | Pass |
| Live project `find-skills` listing and loading | Pass |
| `chat_handoff_list_code` | Pass, read-only |
| Tunnel `/readyz` and `/healthz` | HTTP 200 / HTTP 200 |
| Windows x64 target VSIX archive | Verified |
| Tunnel adoption / lifecycle tests | Pass |
| TypeScript bundle and ESLint | Exit code 0 |
| Entire `scripts/run-tests.cjs` suite | **154/154** (52 + 51 + 51) |
| `npm audit --omit=dev --audit-level=high` | 0 reported vulnerabilities |
| `git diff --check` | Exit code 0 |

## Critical distinction: embedded vs running

**The integrated VSIX contains verified native binaries**, but the running tunnel process on this computer still uses the previously verified `globalStorage` executable. Exactly **one running tunnel process** was observed. This is intentional, allowing safe adoption of a previously running process rather than changing its executable identity during an upgrade.

Consequently, this is **not** proof that the active process was launched from the embedded executable. A true first-run test from the embedded path remains necessary on a fresh installation, or after a user-authorized safe transition. The live tunnel was not disturbed.

## Limits and residual risk

- Windows x64 validation does not establish Linux/macOS behavior; macOS additionally needs Gatekeeper/notarization checks.
- An end-to-end tunneled connection from the **embedded executable path** with live credentials was not exercised.
- Automated tests mix unit, mock and integration checks. The new manual diagnostic checks the installed MCP server and original native binaries, but does not establish perfect reliability.
- No historical global-storage tunnel or user data was removed.
- `npm audit` covers published dependency metadata; it is not an audit of third-party native binaries.

**Conclusion:** no regression was found in the exercised paths. Stay on `main` and keep source version `0.10.66`; do not create a release just to record this validation.

**Later note (0.10.67):** this report retains the historical 0.10.66 observations. Version 0.10.67 changes autostart executable preference and adds a dedicated regression test without changing these measurements.

**Documentation update (0.10.68):** this report remains historical; verified cross-version recovery is documented in [Embedded tunnel](embedded-tunnel.md).

**Later distribution update (0.10.69):** the 0.10.66 measurements remain historical; new builds produce only the integrated native VSIX.

**Later update (0.10.70):** this report retains its historical measurements. Fresh launches now require the verified bundled client; runtime downloading has been removed.

**Documentation update (0.10.71):** skill preferences do not change the tunnel; this report retains earlier installation measurements.
**0.10.72 note:** this historical report predates safe retention and cleanup tests.
