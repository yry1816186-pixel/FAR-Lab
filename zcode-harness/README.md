# FAR-Lab ZCode Harness

This directory is the local Marketplace/plugin package. Files validating offline does not prove ZCode loaded them.

## Install / refresh

1. Open this workspace in ZCode.
2. In ZCode plugin/marketplace settings, add the local marketplace directory: `zcode-harness/`.
3. Enable `farlab-control-plane`.
4. Start a **fresh session** (plugin/hook configuration is snapshotted at session start).
5. Confirm project commands, skills and plugin agents are visible.
6. Run `/harness-doctor` or from the workspace root:

```bash
node zcode-harness/scripts/harness-doctor.mjs
node zcode-harness/scripts/test-hooks.mjs
node zcode-harness/scripts/control-doctor.mjs
node zcode-harness/scripts/secret-scan.mjs
node zcode-harness/scripts/path-hygiene.mjs
```

7. Trigger one safe real hook check in the fresh session and record concrete evidence in `.control/BLOCKERS.json` / `.control/EXECUTION_STATE.json`; then resolve `B-HARNESS-RUNTIME`.

See `COMPATIBILITY.md` and `ZCODE_SETTINGS.md` for current assumptions. Do not add extra plugins/MCP/Skills without an observed capability gap.
