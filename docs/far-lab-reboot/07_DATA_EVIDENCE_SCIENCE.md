---
status: reviewed
owner_role: data-trust-science-lead
last_verified: 2026-08-05
scope: detailed data schema, Receipt V2 contract, evidence lineage, scientific methods, datasets, evaluation, and model governance
authoritative_for: [detailed receipt and data contracts, scientific evaluation protocol]
evidence_level: mixed
related_decisions: [DEC-002, DEC-005, DEC-006]
related_requirements: [REQ-TRUST-001, REQ-DATA-002, REQ-SCI-001]
supersedes: []
superseded_by: null
---

# FAR-Lab data, evidence and scientific-validity specification

| Field | Value |
|---|---|
| Status | `TARGET_CONTRACT; SCIENTIFIC VALIDATION NOT YET ESTABLISHED` |
| Owner | Data/protocol owner + domain scientific owner + evaluation owner (all unassigned) |
| Evidence level | A current forensics; D target design; E domain-demand assumptions |
| Last verified | 2026-08-05 |
| Authority | Domain language, data authority, receipt protocol, scientific validation and model/detector governance |

## 1. Non-negotiable separation

FAR-Lab must preserve this typed chain:

`source assertion → captured bytes → normalized representation → derived measurement → automated signal → policy check → verification result → human review → external accountable decision → challenge/correction/withdrawal`.

Each link has a different schema, actor, provenance and UI label. No transform automatically upgrades an assertion into an observation, a signal into evidence of misconduct, a check into scientific truth, or a human opinion into an institutional decision.

Four historical trust-review questions remain useful as threat prompts, but they are **not** the product result vector. Their mapping to the six canonical assurance dimensions is explicit:

| Threat question | Canonical assurance mapping | Possible evidence | Does not prove |
|---|---|---|---|
| Internal consistency | Primarily `integrity`; deterministic rule execution also contributes only to `processConformance` | Component digests, canonical rule trace | Who authored bytes; truth |
| Anchor continuity | `provenance`, `integrity` and time-scoped `identity` remain separate fields | Transparency/timestamp/repository anchor | Signer authorization; source completeness |
| Origin authenticity | `identity`, with `provenance` reported independently | Signature, certificate/key history, revocation and authorization policy | Honesty, scientific validity or complete disclosure |
| Scientific validity | `scientificVerdict`; `executionReproduction` remains an independent result | Validated protocol, real data, expert oracle, uncertainty/error analysis | Universal truth or future replication |

The product reports exactly the six-dimensional assurance vector in core doc 07, never these four prompts as fields and never one trust score.

## 2. Current trust/science baseline

- The R0–R9 kernel is real and deterministic, with meaningful boundary/adversarial test source; its internal logic is stronger than its production input binding.
- Active FEC orchestration treats nonempty source/hash strings as resolved bindings, injects empty deviation/contradiction sets and marks any present power plan adequate (`src/fec/orchestrator.ts:320-407`).
- Real-stat FEC construction uses all-zero freeze and deviation-policy hashes (`src/falsifiability/legacy_kernel_adapter.ts:326-334`); compiled execution/refutation/reproduction plans are explicitly empty (`src/fec/compiler.ts:243-247`).
- FEC V2 persistence and ProofEnvelope V2 structures exist but are not the active end-to-end production/export path; active export reads V1 envelopes.
- V1 envelope hashing explicitly documents TypeScript self-consistency and a future independent mirror (`src/proof_envelope/proof_hash.ts:4-18`). Full-component integrity is optional in the current verifier.
- Benchmark entries are all offline fixtures with unreviewed oracles and no commit binding (`benchmark/benchmark_report.json:1-29,766-773`).
- Hero A/B use shaped fixture data. C-Astro performs real Python computation but its current search/statistical correction/provenance are teaching/demo-grade, not a validated exoplanet inference pipeline.
- Current “sandbox” does not enforce network/CPU/memory isolation and therefore cannot safely run untrusted scientific code.

Allowed current capability claim: “The repository implements deterministic check logic, append-oriented integrity mechanisms and fixture-backed scientific-computation paths.” Scientific performance, cross-domain validity, independent authenticity and production assurance remain unproven.

