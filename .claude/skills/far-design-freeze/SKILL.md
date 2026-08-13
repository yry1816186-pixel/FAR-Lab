---
name: far-design-freeze
description: Reconstructs and freezes FAR-Lab product, scientific, architecture, data, UX, security, platform, testing, release, and lifecycle design from repository facts and evidence. Use for foundational redesign, full-project governance, design SSOT reconstruction, or when major assumptions must be reopened before implementation.
compatibility: Requires repository read/write tools, Git, tests/build tools, and network access when external research is authorized.
metadata:
  project: FAR-Lab
  version: "1.0"
---
# FAR-Lab Design Freeze

1. Read `agent/workflows/DESIGN_FREEZE.md`.
2. Read and execute the applicable parts of `agent/contracts/DESIGN_PRIME.md`; this is the full task contract.
3. Establish a real repository/Git/environment baseline before design claims.
4. Keep current facts, target design, hypotheses, unknowns, and migration separate.
5. Research only decision-linked questions, including counterevidence and simpler baselines.
6. Use minimal spikes to close high-risk uncertainty; do not expand into broad production implementation before the freeze gate.
7. Deliver a self-contained design SSOT, machine-readable traceability, review evidence, freeze status, and implementation contracts.

User arguments define scope and constraints but do not weaken truth, safety, evidence, or authorization rules.
