---
status: reviewed
owner_role: data-trust-and-science-council
last_verified: 2026-08-05
scope: canonical data/evidence architecture and scientific-validation boundary
authoritative_for:
  - data and evidence invariants
  - Receipt V2 contract summary
  - first scientific profile and validation gates
evidence_level: mixed
related_decisions: [DEC-002, DEC-005, DEC-006, DEC-009]
related_requirements: [REQ-TRUST-001, REQ-TRUST-002, REQ-TRUST-003, REQ-TRUST-004, REQ-TRUST-005, REQ-DATA-001, REQ-DATA-002, REQ-DATA-003, REQ-SCI-001, REQ-SCI-002, REQ-SCI-003]
supersedes: []
superseded_by: null
---

# 11 — Data, evidence, and science

## 1. Scientific-trust verdict

The repository demonstrates deterministic rule execution and internal tamper-check concepts. It does **not** demonstrate that active inputs were the actual preregistered experiment, that a receipt is independently authentic/self-contained, or that 28 scientific domains are validly adjudicated. Current benchmark rows are all unreviewed offline fixtures (`SCI-0001`); active FEC bindings can be empty/placeholder (`SCI-0002`); active proof verification is bounded self-consistency (`TRUST-0001`).

The target specification and full schemas/metrics live in `07_DATA_EVIDENCE_SCIENCE.md`; this document owns the canonical separations and science gates. `DATA_INVENTORY.md` owns category-level lifecycle fields.

## 2. Non-negotiable assurance separation

```text
metadata/provenance description
≠ byte/component integrity
≠ signer identity and authorization
≠ conformance to a declared process policy
≠ independent execution reproduction
≠ scientific validity of the claim
```

Each result is independently typed as specified in `07_PRODUCT_DEFINITION_SCOPE_AND_DOMAIN.md`. A signed, provenance-complete, bit-reproduced analysis may preserve biased sampling or an invalid statistical model exactly. Conversely, a scientifically reasonable result may lack authenticated provenance. Interfaces and exports never compute one aggregate “verified.”

## 3. Data authority and identifiers

| Data class | Authority | Key invariants | Retention/access principle |
|---|---|---|---|
| Draft declarations | Local transactional store | Owner/project/version; never evidence until sealed | User-controlled, short-lived by default |
| Source/material bytes | Content-addressed immutable store or explicit external reference | Digest, size, media/schema, source class, license/consent, access, capture time | Embed minimum necessary; restricted/local-only supported |
| Verification-policy/scientific-profile/check cards | Signed/versioned registry | Stable ID/version/digest, applicability, refusal, owner, validation status | Released versions immutable; deprecation/withdrawal preserved |
| Run/task/attempt | Transactional state + append events | Explicit project/claim/run/task/attempt scope; terminal attempt immutable | Operational retention separate from receipt |
| Check/verdict results | Canonical receipt component | Exact inputs, method, implementation, parameters, environment, uncertainty and reason trace | Sealed bytes immutable; correction by successor |
| Provenance/evidence edges | Receipt/graph | Typed source→activity→result derivation or explicit gap/conflict | Preserve needed lineage; do not embed unnecessary raw content |
| Signature/anchor | Receipt/trust material | Signed subject, issuer/identity, policy, time/log, trust-root and revocation data | Retain offline verification material per `preservationPolicy` |
| Review/challenge | Review store + `disclosureProfile` | Attributed human state distinct from machine result; visibility/conflict | Due-process/privacy policy; amendments append |
| Audit | Security/governance audit store | Actor/service, decision/action, scope, result, correlation; no secrets | Tamper-evident, access-limited, purpose-specific |
| Telemetry/support | Operational store | Redacted diagnostic and consent; never evidence authority | Off by default local; short retention |

Every row/object is scoped by canonical IDs and database constraints. “Latest” is only an explicit version relationship, never an unscoped query. Derived indexes/views state source version and can be rebuilt.

## 4. Evidence-edge contract