## 3. Ubiquitous language and entity catalog

Initial local deployment uses the following names consistently in UI, CLI and API. Database names are indicative target contracts, not migration instructions.

| Entity / API name | Definition and non-definition | Identity / ownership | Mutability and lifecycle | Data/permission |
|---|---|---|---|---|
| `Workspace` / `workspace` | Storage/security boundary; initial value is local, not an organization | `workspaceId`; local user | Config versioned; local workspace deletable | Contains projects; no identity assurance locally |
| `Project` / `project` | User-managed scope for related receipts; not a scientific case decision | ULID + optional user key; workspace | Mutable metadata; archive/export | Project-scoped read/write |
| `Claim` / `claim` | Exact falsifiable statement, scope and evidence mode | Content plus stable ID within draft/receipt | Draft mutable; receipt snapshot immutable | No truth status field |
| `Artifact` / `artifact` | Logical research material; not bytes | Stable project ID | Metadata mutable only through new version | Classification/license owner |
| `ArtifactVersion` / `artifactVersion` | Immutable captured bytes or external reference snapshot | Content digest + artifact/version ID | Immutable; correction creates version | Access can be narrower than receipt metadata |
| `SourceReference` / `sourceReference` | Assertion about external origin/retrieval/license | URI/identifier + captured response/version | Append retrieval records | Does not authenticate source by itself |
| `Transformation` / `transformation` | Versioned operation mapping input versions to output versions | Transformation/run ID | Immutable execution record | Tool/code/env/params required |
| `PolicyVersion` / `policyVersion` | Immutable applicability and check specification | Policy ID + semver + digest | Draft → approved/withdrawn; never edited | Publication requires scientific/governance owner |
| `CheckDefinition` / `checkDefinition` | Deterministic or validated check in a policy | Check ID/version | Immutable inside policy | Has domain/error/abstention card |
| `ReceiptDraft` / `draft` | Editable proposal for one receipt | Draft ID/project/owner | Versioned optimistic edits; discardable | Sensitive local working state |
| `Receipt` / `receipt` | Immutable package snapshot of claim/materials/policy/results/limits | Receipt ID + manifest digest | Exists only as `SEALED`; standing `ACTIVE/SUPERSEDED/WITHDRAWN`, orthogonal `preservationStatus=AVAILABLE/ARCHIVED/PAYLOAD_REMOVED`; distribution/review are separate | Sealed bytes never updated; authorized payload removal preserves an honest tombstone/gap |
| `Task` / `task` | Logical durable operation | Task ID/project/subject | State machine; attempts append | Owner/observer/cancel permission |
| `TaskAttempt` / `taskAttempt` | One execution with exact bindings | Task + attempt number | Immutable terminal record | Resource/log access scoped |
| `CheckResult` / `checkResult` | Outcome of one versioned check on named inputs | Receipt/verification + check ID | Immutable; reverify creates result set | `satisfied/not_satisfied/mixed/limited/not_evaluated` |
| `EvidenceItem` / `evidence` | Typed assertion/observation/derivation used by a check/review | Evidence ID + digest/reference | Immutable; superseded, never overwritten | Type/provenance/quality required |
| `EvidenceRelation` / `evidenceRelation` | Typed directed link with scope | Relation ID | Immutable | No causal semantics without explicit type |
| `TrustAnchor` / `trustAnchor` | Separately controlled digest/signature/timestamp reference | Anchor ID/provider/version | Append/revoke/expire | Never internal-consistency substitute |
| `VerificationResult` / `verification` | Per-dimension result from named verifier and `verificationPolicy` | Verification ID + receipt digest | Immutable; repeated verification separate | Includes gaps and compatibility |
| `HumanReview` / `review` | Attributed human statement with basis and COI | Review ID/actor class | Append amendments/supersession | Not machine evidence or decision |
| `EvidenceRequest` / `evidenceRequest` | Typed request event inside a review case for missing/corrected material | Review/check scope + request event ID | Append-only request/response events; canonical `ReviewCase` owns state | Visible to affected party where safe |
| `Challenge` / `challenge` | Typed contest statement inside a review case targeting a check/review/provenance item | Challenge ID/subject/review case | Append-only; unresolved challenge derives `reviewSummary=CONTESTED`; resolution outcome stays attributed | Independent reviewer in protected mode |
| `LifecycleEvent` / `lifecycleEvent` | Append event changing current interpretation | Event ID/subject/version | Immutable ordered history | Actor/reason/authority required |
| `ExportPackage` / `export` | Materialization of a receipt under `disclosureProfile` | Export ID + package digest | Immutable artifact | May omit restricted component only if the source receipt and disclosure profile declare the gap |
| `AuditEvent` / `auditEvent` | Accountability record for access/action/policy | Event stream ID/sequence | Append, corrected by new event | Not product analytics or evidence |

