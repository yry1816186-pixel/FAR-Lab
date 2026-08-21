---
name: verification-audit
description: Use for acceptance, release-readiness, completion, adversarial or disputed claims. Match claims to real evidence, test relevant failure paths and reject fake completion.
when_to_use: Verification, audit, release, completion, regression, benchmark, security/reliability review, or disputed evidence.
metadata:
  version: "1.0.0"
---

# Verification and Adversarial Audit

1. Enumerate explicit acceptance obligations and the strongest claim being made.
2. For each obligation map:

`Requirement -> Implementation -> Verification method -> Evidence -> Status`

3. Match proof strength to the claim. Use the real path whenever feasible; mocks/fixtures prove only the simulated surface.
4. Exercise at least one relevant failure/edge path for behavior changes when practical.
5. Use project-native checks plus scientific/domain validation where applicable.
6. Inspect for fake progress: disconnected UI, unused abstraction, TODO/placeholder, mock substitution, silent fallback, skipped tests, weak baselines, hard-coded success, documentation ahead of reality, unmeasured performance, unreproducible claims.
7. Check architecture ownership, security/trust, recovery, compatibility, installation, cross-platform surfaces and user workflow proportional to the claim.
8. For mission-level completion use an auditor that did not materially author the surface. The auditor should try to reject the Builder's claim.
9. If evidence is incomplete, report `IMPLEMENTED, NOT FULLY VERIFIED`, `UNKNOWN`, `BLOCKED`, or `FAILED` rather than “done”.
