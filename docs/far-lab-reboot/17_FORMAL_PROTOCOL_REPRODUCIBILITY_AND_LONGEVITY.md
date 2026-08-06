---
status: reviewed
owner_role: protocol-reproducibility-and-archive-council
last_verified: 2026-08-05
scope: normative receipt semantics for numerical reproducibility, selective disclosure, external references, cryptographic longevity, and conformance
authoritative_for:
  - numerical replay profiles and divergence semantics
  - selective-disclosure and commitment rules
  - long-term offline verification and algorithm renewal
  - receipt protocol conformance classes
evidence_level: mixed
related_decisions: [DEC-005, DEC-011, DEC-012, DEC-013, DEC-014]
related_requirements: [REQ-TRUST-001, REQ-TRUST-004, REQ-TRUST-005, REQ-DATA-003, REQ-SCI-003, REQ-PRIV-002, REQ-QUAL-007]
supersedes: []
superseded_by: null
---

# 17 — Formal protocol, reproducibility, disclosure, and longevity

Status: `TARGET_NORMATIVE_CONTRACT / NOT IMPLEMENTED / NOT CONFORMANCE-TESTED`  
Normative words: **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are requirements only for a future approved Receipt V2 specification. They do not describe current product behavior.

## 1. Why this redesign is still necessary

The first reboot design correctly separated provenance, integrity, identity, process conformance, replay, and scientific validity, but it left four implementation-critical phrases under-specified: “bounded divergence,” “partial disclosure,” “external trust material,” and “independent verifier.” Different teams could satisfy those phrases with mutually incompatible behavior and still claim compliance.