Reserved institutional entities—`Organization`, `Membership`, `Role`, `Case`, `Decision`, `Appeal`, `LegalHold`, `DeletionRequest`, `Incident`, `Notification`—are not faked in local schema/UI. Their contracts become mandatory before Profile I.

## 4. Identifier, scope and concurrency invariants

1. Every persisted project object has `workspaceId` and `projectId`; every receipt-derived object has `receiptId` or `draftId`; every run artifact has `taskId` and `attempt`.
2. IDs are service-generated and validated; caller labels never select global records.
3. Natural identifiers (DOI, filename, policy name) are attributes, not primary isolation keys.
4. Immutable values carry content digest, schema version and every applicable qualified policy/profile version.
5. Mutable resources carry monotonic version and ETag; updates require expected version.
6. A query never falls back to “latest in database.” Current receipt is resolved only inside an explicit lineage/project.
7. Idempotency keys are scoped to actor/project/operation and bind a request digest. Reuse with different input is a conflict.
8. Local Profile L serializes atomic receipt seals and append-only distribution transitions when needed; institutional mode must prove concurrent isolation across DB, cache, object storage, events, exports and logs.

These invariants directly prevent the observed report/global-stage association defect (`API-0001`).

## 5. Storage and authority

### 5.1 Initial stores

| Store | Purpose | Authority | Consistency/backup | Why / exit |
|---|---|---|---|---|
| SQLite | Project/draft/receipt metadata, tasks, policies, results, review/lifecycle/audit events, CAS references | Transactional metadata authority | WAL where supported; explicit verified backup/restore; foreign keys/checks | Fits single-user local; migrate only on institutional/load evidence |
| Filesystem CAS | Original/derived component bytes and immutable packages | Byte authority by digest | Atomic temp/hash/finalize; fanout; inventory and scrub; separately backed up | Avoid BLOB/database inflation; replace with object storage only when measured scale or deployment needs require it |
| Receipt package | Portable exchange authority for one receipt snapshot | Manifest and component bytes | Immutable; independent validation | Must not require source DB |
| Exact metadata index | Local discovery acceleration | Rebuildable, never authority | Generation/cursor recorded; staleness visible | No search service initially |

No graph database, vector database, distributed cache, analytics warehouse, event broker or object store is justified initially. Relations live in relational tables/package files; exact/FTS search can be evaluated when real task data shows need.

### 5.2 Atomic compile/export

1. Resolve exact draft/policy/material versions and take a transactionally consistent snapshot.
2. Copy/stream allowed components to owned temporary CAS/package paths while hashing bytes.
3. Execute only approved checks in isolated attempt; persist output components by digest.
4. Construct mandatory canonical manifest and verification metadata.
5. Verify package from its temporary path using the public verifier interface.
6. In one metadata transaction, persist immutable receipt/component/result/event references and idempotency result.
7. Atomically finalize the package/path; if finalization fails, receipt remains unavailable and a reconciliation task identifies owned orphan data.

The design must specify reconciliation for the unavoidable filesystem/DB boundary. A receipt cannot be visible as compiled before every required component and manifest is durable and reverified.

### 5.3 Derived-state invalidation

Artifact correction, policy withdrawal, verifier defect, anchor revocation or environment incompatibility emits an impact event and marks dependent verification results stale/affected; it never edits them. A new verification/receipt resolves the state. Index/cache invalidation is receipt/project scoped and rebuildable from authority.

## 6. Data asset and classification catalog

