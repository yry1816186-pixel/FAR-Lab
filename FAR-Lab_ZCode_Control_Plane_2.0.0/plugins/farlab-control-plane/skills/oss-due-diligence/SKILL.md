---
name: oss-due-diligence
description: Use for consequential third-party/OSS adoption, adaptation, fork, vendor, extraction, replacement or rejection in FAR-Lab. Evaluate exact source/version/license, source architecture, maintenance, security, supply chain, execution behavior and integration fit before reuse; escalate effort only for candidates capable of changing the decision.
when_to_use: Any consequential third-party technology, scientific library, agent framework, tool suite, Skill/plugin/MCP/protocol, database/runtime, UI system or source-fusion decision.
metadata:
  version: "2.0.0"
---

# OSS / Tool Due Diligence

## Funnel

### A — discovery screen
Verify exact project/source, relevant capability, current release/commit when material, license, maintenance signals, high-level architecture fit and obvious disqualifiers.

### B — source/ecosystem inspection
For serious candidates inspect relevant implementation, architecture, API/protocol boundaries, issues/releases, compatibility, extension model, security posture, install scripts/binaries, transitive dependencies, network behavior and failure history.

### C — execution
Only for candidates capable of changing architecture: safely isolate clone/install, exercise the relevant workload, inspect the real implementation path, observe failures and measure material behavior. README claims are not execution evidence.

### D — comparative/fusion proof
For finalists compare against the current system, strongest alternatives and internal BUILD using mission-relevant workloads. Prototype the integration boundary when uncertainty is architectural.

## Decision vocabulary

`KEEP / ADOPT / ADAPT / FORK / VENDOR / EXTRACT / REBASE / BUILD / REPLACE / DELETE / REJECT / DEFER`

Every material choice states source/version/license, exact capability, decisive evidence, strongest alternative, integration/security/maintenance cost, remaining uncertainty and reversal trigger.

For `BUILD`, explain why the strongest mature alternatives do not satisfy the actual requirement. Do not clone many projects and postpone the decision indefinitely.
