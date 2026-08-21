---
name: oss-due-diligence
description: Use for consequential third-party/OSS adoption, adaptation, fork, vendor, extraction or rejection. Inspect source/license/security/maintenance/fit before reuse.
when_to_use: Any consequential third-party technology selection or source fusion decision.
metadata:
  version: "1.0.0"
---

# OSS / Tool Due Diligence

## Funnel

### A — discovery
Verify exact source, capability, current relevant version/commit, license, maintenance signals, high-level fit, obvious disqualifiers.

### B — source/ecosystem inspection
Inspect relevant implementation, architecture, API/protocol boundaries, issues/releases, compatibility, extension model, security posture, dependency/supply-chain risk and failure history.

### C — execution
Only for serious candidates capable of changing the decision: install/clone safely in isolation, exercise the relevant workload, inspect the real implementation path, observe failures, and measure material behavior.

### D — comparative/integration proof
For finalists, compare with strongest alternatives and internal BUILD. Prototype the real integration boundary where uncertainty is architectural.

## Decision vocabulary
`ADOPT / ADAPT / FORK / VENDOR / EXTRACT / REIMPLEMENT / BUILD / REPLACE / REJECT / DEFER`

Every material choice states:

- source/version/license;
- exact capability reused;
- decisive evidence;
- strongest alternative;
- architecture/security/maintenance costs;
- integration boundary;
- remaining uncertainty;
- reversal trigger.

For BUILD, explain why the strongest mature alternatives fail the actual requirement. Do not clone many repositories and decide later.