Every dataset/component catalog row records source/collection/time, controller/owner/processor, license/consent, affected parties, format/schema/unit/timezone, size/growth/access, quality/bias, lineage, encryption/access, retention/backup/delete, third-party/region, allowed purpose and withdrawal condition.

Initial classifications:

| Class | Examples | Default handling | Receipt/export |
|---|---|---|---|
| PUBLIC | Published paper metadata, open dataset under compatible terms | Capture version/license; network consent still explicit | Embed/reference per license |
| PROJECT_INTERNAL | Unpublished claim, code, run metadata | Local encrypted-volume assumption documented; no telemetry/network | Embed only by disclosure choice |
| RESTRICTED | Embargoed/proprietary data, credentials-adjacent logs | Deny initial receipt or reference with access-controlled external anchor | Never embed by default |
| PERSONAL/SENSITIVE | Human subject/person-level/whistleblower/investigation material | Out of initial product scope | Reject with safe explanation |
| SECRET | Keys/tokens/passwords/private keys | Never ingest; secret reference handled outside receipt | Prohibited |

“Public” is not permission for arbitrary redistribution or model training. License, database terms, consent and withdrawal follow the asset version.

## 7. Receipt V2 package contract

The target replaces the ambiguous V1 self-verification claim. Names are conceptual contracts until a formal schema is approved.

### 7.1 Mandatory top-level structure

| Component | Required | Role |
|---|---:|---|
| `manifest.json` | Yes | Receipt schema/canonicalization IDs, receipt/project scope, every component path/role/media type/size/byte digest, qualified policies/profiles, disclosure and algorithms |
| `claim.json` | Yes | Exact statement, scope, evidence mode, units and non-claims |
| `policy.json` or immutable reference+digest | Yes | Exact policy/check definitions/applicability/refusal rules |
| `materials.json` | Yes | Artifact versions, source assertions, license/classification and embedded/reference status |
| `lineage.json` | Yes | Transform/run/input/output graph and environment references |
| `check-results.json` | Yes | Typed outcomes, inputs, methods, uncertainty/gaps and rule trace |
| `verification.json` | Yes | Producer preflight result by trust dimension and verifier version |
| `lifecycle.json` | Yes | Current standing, preservation status, predecessor/successor, correction/withdrawal/challenge events disclosed by `disclosureProfile` |
| `limitations.json` | Yes | Unknowns, omissions, unsupported capabilities, domain bounds and what package cannot prove |
| `README.txt`/accessible HTML | Yes | Human instructions and warnings; not authority |
| `components/**` | As declared | Data/code/environment/output/review evidence permitted by `disclosureProfile` |
| `signatures/**` | Profile-dependent | Signatures/certificates/revocation references over manifest digest |
| `anchors/**` | Profile-dependent | External timestamp/transparency/repository receipts |

`manifest.json` lists all other package files, including signature/anchor descriptors, but excludes its own byte digest. The receipt root is the canonical manifest digest. Signature objects sign that digest and are not recursively included as signed bytes; their descriptors/digests are covered by the manifest and the exact `trustPolicyId` referenced by `verificationPolicy`. The approved Receipt V2 contract must eliminate ambiguity with reference vectors.

Removing `manifest.json`, a listed component, an algorithm/qualified-policy/profile declaration or required trust-policy component is a hard failure. A verifier cannot interpret absence as legacy success unless the user explicitly selects a named legacy compatibility policy; missing/degraded assurance dimensions remain visible. No auto-downgrade.

### 7.2 Canonicalization and numeric rules

- Raw/binary/text artifact digest is SHA-256 over exact bytes for the initial suite; algorithm ID is recorded for migration.
- Semantic JSON uses one published `canonicalizationAlgorithmId` plus field-preprocessing contract (target decision: standards-based JCS after cross-language conformance), UTF-8 and no duplicate keys.
- Scientific quantities use explicit unit and a canonical decimal/string representation; receipt-critical floats cannot rely on runtime-specific binary/JSON formatting. Raw observed representation is preserved separately.
- Arrays declare whether order is semantic. Unordered sets are normalized by stable code-point/digest keys under that canonicalization contract.
- Paths use safe normalized relative POSIX form; no absolute path, parent traversal, ambiguous Unicode normalization or symlink entry.
- Time records source/clock/precision/timezone; wall time is not proof of trusted time without an external timestamp.
- `scientificProfile`, qualified policy/profile and algorithm versions are included in digests; unknown critical fields fail compatibility.

