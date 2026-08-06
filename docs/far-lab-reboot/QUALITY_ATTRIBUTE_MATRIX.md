---
status: reviewed
owner_role: quality-engineering-lead
last_verified: 2026-08-05
scope: target user-journey quality attributes, metrics, tests, blocking thresholds, and monitoring
authoritative_for: [quality attribute inventory]
evidence_level: D
related_decisions: [DEC-007, DEC-010]
related_requirements: [REQ-QUAL-001, REQ-QUAL-007, REQ-QUAL-008, REQ-SCI-003, REQ-OPS-003, REQ-OPS-004]
supersedes: []
superseded_by: null
---

# Quality attribute matrix

Status: `TARGETS / UNVALIDATED`. Targets are release requirements, not current measurements. Authority: `14_QUALITY_EVALUATION_AND_RELEASE.md`.

| ID | Journey | Target | Metric / measurement | Blocking threshold | Verification | Monitoring | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| QA-01 | Compile receipt | Deterministic canonical payload | SHA-256 equality over repeated builds on supported OS/runtime matrix | Any unexplained canonical mismatch | Property + cross-platform integration | Per release | Trust kernel | BLOCKED |
| QA-02 | Independent verify | Complete fail-closed integrity | Seeded tamper/downgrade detection rate | <100% on required-member corpus | Independent implementation + mutation corpus | Per release | Verification | BLOCKED |
| QA-03 | Concurrent runs | No cross-association | Tenant/run isolation violations | Any violation | Parallel API/storage E2E | Continuous canary after deployment | Platform | BLOCKED |
| QA-04 | Untrusted execution | Bounded blast radius | Escape, egress, CPU/memory/process ceiling violations | Any critical escape or secret access | Adversarial sandbox suite | Denial/egress telemetry | Security | BLOCKED |
| QA-05 | Scientific review | Calibrated abstention | OOD/incomplete correct-abstention rate with 95% CI | Point estimate <95% or undisclosed CI | Locked negative/OOD set | Per profile/version | Science lead | BLOCKED |
| QA-06 | Scientific review | Avoid false confirmation | Critical false confirmations and upper confidence bound | Any critical case; insufficient sample remains blocked | Expert-adjudicated holdout | Per profile/version | Independent science reviewers | BLOCKED |
| QA-07 | Challenge/correction | Complete procedural closure | Challenge-to-ack, supersession linkage, affected-user notification | Missing audit/link/notification in any P0 scenario | E2E scenario suite | Weekly queue-age alert | Product + governance | DESIGNED |
| QA-08 | Web review | Accessible core loop | WCAG 2.2 AA automated/manual findings; keyboard and screen-reader critical-task completion | Any critical/serious blocker or any failure in the preregistered critical-task release set; population estimates reported separately | axe + manual AT matrix + disabled-user tasks | Per release | Experience | DESIGNED |
| QA-09 | CLI automation | Stable machine contract | JSON schema conformance, exit-code accuracy, stdout purity | Any false zero exit or non-schema stdout | Golden/contract tests | Per release | CLI | BLOCKED |
| QA-10 | API task lifecycle | Safe async control | cancel/resume/idempotency/event ordering success | Any double effect, stale terminal transition, or auth bypass | Contract + chaos tests | SLO/event-lag dashboards | API/platform | DESIGNED |
| QA-11 | Install/upgrade | Reproducible, immutable distribution | clean install success; artifact/checksum/attestation verification | <100% supported matrix or mutable source | Hermetic installer tests + two-party rebuild | Release job | Release engineering | BLOCKED |
| QA-12 | Recovery | Proven RPO/RTO | restore success, data loss window, service restoration time | Missing quarterly drill; targets not met | Restore and regional-loss exercise | Backup age/restore probes | SRE | BLOCKED |
| QA-13 | Privacy rights | Complete deletion/export | request completion and legal-hold correctness | Any undeclared replica/log retention | Data-map E2E + evidence audit | Rights-request dashboard | Privacy | BLOCKED |
| QA-14 | Maintainability | Bounded change blast radius | trace coverage, mutation score trend, cyclomatic hotspots, owner coverage | Trust change lacks tests/owner/ADR | Static + review gates | Monthly | Engineering governance | PARTIAL |
| QA-15 | Cost | Predictable local workflow | p50/p95 per completed review; budget-stop accuracy | Unbounded task or silent over-budget execution | Fixed-budget benchmark | Per-run budget telemetry | Product/platform | DESIGNED |
| QA-16 | Observability | End-to-end trace without sensitive leakage | correlated run/task/event/receipt IDs; secret/PII scan | Missing critical span or secret exposure | Trace contract + privacy scan | Continuous | SRE/security | DESIGNED |
| QA-17 | Cross-runner replay | Unambiguous numerical/randomness equivalence | N0–N4 decision/reason agreement and threshold-crossing disclosure | Any independent implementation disagreement or silent numeric/science conflation | Numeric/randomness TCK + differential runner study | Per numeric/science profile | Science/protocol | BLOCKED |
| QA-18 | Selective disclosure | Hidden values are not guessable/linkable by default | disclosure derivation completeness; dictionary/correlation attack success | Wrong source/root claim, unauthorized opening or public confirmation of protected fixture value | Disclosure/commitment hostile corpus + privacy review | Per `disclosureProfile` | Privacy/trust | BLOCKED |
| QA-19 | Long-term verify | Historical/current/renewal interpretation remains available offline | archive dependency completeness and time/crypto decision agreement | Missing semantic/trust dependency, downgrade or rewritten historical root | Isolated archive recovery + crypto renewal corpus | Per crypto/profile change | Archive/security | BLOCKED |
| QA-20 | Protocol conformance | Producer-independent interoperable V2 | normative-clause/vector coverage; clean-room verifier agreement; shared-dependency disclosure | Any critical clause untested, canonical disagreement or producer-core dependency | Public/sealed TCK, differential fuzz and independent report | Per protocol release | Protocol/independent verifier | BLOCKED |
| QA-21 | First safe value | Candidate teaches bounded semantics and preserves data through lifecycle | clean install/doctor/verify time, setup failure, critical comprehension, upgrade/uninstall data result | Mutable artifact, unsupported hidden prerequisite, lost receipt or any critical truth/certification inference in release set | Clean-machine and user study from candidate docs | Per platform/release | UX/docs/release | BLOCKED |
| QA-22 | Comparative claim | Scoped parity/superiority is statistically supported | paired difference, preregistered margin/CI, failures/unsafe events/cost and independent rerun | Any applicable PS dimension unproven, lower CI misses margin, or safety guardrail worsens | Doc 18 protocol and independent benchmark | Per claim/version | Independent benchmark council | BLOCKED |

Targets needing empirical baseline (latency, RTO/RPO, support response, cost) remain provisional in `09_PLATFORM_SRE_COST.md`; they must not be advertised until measured.