| ID | Classification | Conclusion | Evidence / implication |
|---|---|---|---|
| PF-01 | FACT | The repository has deterministic seeded statistical primitives; for example `permutationTestMeanDifference` requires a safe-integer seed and uses an explicitly implemented PRNG. | `src/statistics/permutation_test.ts:20-29,65-81,101-143,147-171` |
| PF-02 | FACT | Current canonical JSON rejects non-finite numbers and uses stable key ordering, while ProofEnvelope V2 covers a selected field set with SHA-256. | `src/evidence_log/hasher.ts:24-50,69-88`; `src/proof_envelope/v2/proof_hash.ts:44-76` |
| PF-03 | FACT | Cross-language tests exist for selected proof-hash paths, but they use the repository Python mirror and a shared fixture shape. | `tests/proof_envelope/v2/cross_lang.test.ts:21-66`; this is useful differential evidence, not clean-room protocol independence. |
| PF-04 | FACT | The anti-theater fixture records only that tolerance was frozen; it does not encode a general comparison metric, units, absolute/relative/ULP bounds, aggregation, or platform scope. | `tests/fixtures/anti_theater/golden_vectors.ts:284-288,523-526` |
| PF-05 | FACT | The annex targets JCS while the current Proof V2 path normalizes selected text to NFC. RFC 8785 requires parsed strings to be preserved without Unicode normalization and constrains interoperable JSON numbers to IEEE-754 semantics. | `07_DATA_EVIDENCE_SCIENCE.md:173-181`; `src/proof_envelope/v2/proof_hash.ts:29-41`; [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) |
| PF-06 | FACT | Major numerical libraries do not promise bit-identical results across every release/platform/backend from a seed alone. | [PyTorch reproducibility note](https://docs.pytorch.org/docs/stable/notes/randomness); [NumPy Generator](https://numpy.org/doc/stable/reference/random/generator.html) |
| PI-01 | INFERENCE | Bit-identical receipt serialization is plausible for the covered JSON subset, but bit-identical scientific computation across CPU, BLAS, accelerator, runtime, and reduction order is not established. | PF-01..04 plus absence of a `numericalEquivalenceProfile` and execution-environment contract; must be tested, not inferred. |
| PASM-01 | ASSUMPTION | A portable receipt can remain useful when some raw research material cannot be disclosed. | Requires observed author–reviewer workflows and privacy/legal validation. |
| PU-01 | UNKNOWN | Which scientific quantities genuinely require bitwise identity versus bounded numerical or statistical agreement. | Must be decided per approved `scientificProfile` before implementation. |
| PR-01 | RECOMMENDATION | Freeze the contracts below before producer, verifier, runner, or UI work is accepted. | Prevents incompatible parallel implementations and false “reproduced” claims. |

## 2. Protocol layering and signed subjects

A receipt MUST distinguish five byte/semantic objects. None may silently substitute for another.

| Object | Canonical subject | Purpose | Does not prove |
|---|---|---|---|
| Source receipt | `sourceReceiptRoot` over its mandatory manifest | Complete sealed object under its declared `disclosureProfile` | That undisclosed source material never existed |
| Disclosure receipt | `disclosureReceiptRoot` over a newly sealed disclosure manifest | Portable subset plus derivation statement and proofs | Full source-receipt completeness or absence of omitted evidence |
| Execution attestation | Digest of inputs, plan, environment, enforcement and outputs | What a named runner states it executed | Scientific adequacy or honest original data |
| Replay attestation | Digest of replay request, environment, outputs and comparison | What an independent replay observed | Identity/authenticity unless separately signed and authorized |
| Lifecycle statement | Digest of predecessor, successor, event and authority | Correction, supersession, withdrawal, renewal, or disclosure relationship | Erasure of old copies or reversal of past facts |

Every signature or timestamp MUST name its subject type, canonicalization ID, digest algorithm ID, digest bytes, trust-policy ID, and intended use through domain-separated bytes. A raw digest without a subject type is not a receipt signature.

## 3. Reproducibility is a vector, not a Boolean

### 3.1 Four separate outcomes

| Outcome | Question | Example result vocabulary |
|---|---|---|
| Serialization equality | Did both implementations construct identical canonical protocol bytes? | `BYTE_EQUAL`, `BYTE_DIFFERENT`, `NOT_COMPARABLE` |
| Computational replay | Did the declared execution reproduce under a named `numericalEquivalenceProfile` and environment contract? | One of N0–N4 below plus divergence object |
| Inferential agreement | Did the replay lead to the same preregistered decision boundary? | `SAME_DECISION`, `DIFFERENT_DECISION`, `NO_DECISION` |
| Scientific replication | Did an independently collected study support the same estimand? | Human-governed study result; never inferred from replay |

The UI, API, CLI, receipt, and reports MUST NOT render any one of these as the undifferentiated word “reproduced.”

### 3.2 Numerical equivalence profiles

Each output being compared MUST name one `numericalEquivalenceProfile`. A receipt MAY contain different numerical-equivalence profiles for different outputs.

| `numericalEquivalenceProfile` class | Required condition | Pass semantics | Typical use | Forbidden shortcut |
|---|---|---|---|---|
| `N0_EXACT_CANONICAL` | Pure canonical/integer/decimal/byte operation under a frozen algorithm | Exact bytes or exact integer/decimal value | Manifest roots, rule traces, counts | Floating result rounded to appear equal |
| `N1_BITWISE_EXECUTION` | Exact runtime, OS/arch, code, dependency/image, numerical-library, hardware and execution settings are available | Output bytes are identical | Qualification of a tightly pinned reference platform | Generalizing one machine’s result to other platforms |
| `N2_BOUNDED_NUMERIC` | A metric-specific comparison rule and tolerances were preregistered and bound before the source result | Every declared comparison passes its exact rule | Cross-runner floating-point outputs | A Boolean `toleranceFrozen` with no rule or post-hoc widening |
| `N3_STATISTICAL_AGREEMENT` | A distributional/repeated-run protocol, seed schedule, sample size and decision rule were preregistered | The comparison study meets its powered acceptance rule | Stochastic algorithms or Monte Carlo estimates | One matching seed or overlapping point estimates |
| `N4_OBSERVED_ONLY` | Inputs/results are preserved but replay conditions are absent, prohibited, or inherently unavailable | No replay pass; preservation/availability status only | Human observation, inaccessible instrument, withdrawn dependency | Relabeling provenance as reproduction |

`N0`–`N4` are categories, not ascending quality scores. `N1` can reproduce a flawed computation exactly; `N3` can be scientifically useful without bitwise identity.

### 3.3 Mandatory execution fingerprint

For `N1`–`N3`, the receipt MUST bind or explicitly mark unavailable:

- operating system, kernel, architecture, CPU model/feature set and virtualization class;
- runtime/compiler/interpreter identifiers, exact dependency lock and executable/container/image digests;
- libc, math library, BLAS/LAPACK/FFT vendor and versions, accelerator/driver/runtime, and numerical backend;
- floating-point precision, rounding/denormal/FMA policy when observable, integer width and overflow policy;
- thread/process count, scheduler or deterministic-execution mode, reduction/order semantics, and parallel stream partitioning;
- locale, timezone, character encoding, unit registry and parser versions;
- RNG family/algorithm/version, seed encoded as exact bytes, stream/substream ID, seed schedule and draw-count policy;
- input ordering, missing-data handling, transformation graph, parameters, stopping rules and retry policy;
- output schema, unit, precision, raw stored representation and comparison-policy digest.

An environment field can be `UNAVAILABLE`, but the `numericalEquivalenceProfile` MUST then yield the exact published unavailable/not-comparable result. Empty strings, “latest,” ambient defaults, and mutable tags are invalid bindings.

A seed alone is never a randomness manifest. The bound randomness object also names the bit generator and version, full initialization/seed-sequence derivation, state or reconstruction rule, domain separation, worker/substream assignment, sampling API and parameters, call/draw ordering, parallel scheduling model, deterministic backend switches, retry/resampling behavior and any external entropy. It declares either `TRAJECTORY_REPLAY` (the stream and draw sequence must match) or `DISTRIBUTIONAL_REPLAY` (a powered repeated-run rule applies). Changing generator, call order or worker partition is a typed `RANDOMNESS_DIVERGENCE`, not an unexplained output mismatch.

### 3.4 Frozen comparison rule

A comparison rule MUST be part of the scientific/policy digest before the original execution. It MUST define:

1. exact subject paths and units;
2. scalar, element-wise, vector-norm, interval, distributional, or decision comparison;
3. preprocessing allowed solely for comparison, including alignment and unit conversion;
4. inclusive/exclusive boundary behavior, signed zero, underflow/overflow, NaN, infinity and missing values;
5. absolute, relative and optional ULP tolerances as explicit canonical decimals;
6. aggregation rule: all elements, maximum failures, weighted proportion, or powered statistic;
7. platform scope and reference implementation/version;
8. scientific justification and owner;
9. result when a comparison cannot be performed.

If the selected scalar rule is absolute-plus-relative, its only valid generic form is:

`abs(actual - expected) <= max(absTolerance, relTolerance * max(abs(actual), abs(expected)))`

The `numericalEquivalenceProfile` MUST state whether this rule is used; it is not a universal default. Unit conversion occurs before comparison under a named exact conversion. NaN never equals NaN unless the `scientificProfile` explicitly defines a categorical missing-value comparison, in which case it is not a numeric match.

### 3.5 Divergence object

Every replay emits a machine-readable divergence object even on success:

| Field | Requirement |
|---|---|
| Identity | source/replay receipt, output/component/path, comparison-policy and runner IDs |
| Expected/actual | canonical raw representation, unit, type, shape and digest; sensitive values may be access-controlled |
| Rule | `numericalEquivalenceProfile`, metric, preprocessing, absolute/relative/ULP/distribution limits and aggregation |
| Observed delta | exact computed delta/statistic, failed index/count and worst case |
| Decision | `MATCH`, `BOUNDED_MATCH`, `DIVERGED`, `NOT_COMPARABLE`, or `UNAVAILABLE` |
| Reason | stable reason code, environment differences, missing dependencies, platform mismatch and operator action |
| Audit | timestamps, attempts, tool/environment digests and signature/authorization where applicable |

Inferential agreement is calculated separately. A numerically bounded match that crosses the preregistered scientific threshold MUST show `DIFFERENT_DECISION`; it cannot be presented as successful scientific reproduction.

## 4. Selective disclosure and digest privacy

### 4.1 A disclosure is a derived receipt

Removing or redacting files changes bytes and creates a new `disclosureReceiptRoot`. The disclosure manifest MUST contain:

- `sourceReceiptRoot`, source Receipt V2 schema/`disclosureProfile` versions and source issuer where known;
- disclosure policy ID/version/digest and actor/authorization;
- included component identities and inclusion proofs where the source construction supports them;
- omitted categories and reason codes, without leaking their values;
- any transformations/redactions and the fact that transformed bytes are not the source bytes;
- new manifest/root, signature/anchor material and created time;
- explicit assurance limitations and access-request route where appropriate.

An inclusion proof establishes that a disclosed member was committed by a source root. It does **not** establish that the disclosed subset is complete, that omitted evidence is favorable, or that no conflicting material existed. The assurance vector MUST therefore report `DISCLOSED_SUBSET`, never “complete receipt,” unless the source `disclosureProfile` itself defined and proved completeness for that category.

### 4.2 Low-entropy values and correlation risk

A plain hash is often guessable when the input domain is small (diagnosis, yes/no answer, short identifier, small table cell) and stable public digests enable cross-receipt correlation. Therefore:

| Need | Permitted construction | Privacy consequence |
|---|---|---|
| Public high-entropy byte identity and intentional deduplication | Domain-separated content digest | Equality and linkability are intentional and disclosed |
| Commit now, reveal to an authorized reviewer later | Domain-separated commitment over canonical value plus a cryptographically random per-value nonce | Nonce is disclosed only with the authorized opening; loss makes opening impossible |
| Private equality within a bounded institution/`deploymentProfile` | Versioned keyed token under a separately governed key | Not a public integrity proof; key compromise/rotation and affected-set analysis required |
| No justified equality or future opening need | Omit value and digest; disclose typed absence/restriction | Lowest leakage; weaker independent checking is explicit |

Salting is not privacy magic: publishing the salt alongside a low-entropy value commitment usually restores dictionary-testability. Reusing a salt creates linkability. Encryption without key lifecycle, access policy, metadata minimization and deletion semantics is not an acceptable substitute.

### 4.3 Disclosure policy acceptance

Before Alpha, tests MUST cover member omission, path substitution, reordered proofs, wrong source root, stale lifecycle state, transformed-content masquerade, nonce reuse, dictionary attack on fixture domains, cross-receipt correlation, unauthorized opening, disclosure withdrawal, and accessible explanation. External transparency publication is opt-in for non-public projects because an immutable public log can reveal timing and stable linkage even without raw content.

## 5. External references and availability

Every non-embedded dependency or research material MUST carry:

`referenceId, resolverScheme, canonicalLocator, sourceAssertion, capturedAt, expectedDigestAlgorithm, expectedDigest, expectedSize/media/schema, version/revision, license/access class, availability policy, permitted mirrors, resolver implementation/version, and last observed result`.

A resolver returns one of `AVAILABLE_MATCH`, `AVAILABLE_MISMATCH`, `ACCESS_DENIED`, `UNAVAILABLE_TEMPORARY`, `UNAVAILABLE_PERMANENT`, `RESOLVER_UNSUPPORTED`, or `LICENSE_BLOCKED`. Only `AVAILABLE_MATCH` contributes current byte availability. Network failure, login failure, DOI existence, matching filename, or prior availability never becomes a match.

Each `scientificProfile` and replay request MUST name through an `externalReferencePolicy` whether references must be embedded, may be mirrored, may be supplied out-of-band, or may remain unavailable. A self-contained claim is forbidden if any critical executable input is reference-only. Capture of a public reference does not imply redistribution rights.

## 6. Cryptographic agility and long-term verification

### 6.1 Algorithm suite registry

Every cryptographic use MUST name a versioned suite containing:

- canonicalization, digest, Merkle/tree construction and domain-separation rules;
- signature/container algorithms and exact signed payload;
- certificate/key identity, authorization and trust-policy rules;
- trusted-time and transparency proof formats;
- validation-at-signing and validation-at-verification semantics;
- status, introduction/deprecation/prohibition dates and migration target;
- test vectors, security owner and incident/withdrawal procedure.

Unknown algorithms, ambiguous names, prohibited parameters, missing domain separation, unknown critical extensions, or silent fallback fail closed. “SHA-256” alone is insufficient to define a receipt protocol because it says nothing about canonical bytes, tree shape or signed subject.

### 6.2 Archival verification package

A `preservationPolicy` SHOULD preserve, subject to privacy and licensing:

- receipt/disclosure roots and canonical manifests;
- signature objects, certificate/key chains, issuer/subject/workflow policy and authorization evidence;
- trusted timestamp/transparency inclusion proof, checkpoint and consistency material;
- trust roots and validation-policy snapshot used at sealing;
- revocation/compromise information available for the relevant validation time;
- algorithm-suite specification and offline verifier/TCK source or archival executable recipe;
- all embedded components and explicit external-reference availability statements;
- renewal attestations and lifecycle/correction lineage.

Verification reports MUST separate `VALID_AT_SEALING_POLICY`, `VALID_AT_RENEWAL_POLICY`, `VALID_UNDER_CURRENT_POLICY`, `INVALID`, and `INDETERMINATE`. Certificate expiry today does not automatically mean a signature was invalid at signing; conversely, historical validity does not make a currently prohibited algorithm safe.

### 6.3 Renewal without history rewriting

Before a suite becomes unsafe or unavailable, an authorized archival process MAY issue a renewal statement that binds the old root, old suite, prior verification evidence, new suite, new root/attestation, renewal time, authority and reason. Renewal appends evidence; it never changes the old receipt or conceals that verification depends on a later witness. Compromise before renewal keeps status `INDETERMINATE` or `INVALID` under the affected policy—renewal cannot manufacture a trustworthy past.

Key compromise, trust-root removal, timestamp-log failure, algorithm break, unavailable external material and verifier obsolescence each trigger affected-receipt enumeration, visible status change, notification/correction policy and a tested recovery decision.

## 7. Protocol conformance kit (TCK)

### 7.1 Deliverables that jointly define conformance

No implementation library is the specification. A versioned TCK release MUST include:

1. normative prose with registered terms, code points and threat/claim boundaries;
2. machine schemas and semantic constraints that schemas cannot express;
3. canonical byte and digest vectors with generation provenance;
4. positive, negative, mutation, downgrade and ambiguity corpora;
5. archive/path/Unicode/duplicate-key/size/resource hostile corpus;
6. numeric fingerprints, comparison vectors and divergence reports for N0–N4;
7. disclosure/commitment/opening/linkability vectors;
8. signature, authorization, trusted-time, revocation, expiry, renewal and crypto-suite vectors;
9. migration and unknown-critical-field vectors;
10. test runner protocol, deterministic result schema, coverage manifest and known limitations.

### 7.2 Conformance roles

| Class | Required capability | Independence condition |
|---|---|---|
| `P-PRODUCER` | Produce valid complete and disclosure receipts | Cannot self-award verifier conformance |
| `P-STRUCTURAL-VERIFIER` | Parse safely, canonicalize and verify internal integrity/offline package rules | Tested against hostile corpus |
| `P-TRUST-VERIFIER` | Apply signature/authorization/time/renewal policy | Trust policy and roots explicit; network optional, not ambient |
| `P-REPLAY-RUNNER` | Enforce `executionContainmentPolicy` plus `numericalEquivalenceProfile` and emit replay/divergence attestation | Enforcement evidence validated per supported platform |
| `P-MAPPER` | Round-trip supported RO-Crate/PROV/attestation projections with loss report | External parser/validator included |
| `P-LIFECYCLE` | Interpret successor/withdrawal/renewal/disclosure relationships | Never rewrites sealed history |

At least one qualifying verifier MUST be implemented by a team that did not implement the producer and MUST NOT import the producer’s canonicalization, validation, schema-wrapper or hashing library. A second language alone is insufficient if both implementations copy the same executable logic or fixtures without independent spec review.

### 7.3 Test method and release rule

- Vectors are reviewed before implementation outputs are revealed where feasible.
- Differential fuzzing compares implementations, but disagreement opens a spec-ambiguity issue; majority behavior does not decide the standard.
- Every normative clause maps to at least one positive and one failure test, or records why it cannot be mechanized.
- Corpus provenance distinguishes manually reasoned vectors, generated mutations and historical defects.
- The TCK publishes false-positive/false-negative limitations, skipped cases and platform matrix.
- A protocol release cannot be marked stable while two conforming implementations disagree on canonical bytes, critical-field handling, downgrade, disclosure provenance or trust decision.
- Conformance badges name class, protocol/TCK version, platform, verification policy, trust-time context and test report digest. There is no generic “FAR verified” badge.

## 8. Standards projection profiles

Shared standards are projections or authenticated containers around the FAR receipt; none replaces FAR’s canonical semantics.

### 8.1 RO-Crate and Workflow Run RO-Crate

The current reference versions cannot be described as one invented combined conformance profile: RO-Crate 1.3 and Workflow Run Crate 0.5’s RO-Crate 1.1-era terms are separately versioned. The mapping registry MUST therefore name, for each projection, the base specification, JSON-LD context snapshot/digest, profile URI/version, where `conformsTo` appears, extension URIs, embedded/reference policy and field-level mapping loss.

Initial projection candidates are separate:

- `FAR_RO_CRATE_1_3_PROJECTION`, validated as a named RO-Crate 1.3 profile;
- `FAR_WRROC_0_5_PROJECTION`, preserving its declared base/context semantics rather than silently relabeling it 1.3.

FAR→projection→FAR tests return exact supported fields plus a loss/hidden/unrepresentable report. Parseable JSON-LD or a successful external validator does not upgrade receipt integrity or scientific validity. Sources: [RO-Crate 1.3 profiles](https://www.researchobject.org/ro-crate/specification/1.3/profiles.html) and [Workflow Run Crate 0.5 profile](https://www.researchobject.org/workflow-run-crate/profiles/workflow_run_crate/).

### 8.2 PROV and RDF byte boundaries

The registry distinguishes:

1. canonical FAR JSON bytes/root—the receipt authority;
2. raw RDF serialization bytes/digest—file integrity only;
3. an optional canonical RDF dataset digest under an exact canonicalization algorithm ID—semantic dataset comparison within that algorithm;
4. PROV constraint validation—consistency of the mapped provenance model only.

Two Turtle files may have different raw digests yet the same canonical RDF dataset digest. Blank nodes, named graphs, language tags, cross-bundle lifecycle links and canonicalization resource limits are test vectors. PROV `Entity`/`Activity`/`Agent`, use/generation/invalidation, role and delegation mappings are versioned; FAR correction/withdrawal constraints remain additional FAR rules. Neither [PROV constraints](https://www.w3.org/TR/prov-constraints/) nor [RDF Dataset Canonicalization](https://www.w3.org/TR/rdf-canon/) proves an activity occurred truthfully or a scientific conclusion is valid.

### 8.3 in-toto, DSSE and Sigstore

An authenticated projection MUST freeze:

- Statement and envelope versions, DSSE `payloadType`, FAR `predicateType`, subject type and exact FAR root/digest algorithm;
- which receipt/disclosure/execution/replay/lifecycle fields are predicates and which scientific conclusions are prohibited from the attestation;
- issuer, subject/SAN, repository, ref, workflow digest, audience, environment and threshold-authorization rules;
- certificate chain, trust-root snapshot, transparency-log ID/checkpoint/inclusion/consistency material, trusted timestamp and bundle versions;
- offline verification inputs, revocation/time policy and failure-axis reason codes.

A valid but unauthorized identity fails `identity` authorization without corrupting the separately reported byte-integrity result. Predicate swap, subject mismatch, wrong repository/ref/workflow, insufficient threshold, missing time/log material and downgrade are distinct vectors. Public transparency logs receive only disclosure-reviewed opaque roots; claim metadata, filenames, small-domain digests and private timing are not published by default. See [in-toto Attestation envelope](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md) and [Sigstore threat model](https://docs.sigstore.dev/about/threat-model/).

## 9. End-to-end protocol acceptance table

| ID | Given / action | Required observable result | Forbidden result | Gate |
|---|---|---|---|---|
| PA-01 | Same exact canonical input in two clean implementations | `N0_EXACT_CANONICAL`, identical bytes/root | Locale/runtime-dependent hash | G2/G3 |
| PA-02 | Same floating workflow on different declared BLAS/thread environment contracts | N2/N3 comparison with full divergence object | Silent exact-pass or hidden environment difference | G3/G5 |
| PA-03 | Result is within numeric tolerance but crosses decision threshold | `BOUNDED_MATCH` plus `DIFFERENT_DECISION` | “Scientific reproduction passed” | G5 |
| PA-04 | Critical member is omitted for disclosure | Valid derived disclosure plus omitted-category limitation | Source receipt shown as complete | G3/G4 |
| PA-05 | Reviewer guesses a low-entropy hidden value | Published package does not expose reusable raw digest/nonce | Dictionary-testable commitment by default | G3/G5 |
| PA-06 | External input disappears | `UNAVAILABLE_*`; self-contained/replay assurance degrades | Prior digest treated as current availability | G3 |
| PA-07 | Signing certificate expires after trusted signing time | Historical/current policy outcomes reported separately | Unqualified valid/invalid Boolean | G3/G5 |
| PA-08 | Digest/signature suite approaches deprecation | Append-only renewal links old and new evidence | Old root rewritten or compromise concealed | G5/G6 |
| PA-09 | Producer and clean-room verifier see hostile/ambiguous package | Same fail-closed reason class | Parser crash, downgrade or different root | G3 |
| PA-10 | TCK cannot mechanize a scientific-validity clause | Clause remains expert-study gate with explicit evidence | Unit test relabeled as science validation | G5 |

## 10. Change control and unresolved decisions

The protocol owner may not freeze V2 until the following are decided by named accountable roles:

| Decision | Current state | Owner / required evidence |
|---|---|---|
| Canonical JSON standard and handling of large integers/decimals | OPEN | Protocol owner; cross-language hostile vectors |
| Merkle/tree construction and disclosed-subset derivation | OPEN | Protocol + privacy; inclusion/non-completeness proof review |
| Initial signature/time suite and offline trust bundle | OPEN | Security + archival owner; crypto review and interop vectors |
| Supported N1 platform fingerprints and N2/N3 comparison policies | OPEN | Platform + science; cross-runner characterization |
| Sensitive commitment/linkability policy | OPEN | Privacy/legal/security; attack exercise and DPIA |
| External-reference mirror/licensing rules | OPEN | Data/legal; representative asset review |
| TCK governance, trademark/badge authority and appeals | OPEN | OSS governance; two-maintainer and conflict policy |

## 11. What this specification still cannot guarantee

This design can make implementation ambiguity and false assurance testable. It cannot guarantee that future code is correct, that a cryptographic primitive remains secure indefinitely, that an issuer is honest, that undisclosed evidence does not exist, that a replayed method is scientifically valid, or that independent teams will actually remain independent. Those claims require candidate-bound implementation evidence, adversarial review, real scientific validation, and continuing governance.