### 7.3 Verification policies and qualified profile types

The serialized type vocabulary is authoritative in `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md`. `deploymentProfile`, `verificationPolicy`, `scientificProfile`, `numericalEquivalenceProfile` and `disclosureProfile` are separate. A verification policy declares required predicates over the six assurance dimensions; it is not itself an outcome.

Named policy candidates may require:

- structural safety and mandatory member/canonical-link evaluation;
- full integrity and internal reference evaluation;
- external anchor/time evaluation;
- signature identity **and authorization** evaluation;
- exact policy/execution binding evaluation;
- replay under one N0–N4 numerical equivalence profile;
- one separately governed `scientificProfile`.

A package may satisfy several predicates. Structural/core integrity alone is self-consistency. The previous labels `CORE_INTEGRITY_V2`, `EXTERNAL_ANCHOR_V2`, `SIGNED_ORIGIN_V2`, `REPRODUCIBLE_COMPUTE_V2` and `DOMAIN_VALIDATED_{id}` remain design aliases only until one policy registry defines their exact predicates; they are not result enums or a ladder.

### 7.4 Independent verifier release gate

Publish a prose/formal specification, JSON schemas, algorithm suites, golden/negative/downgrade vectors and at least two implementations maintained/reviewed independently enough to expose correlated errors. The clean-room verifier receives only package bytes, optional explicit anchor/trust store and local policy cache; it has network disabled by default and no author database/repository. Test corrupted bytes, consistent rehash, removed manifest, swapped policy/code/data, path/archive attacks, old/unknown schema, key rotation/revocation, algorithm migration and partial disclosure.

“Independent” is permitted only after a third party not involved in the producer implementation completes the predeclared exercise and publishes raw results/limitations.

## 8. FEC/policy and execution binding

A frozen scientific/check policy is meaningful only if all decision-relevant fields are included in its digest and verified against what ran.

Required policy content:

- claim/evidence mode, measurable implication and scope;
- dataset requirements, allowed synthetic/derived data and exact material-binding rules;
- workflow/code/tool/environment and version requirements;
- primary/secondary outcomes, units, comparator, threshold and direction;
- sampling/power, randomization/seed, missing/outlier/stopping and multiplicity plans;
- assumptions/diagnostics, confounders, deviations and contradiction handling;
- applicability/unsupported domains, abstention and human review rules;
- error costs and threshold justification;
- freeze actor/time/commit/environment and actual policy digest;
- approval/validation evidence, owner and retirement.

Execution binding rules:

1. Material binding is content digest plus declared role and policy requirement—not a nonempty string.
2. Workflow binding resolves code/tool/container/dependency/parameter/environment digests and invocation.
3. Execution records actual resources, random seeds, inputs/outputs, deviations, failures/retries and timestamps.
4. Policy digest is recomputed and equal to the frozen value before execution/result use.
5. Mandatory diagnostics/power/multiplicity checks are evaluated, not inferred from presence.
6. Deviations and contradiction set derive from recorded events/material comparison; caller cannot hand an empty list as proof.
7. A check result links exact policy, bindings and execution; missing linkage produces the applicable registered `NOT_EVALUATED`, `LIMITED`, `OUT_OF_SCOPE` or `UNTESTED` outcome, never satisfied.
8. Synthetic/fixture/online/observational/experimental modes are machine types and user-visible.

The kernel should remain a pure, deterministic policy evaluator. Input-assurance validation is a separate mandatory stage whose result the kernel cannot bypass.

## 9. Lineage and evidence quality

Every derived component records input IDs/digests, transformation/tool/model/prompt versions, parameters, environment, actor, start/end, output digests, quality checks, failures/retries and replay status. Relations use a finite registry such as `asserts`, `captured_from`, `normalized_from`, `derived_from`, `measures`, `supports_within_scope`, `conflicts_with`, `checks`, `reviewed_by`, `supersedes`; each declares direction and allowed entity types. “Supports” never implies causal proof.