Each edge records: stable edge/claim/material/check IDs; semantic relation; exact content digest and locator; source/capture method; source trust class; license/consent/access; transformations with activity/agent/tool/version/environment; `verificationPolicy`/`scientificProfile` applicability; uncertainty/conflict/omission; review state; and predecessor/successor.

An unavailable, redacted, referenced-only, expired, license-restricted or conflicting source remains explicit. LLM retrieval, citation grounding, memory and skill output enter as `UNTRUSTED_CANDIDATE` until a human/source-validation path promotes a specific artifact; they never promote themselves.

## 5. Receipt V2 contract

Required top-level content:

- schema/canonicalization-algorithm and qualified policy/profile versions plus canonical root;
- project/claim/receipt/run/task/attempt identities;
- claim scope and supported `scientificProfile`;
- mandatory complete component manifest with digest/size/media/role/criticality;
- source data/code/workflow/environment/parameter/randomness/policy and deviation bindings;
- typed checks, rule trace, assurance vector, scientific verdict scope/uncertainty;
- provenance graph and declared mapping-loss report;
- lifecycle/correction/withdrawal links and human-review separation;
- selected signature/anchor verification material and trust-policy identifier;
- limitations, referenced-but-unavailable content and `disclosureProfile`.

Canonicalization fixes byte encoding, per-field Unicode preservation/rejection/preprocessing, key ordering, number/non-finite handling, timestamps/timezones, path representation, duplicate keys, absent vs null and archive/member rules. JCS does not itself normalize Unicode, so any normalization occurs in an explicitly separate, versioned pre-canonical transformation and changes the semantic input. Unknown critical fields/major versions, missing manifest/required member, placeholder digest, inconsistent component root, ambiguous canonical bytes or silent V1 downgrade fail closed.

Qualified types replace a single overloaded profile ladder:

- `deploymentProfile` selects the exact machine value `O_OFFLINE_VERIFIER`, `L_LOCAL_AUTHOR`, `I_INSTITUTION_PRIVATE`, or `H_HOSTED`; O/L/I/H are display labels only;
- `verificationPolicy` names required structural/integrity/identity/process/replay checks and failure rules;
- `scientificProfile` names applicability, method, evidence, refusal and validation authority;
- `numericalEquivalenceProfile` names N0–N4 comparison semantics;
- `disclosureProfile` names exported content and metadata/privacy policy.

Every result still reports the six orthogonal assurance dimensions plus separate review summary, receipt standing and preservation status; a policy may require dimensions but cannot collapse them into one badge. `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` is authoritative for numerical/disclosure/long-term/TCK semantics; `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` owns profile types and aliases.

## 6. Standards mapping

| Standard | Use | Validation/migration issue | Limit |
|---|---|---|---|
| RO-Crate 1.3 | Research-object metadata/interchange | Publish a named FAR RO-Crate conformance profile and round-trip fixtures | Schema compliance does not prove content correctness |
| Workflow/Provenance Run Crate 0.5.0 | Workflow/run/step/input/output view | It references older RO-Crate vocabulary; publish mapping/version-loss policy | Run description does not prove correct method |
| W3C PROV | Entity/Activity/Agent and derivation graph | Validate constraints and preserve bundles/roles | PROV validity is historical consistency, not truth |
| in-toto Attestation/DSSE | Authenticated statements and stage subjects | Pin predicate type/mapping and signer authorization | Attested process can still be unsafe/invalid |
| Sigstore | External identity, transparency and offline bundle | Pin issuer/subject/workflow/root and handle revocation/offline | Signature cannot prove content is “good” |
| SLSA 1.2 | FAR-Lab's own source/build provenance | Candidate release gate only | Does not evaluate scientific claim |
| CWL 1.2.1 | Optional portable batch workflow | Use only where method shape fits and runners are compared | Not a stateful service/realtime guarantee |

Custom receipt semantics remain authoritative; standards projections include mapping-loss and validator results instead of declaring equivalence.

## 7. Binding declared science to execution

