---
name: far-verify
description: Independently verifies FAR-Lab code, design, scientific claims, artifacts, migrations, security, recovery, cross-platform behavior, or release readiness using raw evidence and adversarial tests. Use for code review, design review, completion audit, red-team analysis, or validating another agent's work.
metadata:
  project: FAR-Lab
  version: "1.0"
---
# FAR-Lab Verification

Read `agent/workflows/VERIFY.md` and `agent/policies/QUALITY_GATES.md`. Ignore unsupported completion summaries and verify against requirements, invariants, production paths, and raw commands/artifacts. Seek counterexamples, bypasses, stale fixtures, failure/recovery gaps, and overclaimed support. Report exact evidence and use only PASS, FAIL, NEEDS_EVIDENCE, CONTRADICTED, or BLOCKED_EXTERNAL.
