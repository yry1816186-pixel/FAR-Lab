---
description: Run the deterministic FAR-Lab workspace guardrails that actually exist, repair structural/secret/path/control errors, and distinguish deterministic hygiene from semantic/scientific verification.
---

From the Workspace root, inspect and run the project's real guardrail scripts if present, especially secret scanning, path hygiene, control-schema validation and Harness/plugin doctors. Do not invent command names: inspect the available scripts/package commands first.

Treat as blocking until repaired:

- exposed secrets/private keys/real credential files;
- malformed canonical control state;
- production fixture/demo/mock leakage that misrepresents live capability;
- path/repository hygiene that risks publishing runtime/cache/private artifacts;
- broken plugin/hook/Harness structure needed by the mission.

The plugin's PreToolUse hook is defense-in-depth only; it does not replace ZCode permissions, Git recovery, sandboxing or project security controls.

Passing deterministic guardrails does not prove scientific quality, production behavior, release readiness or frontier completion.
