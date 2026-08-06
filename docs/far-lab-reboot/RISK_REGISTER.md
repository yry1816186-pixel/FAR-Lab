---
status: reviewed
owner_role: risk-and-release-council
last_verified: 2026-08-05
scope: product, trust, science, security, privacy, data, platform, governance, and adoption risks
authoritative_for: [risk status and release blocks]
evidence_level: mixed
related_decisions: [DEC-001, DEC-008, DEC-010, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot risk register

| Field | Value |
|---|---|
| Status | `ACTIVE_AUTHORITY` |
| Owner | Audit lead until role assignment |
| Evidence level | Mixed; each row distinguishes fact/inference/unknown |
| Last verified | 2026-08-05 |
| Authority | Strategic, product, scientific, security and delivery risk gates |

Scales: likelihood and impact are 1–5; score is their product, not a probability. `BLOCK` means no external high-stakes or stable-release claim until the exit evidence exists.

| ID | Risk / type | Evidence basis | L | I | Score | Early signal | Conservative control / fallback | Exit evidence | Owner | Gate |
|---|---|---|---:|---:|---:|---|---|---|---|---|
| R-001 | Scientific overclaim: deterministic output presented as truth. FACT + inference | README conflict; fixture benchmark; literature-label verdict path | 5 | 5 | 25 | Users treat `CONFIRMED` as factual adjudication | Rename evidence modes; refuse unsupported decisions; human review | Domain protocol, expert oracle, calibrated errors, comprehension test | Scientific lead | BLOCK |
| R-002 | Consistently rehashed forgery passes keyless self-check. FACT | `README.md:263-265,318-320` | 4 | 5 | 20 | Same actor controls record and anchor | State threat boundary; require external signed timestamp/transparency anchor under an explicit trust policy | Independent adversarial validation of signature/time `trustPolicy` and downgrade prevention | Security owner | BLOCK |
| R-003 | Missing optional integrity manifest silently weakens bundle checks. FACT | `bundle_verifier.ts:23-35,179-189` | 4 | 4 | 16 | Bundle without `integrity.json` reports full-mode success | V1 import emits explicit degraded/missing assurance dimensions; any `verificationPolicy` requiring the manifest fails | Negative removal/downgrade tests across independent verifier | Protocol owner | BLOCK |
| R-004 | Multi-user authorization/data isolation absent. FACT | Principal unused; no owner/tenant schema | 4 | 5 | 20 | Protected deployment or shared DB requested | Limit product to local single-user; deny hosted institutional claims | Resource policy matrix, isolation tests, threat review | Security + platform | BLOCK |
| R-005 | Scheduler executes shell command strings. FACT | `schedule.ts:154-173` | 4 | 5 | 20 | Untrusted/shared schedule entry or path interpolation | Disable/exclude scheduler in distribution and docs until redesigned | Argument-vector allowlist, privilege boundary, injection tests | Security owner | BLOCK |
| R-006 | Sensitive prompts/responses persist without privacy lifecycle. FACT | Initial schema plaintext; no classification/retention | 4 | 5 | 20 | Human/person-level data enters a case | Data minimization; local ephemeral default; reject sensitive categories | DPIA/data map, retention/deletion/legal-hold tests | Privacy owner | BLOCK |
| R-007 | Scientific benchmark has no ground truth or independent review. FACT | All entries unreviewed/offline fixture | 5 | 5 | 25 | Domain/accuracy claims use fixture leaderboard | Rename to engineering conformance fixtures | Locked labeled sets, reviewer agreement, baselines, error bars | Evaluation lead | BLOCK |
| R-008 | Literature-support labels and experimental measurements share verdict vocabulary. FACT + inference | `verdict_stage.ts:13-27` | 4 | 5 | 20 | `CONFIRMED` emitted without metric value | Typed assessment mode; separate output labels; default `UNTESTED` for empirical claim | Semantic unit/acceptance tests plus expert adjudication | Science + product | BLOCK |
| R-009 | Current runtime cannot be verified in observed WSL tree. FACT | RUN-0002/3; test/demo blocked | 5 | 4 | 20 | Judge uses current workspace | Publish no current pass claim; create clean immutable candidate | Full gates and demo in clean supported OS with archived logs | Release owner | BLOCK |
| R-010 | Dirty, mixed snapshot makes evidence non-attributable. FACT | 253 baseline entries | 5 | 4 | 20 | Results cite “the repo” without commit/artifact ID | Pin every result; no cleanup or overwrite | Clean candidate commit, provenance manifest, reproducible gate | Release owner | BLOCK |
| R-011 | Tracked nondeterministic artifacts create churn/self-reference. FACT | post-consolidation report; tracked inventory | 5 | 3 | 15 | Every run changes proof corpus/HEAD bindings | Separate source, generated evidence and release attestations | Versioned artifact policy and deterministic regeneration test | Repo steward | CONDITION |
| R-012 | Migration drift and partial-upgrade semantics are uncontrolled. FACT + inference | `migrator.ts:38-77` | 3 | 5 | 15 | Historical SQL edited; mid-upgrade failure | Backup/restore; checksum ledger; one-way compatibility gate | Tamper/drift/rollback rehearsal on copies | Data owner | BLOCK |
| R-013 | Appeal/correction/deletion is interface-incomplete. FACT | Route inventory; lifecycle only partial | 4 | 5 | 20 | Contested adverse result | Human decision only; export record; do not automate sanctions | End-to-end case/appeal/correction/exit tests | Product ops | BLOCK |
| R-014 | Placeholder governance cannot meet stated SLA. FACT | `MAINTAINERS.md`, `SECURITY.md` | 5 | 4 | 20 | Vulnerability report bounces/unanswered | Remove SLA claim; no stable release | Named accountable people, tested channel/tabletop | Governance owner | BLOCK |
| R-015 | Current competitor/leadership claims are unverified. FACT | README table lacks primary-source protocol | 4 | 3 | 12 | Judge checks one crossed-out capability | Withdraw categorical comparison | Dated reproducible task benchmark and source matrix | Strategy owner | CONDITION |
| R-016 | User demand/workflow change willingness unknown. UNKNOWN | Human-actions says research pending | 4 | 5 | 20 | Users praise demo but do not use receipt in decisions | Discovery pilot only; no scale implementation | Stratified interviews + observed workflow pilot + stop rules | Product research | BLOCK |
| R-017 | Bus factor one threatens trust-kernel stewardship. FACT | governance/maintainer docs | 5 | 4 | 20 | Unreviewed rules/release by sole owner | Freeze high-risk expansion; dual review before trust changes | Second maintainer, succession exercise, signed approvals | Governance owner | BLOCK |
| R-018 | External services/models can change cost or behavior. INFERENCE | Provider gateway and live-validation gap | 4 | 3 | 12 | Provider outage/model retirement | Core remains deterministic/offline; version and cache inputs | Provider-loss drill and substitution contract | Platform owner | CONDITION |
| R-019 | Unsupported accessibility/localization harms review use. UNKNOWN | Web route inventory only; full UX audit pending | 3 | 4 | 12 | Keyboard/screen-reader/task failures | CLI/export alternative; no accessibility claim | WCAG conformance audit with disabled users | UX owner | CONDITION |
| R-020 | Project volume conceals authority duplication/staleness. FACT + inference | Progress/roadmap conflict; multiple design trees | 5 | 3 | 15 | Two specs disagree; implementation selects one | Authority map and supersession ledger | Automated link/authority/conflict gate | Architecture owner | CONDITION |
| R-021 | Global/latest queries cross-associate concurrent runs. FACT + inference | `report/generator.ts`, `hypothesis_helpers.ts`; no DB `run_id` | 4 | 5 | 20 | Parallel hypothesize/report use shared DB | One active local run; serialize requests; no shared mode claim | Run-scoped schema, adversarial concurrency/isolation tests | Data/API owner | BLOCK |
| R-022 | FEC declarations are not bound to actual dataset/workflow/deviations. FACT | `orchestrator.ts:320-407`; placeholder freeze | 5 | 5 | 25 | Machine confirmation with synthetic/unbound inputs | Label prototype; no scientific confirmation | Immutable binding, deviation capture, power/assumption validation, independent domain test | Science owner | BLOCK |
| R-023 | “Sandboxed” science code retains network/resource/filesystem risk. FACT | Source honesty boundary; metadata-only network/resource status | 4 | 5 | 20 | Untrusted script or shared host | Trusted local code only; no network-block claim | OS-isolated runner, egress/resource tests and attestation | Security/platform | BLOCK |
| R-024 | Numeric/randomness replay yields a false match or hides a decision-changing divergence. FACT + inference | Boolean `toleranceFrozen`; no general N0–N4/randomness contract | 4 | 5 | 20 | Two runners disagree; bounded values cross scientific threshold | No reproduction claim; expose exact environment and raw difference | Approved numeric/randomness schema, independent vectors and threshold-crossing study | Science/protocol | BLOCK |
| R-025 | Selective disclosure/plain hashes leak low-entropy or linkable sensitive facts. FACT + inference | Annex warns hashes may be dictionary-testable; no active disclosure construction | 4 | 5 | 20 | Hidden diagnosis/name/small cohort guessed or linked across receipts/log | Withhold public digest/metadata; local restricted exchange only | Privacy-reviewed disclosure/commitment schema, attack corpus and DPIA | Privacy/security | BLOCK |
| R-026 | Long-term verification decays through algorithm, key, trust-root, timestamp, schema or reference loss. INFERENCE | No implemented suite-renewal/preservation state machine or archive drill | 3 | 5 | 15 | Old receipt has bytes but cannot reconstruct historical trust/semantics | State current/historical status as unavailable; never re-sign history invisibly | Suite registry, append renewal, preservation profile and air-gapped recovery | Security/archive | BLOCK |
| R-027 | Producer and “independent” verifier share a parser/spec defect or interpret ambiguous V2 differently. INFERENCE | Same-repo cross-language mirrors; no clean-room charter/TCK machine authority | 4 | 5 | 20 | Two verifiers agree only because they share core/fixtures, or disagree on edge case | Prohibit independent/conformant claim; freeze affected protocol version | Public/sealed TCK, shared-dependency declaration, differential fuzz and independent report | Protocol/quality | BLOCK |
| R-028 | Install/upgrade/uninstall/docs/support path loses evidence or teaches retired V1/truth semantics. FACT + inference | Mutable current installation sources, legacy quickstarts, no preserve/purge/support descriptor | 4 | 4 | 16 | First user cannot verify, deletes receipt, or reports security issue publicly | No stable distribution/onboarding claim; preserve data by default | Candidate-bound lifecycle matrix, first-success study, docs gate and live channels | Release/UX/support | BLOCK |
| R-029 | Telemetry semantics drift, leaks sensitive data or is mistaken for receipt/audit authority. INFERENCE | OTel projection/log assets without live semantic/privacy qualification | 3 | 4 | 12 | Raw/high-cardinality claim data enters exporter; missing spans treated as missing evidence | Telemetry off by default local; never trust authority; bounded diagnostics | Versioned semantic convention, redaction/cardinality/drop tests and runbook drill | SRE/privacy | BLOCK |

## Highest-risk assumptions

1. Users will change a sensitive scientific review workflow to adopt a verification receipt.
2. Domain experts can define reliable, versioned FEC policies whose error costs are acceptable.
3. A threat-bounded receipt is valuable even when the system refuses to decide truth.
4. Local-first operation can provide value before institutional tenancy and integration exist.
5. An independent verifier and external anchor can be made usable without destroying portability.
6. A selective-disclosure package can retain enough reviewer value without exposing low-entropy/linkable metadata.
7. Historical trust material and specification semantics can be preserved within legal/privacy constraints for the claimed lifetime.

## Stop rules

- Stop the universal cross-domain verdict strategy if two independently reviewed domains cannot reach predeclared validity/reliability thresholds without domain-specific rule forks that users cannot interpret.
- Stop institutional assessment use if appeal, authorization, data minimization and audit accountability are not operational before any adverse-decision pilot.
- Stop “independent verification” marketing if a clean-room team cannot validate a sealed package without access to author-controlled state.
- Stop scaling feature surfaces if five observed target workflows do not use the receipt in a real downstream decision or review handoff.
- Stop a stable release if any BLOCK risk lacks named ownership and verifiable exit evidence.
- Stop parallel implementation if the domain, protocol, surface or distribution machine authorities remain ambiguous or disagree with the reference vertical slice.
- Stop any “world-class/match/exceed” statement while one applicable parity dimension is unproven or the independent statistical comparison has not passed.