Data-quality dimensions are completeness, uniqueness, validity, consistency, accuracy where independently knowable, timeliness, traceability, representativeness, label reliability and unit/encoding correctness. Every rule declares scope/time/threshold/severity/blocking/owner/remedy/exception/monitor/history. A human correction proposes a new artifact/version, runs impact analysis, invalidates dependent results, requires review where high risk and preserves old values.

## 10. Lifecycle, privacy, retention and deletion

- Raw material and receipt snapshots are immutable while retained; corrections create new versions/receipts.
- Local user defines retention. Default product telemetry is off; session/model text is not retained beyond explicit local need.
- Receipt export makes copies outside FAR-Lab control. Deletion UI must state that local deletion cannot revoke recipients’ copies or public anchors.
- Deletion removes authorized local CAS bytes/metadata according to policy and produces a minimal non-sensitive deletion record only where lawful/necessary. Claims of secure deletion depend on storage/encryption/backup behavior and must be tested.
- Backups follow the same classification/access/retention; deletion propagation and restore re-deletion are specified.
- Institutional legal hold, subject requests and controller/processor duties are blocked features, not local placeholders. Hold overrides ordinary deletion only under a documented accountable authority, with notice/appeal rules.
- Hashes of personal/small-domain data can themselves be identifying/dictionary-testable; do not publish them automatically.

## 11. Schema and migration governance

Maintain a registry for DB, API, events, receipt, policy, check result and CLI-machine schemas with owner, compatibility, change history, fixtures and retirement. Applied DB migrations store version, name and immutable checksum. Upgrade preflight checks disk/backup/version, runs migration transactionally where engine permits, validates counts/invariants/digests and records result. Failure stops at a known state; irreversible migration uses verified backup and forward-repair/restore rehearsal.

Never edit an applied migration without a new corrective migration. Backfills/recomputations are explicit jobs with source/algorithm versions, checkpoints, counts, samples and rollback/invalidations. Old receipts remain readable by a versioned verifier; migration creates a new package and link, never rewrites archived bytes.

## 12. Scientific task definition: initial scope

The first validation target is not “28 scientific domains.” It is one bounded task class:

> Given an immutable, legitimately shareable dataset and preregistered two-group computational analysis, determine whether the submitted package conforms to its declared plan and whether an independent execution reproduces the declared numerical outputs within specified tolerances.

This checks process and computation. It does not determine causal validity, novelty, misconduct or truth of a broader scientific theory.

Required task card:

| Field | Initial contract |
|---|---|
| Research question | Is this package internally complete, plan-conformant and computationally reproducible within named scope? |
| Target variables | Component presence/integrity, plan deviations, primary statistic/effect/CI, replay difference |
| Decision context | Author/reviewer handoff; advisory completeness/reproduction, no sanction |
| Observation unit | One independently prepared receipt/project; split by project/author |
| Scope | One method/domain policy per validation; language/OS declared |
| Labels | Satisfied, not satisfied, mixed/conflicting, limited applicability, not evaluated |
| Ground truth | Deterministic corruption/deviation seeds plus blinded expert adjudication of real package cases; disagreements/unknown retained |
| Error costs | Unsafe pass highest; false block next; abstention/review time measured |
| Human flow | Reviewer sees inputs/rule/limits and can request evidence/challenge |
| Forbidden claim | Scientific truth, misconduct, universal reproducibility or domain generalization |

Astronomy can be a later domain pack only after real TESS method validation, trial-factor/null calibration, provenance binding and independent astronomy review. Current simplified BLS remains an education/conformance fixture.

## 13. Check/Detector Cards

Each check has the full card: ID/version, purpose/non-goals, theoretical basis, input/output schema, supported/unsupported scope, ground truth/datasets/baselines, metrics/calibration/abstention/threshold/error costs, fairness/robustness/adversarial risks, explanation/human review, resource/reproducibility/monitoring, approval/retirement and owner.

Initial candidate families:

