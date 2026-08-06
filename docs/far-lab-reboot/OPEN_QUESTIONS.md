---
status: reviewed
owner_role: audit-and-product-council
last_verified: 2026-08-05
scope: decision-critical unknowns, missing evidence, conservative defaults, owners, and deadlines
authoritative_for: [open question status]
evidence_level: mixed
related_decisions: [DEC-001, DEC-003, DEC-005, DEC-006, DEC-007, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-PROD-001, REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot audit — open questions and risk assumptions

| ID | Type | Question / assumption | Why it matters | Current default | Required evidence / owner | Decision point |
|---|---|---|---|---|---|---|
| OQ-001 | UNKNOWN | Which snapshot is the intended competition submission: HEAD, staged index, or full dirty worktree? | Findings and test claims may not describe one version. | Audit the full observed worktree and pin every claim to the initial snapshot. | Repository owner identifies immutable candidate commit. | Before release gate |
| OQ-002 | BLOCKER | Can a clean Linux environment run full tests/demo without altering this workspace? | Runtime baseline is unavailable in WSL due native artifacts. | Mark runtime results UNKNOWN; use existing test assertions as lower-strength evidence. | Isolated CI artifact or authorized clean clone run. | Before CONTINUE without conditions |
| OQ-003 | UNKNOWN | Does any external user or scientific reviewer rely on FAR-Lab today? | Adoption/value cannot be inferred from code volume. | Treat demand and willingness-to-adopt as hypotheses. | Interviews, usage telemetry, external pilot records. | Strategy gate |
| OQ-004 | HIGH-RISK ASSUMPTION | Deterministic verdict rules are scientifically valid across 28 domains. | A deterministic kernel can reproducibly encode a wrong policy. | Restrict claim to mechanical rule execution, not scientific truth. | Domain-specific validation, calibration, error analysis, independent expert review. | Scientific release gate |
| OQ-005 | HIGH-RISK ASSUMPTION | `.far-proof` proves independent recomputability rather than internal consistency only. | Product thesis depends on third-party trust. | State tamper-evidence and replay boundaries separately. | Clean-room verifier, independent implementation, threat analysis. | Product claim gate |
| OQ-006 | UNKNOWN | Who owns appeals, corrections, rule updates and incident response? | A high-stakes verification product requires procedural accountability. | Human decision remains outside automatic verdict. | Named roles/RACI and operating evidence. | Product closure |
| OQ-007 | UNKNOWN | Which data classes and jurisdictions are in scope? | Determines privacy/security/legal design. | Design for non-sensitive research metadata first; deny clinical/person-level claims by default. | Data inventory, intended markets, legal review. | S8 |
| OQ-008 | UNKNOWN | Is the agent runtime a product capability or internal implementation mechanism? | Avoids turning FAR-Lab into an unfocused generic agent. | Keep agents subordinate to evidence workflows. | User tests and architecture trace. | S4/S7 |
| OQ-009 | EVIDENCE GAP | Where is the manifest-listed v3 package README? | Loading instructions/package integrity are incomplete. | Continue from matched master/modules/templates. | Correct file supplied or manifest corrected. | S0 package audit |
| OQ-010 | CRITICAL UNKNOWN | What is the intended run/case isolation model? | Current report and latest-record queries are global; concurrent work may cross-associate evidence. | Single-process, one active local run only. | Schema/transaction design plus multi-run concurrency evidence. | Before any shared API |
| OQ-011 | CRITICAL UNKNOWN | Which FEC requirements are actually enforced against an executed dataset/workflow? | Nonempty source strings and placeholder hashes can currently support machine verdict paths. | Treat output as policy-engine prototype only. | End-to-end immutable dataset/workflow/deviation binding. | Scientific Gate 3 |
| OQ-012 | CRITICAL UNKNOWN | Is any OS/container/network sandbox guaranteed around science code? | Source-level sandbox explicitly does not enforce egress/CPU/memory. | Treat code as trusted-user local execution only. | Deployment-specific isolation test and attestation. | Before untrusted execution |
| OQ-013 | UNKNOWN | Which interface pages are intended product surfaces versus staged competition WIP? | Hero/Wizard/scheduler are staged or untracked and overstate proof behavior. | Exclude showcase pages from target authority. | Owner identifies immutable release candidate and scope. | UX freeze |
| OQ-014 | UNKNOWN | Does a live release/image exist and which artifact is authoritative? | Tags, release prose, versions and local release manifests conflict. | No release/installation claim. | Primary GitHub release registry plus verified artifacts. | Release Gate 6 |
| OQ-015 | SPECIFICATION BLOCKER | Which exact `canonicalizationAlgorithmId` and preprocessing boundary governs Unicode, decimals/large integers, `-0`, paths, sets and RDF projection? | JCS and NFC normalization cannot be combined implicitly; roots may split across implementations. | Reject ambiguous inputs/algorithm contract; no V2 freeze. | SPEC-003, cross-language hostile vectors and protocol approval. | G2 |
| OQ-016 | SPECIFICATION BLOCKER | Which outputs use N0/N1/N2/N3/N4, and what exact randomness/environment/comparison rule applies? | A global tolerance or seed can hide a decision-changing divergence. | `executionReproduction=NOT_RUN/UNAVAILABLE`; no reproduction claim. | SPEC-004, science owner, cross-runner vectors and prospective study. | G2/G5 |
| OQ-017 | SPECIFICATION BLOCKER | Which receipt fields may expose public digests/metadata, require restricted/withheld/commitment treatment, or enter a transparency log? | Hidden low-entropy facts may be guessed or correlated permanently. | Withhold sensitive digest/metadata and public log; local restricted exchange only. | SPEC-005, DPIA/legal review and dictionary/linkability attack. | G2/G5 |
| OQ-018 | UNKNOWN | What preservation horizon and trust/time/algorithm renewal policy is actually supportable? | “Forever verifiable” creates unstaffed archive/key/schema/reference obligations. | No timeless claim; report current/historical evidence gaps. | SPEC-006/008/010, archival owner, air-gapped recovery and funded plan. | G5/G6 |
| OQ-019 | SPECIFICATION BLOCKER | Who approves and maintains the domain schemas, TCK, clean-room verifier independence and dispute resolution when implementations disagree? | An executable producer library or majority vote can become an unreviewed de facto standard. | Freeze affected protocol; no conformance/independence badge. | SPEC-001/008/009, two maintainers and governance charter. | G2/G3 |
| OQ-020 | EVIDENCE GAP | Which exact open-source comparator/task/version and non-inferiority/superiority margin matter to target users? | “World-class” without a scoped estimand invites feature-checklist theater. | Overall comparative claim prohibited. | SPEC-012 and doc 18 independent benchmark/power analysis. | G6/claim gate |
