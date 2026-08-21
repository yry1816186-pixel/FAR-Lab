---
description: Run the anti-fake-completion gate — verify .control/ACCEPTANCE_STATUS.json (items at target status with evidence, gates satisfied, no critical blocker) before ANY completion claim.
---

Run from the Workspace root:

```bash
node zcode-harness/scripts/completion-gate.mjs
```

Interpretation:

- `VERIFIED_READY` (exit 0): all critical items reached target status with non-empty evidence, all gates satisfied, no critical blocker. Only then may completion be claimed — and still only together with an independent adversarial audit.
- `NOT_READY` (exit 1): do NOT declare completion. Read `missing`/`failed`/`errors`; either do the remaining work or truthfully set items to `blocked`/`failed` with reasons in `.control/BLOCKERS.json` and continue the highest-value repair path.

Rules:

- Update `.control/ACCEPTANCE_STATUS.json` only with real evidence (command + exit code + key output, or audit report path). Empty-evidence status upgrades are gate violations.
- Status vocabulary is fixed: `not_started / implemented / integrated / tested / live_verified / blocked / failed`. Never use "basically done".
- The gate is a complement, not a substitute, for the independent `adversarial-auditor` review of the actual surface.