| Card | Purpose | Baseline | Key failure/abstention |
|---|---|---|---|
| `STRUCTURE_CONFORMANCE` | Required `verificationPolicy`/schema/relationships/components | Plain JSON Schema/manual checklist | Unknown critical schema or omitted component → integrity/process result fails or is not evaluated per policy |
| `CONTENT_INTEGRITY` | Recompute component/manifest/internal-link digests | File checksums | External authenticity absent → explicit unknown, not failure |
| `POLICY_BINDING` | Verify policy digest, material/workflow bindings and deviations | Presence-only FEC compiler | Missing actual binding/deviation evidence → not evaluated |
| `STATISTICAL_PLAN_CONFORMANCE` | Compare executed analysis to preregistered plan | Manual methods review/simple rule | Unmet assumptions/power/multiplicity or unsupported design → expert review/abstain |
| `REPRODUCTION_MATCH` | Rerun declared workflow and compare bounded outputs | Manual rerun/no environment capture | Unsupported environment/restricted data → limited applicability |
| `ANCHOR_MATCH` | Compare root to independent anchor | Keyless internal manifest | Anchor unavailable/revoked → unknown; never authentic by itself |
| `SIGNED_ORIGIN` | Validate signature and authorization policy | Digest only | Unknown/revoked key or identity policy → `identity=UNKNOWN/REVOKED` or policy-specific failure; never a generic failure label |

The existing anti-theater detectors become candidate check cards only after each has an applicability set, active production caller, validation data, error analysis and retirement owner. A registry count is not a quality metric.

## 14. Dataset and label protocol

- Define sampling frame, date, discipline/language/region/institution/tool versions, license/consent, preprocessing, dedupe, leakage and withdrawal.
- Include real clean packages, naturally incomplete/incorrect packages, predeclared seeded defects and adversarial packages. Seeded defects validate detection mechanics but do not estimate natural prevalence alone.
- At least two qualified blinded reviewers per high-risk label; third adjudicator for disagreement; record training/guideline version, COI, confidence/unknown and inter-reviewer agreement.
- Split by project/author/source to prevent near-duplicate leakage. Maintain locked final, time-out, institution-out, platform-out and adversarial sets; no tuning on final set.
- Preserve a challenge set for ambiguous/partial cases and report them, rather than resolving all into binary labels.
- Remove/mark retracted data and propagate impact without rewriting past reports.

## 15. Evaluation and decision metrics

For deterministic checks report coverage/applicability, unsafe-pass rate, false-block rate, abstention/unknown rate, per-defect precision/recall, time-to-detect, reviewer correction rate and exact cross-implementation agreement. Where a score/probability exists, additionally report calibration (Brier/ECE/reliability) and never invent confidence for rule outputs.

Every metric includes sample size, confidence interval, realistic prevalence/base-rate sensitivity, threshold source, multiplicity plan, preregistration, failure threshold and operational meaning. Report stratified performance by domain/method, language, platform, data accessibility and package producer; monitor disproportionate abstention/false block. Balanced corpus accuracy cannot imply real-world PPV.

Required baselines/ablations:

1. manual checklist/reviewer workflow;
2. schema/checksum only;
3. existing standard/provenance package verification where applicable;
4. simple deterministic policy without evidence graph;
5. full receipt without LLM;
6. full receipt with optional authoring assistant;
7. remove signature/anchor/reproduction dimensions separately;
8. current V1 package/verifier as legacy baseline.

Complexity remains only if it materially improves unsafe-pass/false-block/reviewer-time/trust-comprehension relative to these baselines.

## 16. Robustness and reproducibility protocol

Test missing/noisy/reordered data, unit/encoding/timezone, renamed paths, translation/format/compression, duplicate keys, archive attacks, prompt injection, adversarial omission/rehash, random seeds, parameter sensitivity, repeated runs, hardware/OS/library drift and loss of remote references. For numerical output predeclare absolute/relative/ULP tolerance per metric and justify it; never use one global epsilon.

Reproduction record includes OS/architecture, language/packages/lock, compiler/system libraries, CPU/GPU/driver, locale/timezone, allowed environment variables, seeds/thread/determinism, external API/model version, workflow graph, checkpoints, logs, resources and output digests. Original inputs mount read-only. Notebook claims require clean sequential parametrized execution without hidden state, CI/module extraction where critical and accessible chart/data outputs.

External literature/database evidence records exact query, service/version, date, result count, inclusion/exclusion/dedupe, access limits, cached response and rerun difference. Citation checks verify existence, bibliographic identity, version/retraction and whether the primary source supports the scoped proposition.

