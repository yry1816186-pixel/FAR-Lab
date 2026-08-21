---
name: verification-audit
description: Use for FAR-Lab acceptance, release-readiness, completion, adversarial review, regression, benchmark, security/reliability review or disputed claims. Map every important claim to real evidence, test relevant failure paths, reject fake completion, and distinguish acceptance-floor readiness from frontier mission completion.
when_to_use: Verification, audit, release, completion, milestone gates, benchmarks, recovery/security checks, reproducibility proof, or any claim stronger than currently demonstrated evidence.
metadata:
  version: "2.0.0"
---

# Verification and Adversarial Audit

1. Enumerate the explicit obligations and the strongest claim being made.
2. Map `Requirement -> Implementation -> Verification method -> Evidence -> Status`.
3. Match proof strength to the claim. Mocks/fixtures/replays prove only their simulated surface unless the claim explicitly concerns them.
4. Exercise a meaningful failure/edge path for changed behavior when practical.
5. Use project-native checks plus scientific/domain validation proportional to the claim.
6. Search for fake progress: disconnected UI, unused abstractions, TODO/placeholders, mock substitution, silent fallback, skipped tests, weak baselines, hard-coded success, documentation ahead of reality, unmeasured performance and irreproducible claims.
7. Check architecture ownership, trust/security, failure/recovery, migration/compatibility, installation, cross-platform and user workflow where material.
8. For mission-level claims use a reviewer that did not materially author the audited surface and instruct it to try to reject the claim.
9. Treat `/completion-gate` as the acceptance floor. Mission completion additionally requires independent audit and the frontier/saturation gate when the current mission contract requires it.
10. If proof is incomplete, report the truthful lower state: `IMPLEMENTED, NOT FULLY VERIFIED`, `UNKNOWN`, `BLOCKED` or `FAILED`.