Policy/FEC compilation must emit a non-empty executable plan for every required check or a typed refusal. The run binds exact dataset snapshot, code/workflow, environment, parameters, seed/randomness, inclusion/exclusion, transformations, external database versions, `verificationPolicy`/`scientificProfile`/check implementations and deviations. The worker produces an execution attestation with an enforced `executionContainmentPolicy`, inputs/outputs and terminal status.

Rules:

- a non-empty string is not a resolved source;
- zero/placeholder hash is invalid;
- missing/deviant plan is not silently treated as conformant;
- operational failure never becomes a scientific vote;
- literature `supports/refutes` is evidence/review mode, not interchangeable with an experimental measurement;
- policy/detector versions support affected-result query and governed correction.

## 8. First scientific profile

Only an immutable tabular two-group analysis is proposed for v0. Its `scientificProfile` card declares question/estimand, population/sample, endpoint, group/comparator, inclusion/exclusion, transformation, missing-data rule, test/model, assumptions, effect size and interval, multiplicity, alpha/decision rule, seed, environment, data/code licensing, applicability/OOD/refusal, expected harms and review owner.

Required cases: positive, null, negative, boundary, malformed, missing/incomplete, OOD, leakage, confounded, contradictory, multiple-testing and intentionally non-reproducible. The system may assess only machine-checkable bindings/rules; domain interpretation and causal claims remain human.

## 9. Dataset/oracle protocol

Maintain five content-addressed sets: synthetic unit fixtures; adversarial/tamper corpus; consented/de-identified workflow recordings; expert-reviewed scientific gold set; independently held locked holdout. Each has data card, sampling frame, source/license/consent, transformations, leakage checks, version, split governance, annotators, disagreement/adjudication, permitted use, retention/withdrawal and owner.

High-risk scientific labels require two blinded domain reviewers and third adjudicator for unresolved disagreement; `UNRESOLVED` remains valid. Fixture/model-generated labels never become gold. Holdout access and threshold changes are audited; post-hoc changes create a new study/version and disclose the prior failure.

## 10. Scientific evaluation and gates

Report distributions and confidence intervals for sensitivity/specificity where meaningful, false confirmation/refutation, abstention correctness, calibration/reliability, subgroup/error slices, reviewer agreement, evidence-trace completeness, replay agreement and every exclusion.

Provisional pre-Beta targets, finalized by prospective power analysis:

- 100% reject or explicitly degrade every seeded required-member/digest/binding/signature/downgrade attack;
- 100% run-scope isolation in the declared concurrency set;
- ≥95% correct abstention on locked OOD/incomplete cases, with lower 95% confidence bound reported;
- zero critical false confirmation in locked high-risk negatives; if sample is too small for a useful bound, remain blocked;
- 100% required lineage-edge presence, with semantic correctness separately expert-reviewed;
- bit-identical canonical receipt payloads across verifier implementations;
- independent replay returns match or machine-readable bounded divergence, never silent pass.

Current achieved results for all these targets: **UNKNOWN/BLOCKED**. The existing 30-problem fixture report is an engineering regression seed only.

## 11. Model and policy governance

Models/agents may retrieve, summarize, classify candidate material or draft mappings only under versioned inputs/tools/prompts/budgets and human review. Save redacted trajectories and failure/cost evidence. Model self-score is not an oracle. Provider/model changes cannot alter deterministic receipt bytes unless an explicit reviewed input changes.

Profile/policy/check releases require named science owner, method card, implementation tests, validity report, version/digest, compatibility, monitoring, correction/withdrawal plan and independent approval. Expansion to each new domain repeats the whole gate; domain labels do not inherit validity.

## 12. Correction and residual limits

A discovered data, policy, detector, implementation, model or reviewer defect triggers freeze, affected-result enumeration, severity/communication, corrected successor or withdrawal, rerun under new version and public limitation where applicable. Audit history remains; privacy erasure follows scoped policy.

Even a fully compliant receipt cannot prove no evidence was omitted, data were honestly generated, the signer was truthful, the method captures the scientific construct, assumptions hold outside observed data, a causal claim is warranted, or misconduct did/did not occur.