## 17. Model and policy governance

LLM models are optional drafting components, not verdict authorities. Registry entries record ID/version/source/license, adaptation/training disclosure, data/retention/region, scope, metrics/limits, cost/resources, prompt/tool compatibility, approval/deployment/monitoring/retirement. Admission requires offline task evaluation, privacy/security, robustness, language/domain, human usability, failure/refusal, cost/latency, version/rollback and independent review.

Deploy only in shadow/limited pilot before an approved authoring role. Provider/model changes never silently substitute; affected drafts/sessions are marked and receipt evidence is unaffected until explicitly recompiled. Monitor input/output/refusal/correction distributions, latency/cost, provider changes, privacy/security events and user acceptance of unsafe proposals. A defect disables the model, marks affected sessions, notifies owners and triggers correction where a proposal entered a receipt.

Policy/check versions follow stricter trust-kernel governance: named scientific owner, implementation owner and independent reviewer; preregistered evaluation; signed approval record; canary/shadow against existing policy; impact analysis of every changed threshold/semantics; withdrawal and affected-receipt query; no in-place change.

## 18. Scientific release gates

Block any domain/policy release if task is not identifiable; ground truth is unreliable/hidden; project leakage exists; metric is unrelated to the decision; realistic-base-rate safety is unacceptable; abstention/applicability is absent; critical subgroup/platform failure exists; environment cannot replay; data/model/policy versions are missing; automatic result can cause adverse decision; correction/withdrawal is absent; citations do not support claims; or independent domain review is missing.

Minimum Gate 3 evidence:

- registered task/check cards and frozen analysis plan;
- immutable, licensed dataset inventory and locked split hashes;
- reviewer qualifications, label guide, agreement and disputes;
- baselines, ablations, uncertainty and error-cost report;
- cross-platform/cross-implementation reproduction;
- adversarial/downgrade and privacy/security results;
- user comprehension and procedural-redress evidence;
- named owners, defect/withdrawal process and expiry;
- raw machine-readable results bound to one candidate commit/release.

No threshold is invented here without power/error-cost evidence. Domain owners must set it before viewing the locked test set.

## 19. Acceptance, monitoring and rollback

| Area | Acceptance tests | Runtime/periodic monitor | Rollback/degradation |
|---|---|---|---|
| Manifest/package | Required removal/swap/rehash/path/algorithm/schema vectors across independent verifier | Verification failures/legacy use/compat drift | Quarantine the candidate/format version; ship prior standalone verifier |
| FEC binding | Dataset/workflow/policy/deviation/power/assumption adversarial cases | Not-evaluated/limited rates and unexpected empty fields | Structural checks only; no scientific result |
| Scope/isolation | Parallel projects, ID/cache/event/export adversarial access | Isolation canaries/orphan references | Single local project/run |
| Lineage | Every result input resolves; cycles/orphans/version drift fail | Orphan/stale/invalidated counts | Refuse seal/reverify |
| Migration | Checksum drift, interruption, low disk, old/new readers, restore | Migration/validation/restore errors | Restore verified copy/pin release |
| Data quality | Unit/encoding/missing/duplicate/license/withdrawal cases | Trend by source/domain | Reject/quarantine source |
| Scientific validity | Locked real cases, baselines, base rates, CI, abstention and subgroup results | Drift, correction, disagreement, unsafe pass | Withdraw policy; mark affected receipts; human-only review |
| Model assistance | No-model baseline, unsafe suggestion, provider switch, prompt injection | Acceptance/correction/refusal/cost/privacy | Disable model; manual drafting |
| Deletion/retention | CAS/index/backup/export/anchor scenarios | Orphans, overdue retention, restore reappearance | Disable delete claim; local export/read-only |

## 20. What a compliant receipt still cannot prove

It cannot prove omitted material does not exist, source bytes are honest, a human signer is truthful, a method is universally valid, all environments will reproduce, a result will replicate scientifically, absence of misconduct, legal compliance, or fairness of an external decision. Its defensible outcome is narrower: a recipient can inspect what was declared, reproduce named checks under stated conditions, see trust anchors and gaps, and preserve correction history.
