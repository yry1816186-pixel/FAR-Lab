---
name: far-implement
description: Implements an approved FAR-Lab feature, fix, or bounded vertical slice from a task contract, with root-cause analysis, real production-path tests, migration/rollback handling, and evidence-based completion. Use for actual development after relevant design decisions are stable.
metadata:
  project: FAR-Lab
  version: "1.0"
---
# FAR-Lab Implementation

1. Read `agent/workflows/IMPLEMENT.md`, `agent/contracts/IMPLEMENTATION_CONTRACT.md`, and the referenced task/ADR/schema.
2. Confirm the task has explicit value, scope, non-goals, invariants, and acceptance oracles; derive a minimal contract if the task is small, but do not invent foundational decisions.
3. Reproduce the baseline before editing.
4. Implement the smallest coherent vertical slice through the real application/domain path.
5. Add regression, boundary, failure, and risk-specific tests.
6. Validate affected schema/data migration, compatibility, rollback, security/privacy, platform, performance, docs, and public claims.
7. Run relevant quality gates, inspect the final diff, and report verified evidence and residual risk.

Do not push, publish, deploy, or broaden scope without explicit authorization.
