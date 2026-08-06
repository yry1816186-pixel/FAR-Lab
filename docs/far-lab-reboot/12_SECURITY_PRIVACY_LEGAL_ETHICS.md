---
status: reviewed
owner_role: security-privacy-legal-ethics-council
last_verified: 2026-08-05
scope: security threat model, privacy lifecycle, legal review gates, procedural justice, and misuse controls
authoritative_for:
  - security and privacy target boundary
  - legal and ethical stop conditions
  - high-risk threat acceptance gates
evidence_level: mixed
related_decisions: [DEC-002, DEC-003, DEC-004, DEC-005, DEC-009]
related_requirements: [REQ-SEC-001, REQ-SEC-002, REQ-PRIV-001, REQ-PRIV-002, REQ-TRUST-004, REQ-TRUST-005, REQ-WF-003, REQ-WF-004, REQ-WF-005]
supersedes: []
superseded_by: null
---

# 12 — Security, privacy, legal, and ethics

## 1. Current boundary and verdict

Observed code is suitable only for a **trusted-code, non-sensitive, single-user local demonstration**. It is not approved for hostile files/code, sensitive research, shared/multi-user service, clinical/personnel decisions or institutional investigations. Direct blockers include persisted shell-string scheduling (`src/cli/commands/schedule.ts:154-173`), no OS-enforced runner egress/resource isolation (`SEC-0002`), authentication without resource authorization/tenancy, global/latest run association (`API-0001`), plaintext request/response storage, no retention/deletion/appeal implementation and placeholder governance/contact (`GOV-0001`).

The complete threat register/control design is in `08_SECURITY_PRIVACY_THREAT_MODEL.md`; `PERMISSION_MATRIX.md` owns role/action decisions; `DATA_INVENTORY.md` owns lifecycle fields.

## 2. Assets, actors and trust zones

Critical assets: unpublished claims/data/code; credentials and signing keys; identity/consent/license; policies/detectors; receipt bytes and external anchors; scientific/human decisions; review/challenge history; deletion/legal-hold state; audit/release provenance; availability and reviewer safety.

Actors include honest/mistaken/malicious authors, reviewers, affected parties, local owners, institutional admins, support/security/privacy/science/release roles, model/tool/plugin/provider operators, compromised dependencies and external attackers. A signed author, logged-in user, local file, scientific skill, model output or internal service is not inherently trusted.

Trust zones:

1. untrusted import/package/static rendering;
2. local presentation/application;
3. authoritative domain/data stores;
4. isolated untrusted execution worker;
5. independent verifier/trust store;
6. optional external resolver/model/signing/transparency service;
7. future institution/tenant boundary.

Every crossing declares identity, purpose, data class, schema, digest, capability, network destination, authentication/authorization, logging, timeout and failure behavior.

## 3. Threat and control priorities

| Threat | Current evidence | Required control | Gate/owner |
|---|---|---|---|
| Consistent rehash/author-controlled forgery | README admits keyless boundary; V1 self-check | Explicit threat profile; external authorized signature/time/transparency; independent verifier; downgrade resistance | G3/G5, trust+security |
| Manifest/component removal/substitution | Integrity manifest optional in active verifier | Mandatory profile/member manifest; canonical roots; unknown-critical rejection; negative corpus | G3, protocol |
| Command injection/host execution | Scheduler `shell:true`; subprocess runner | Remove/replace shell strings; argv allowlist; unprivileged OS-isolated worker; no host credentials | G3, security/platform |
| Path/archive/symlink/device escape | File/package import surfaces | Pre-open descriptor-relative validation, normalized containment, symlink/junction/special-file rejection, quotas and safe extraction | G3, security |
| Network/secret exfiltration | Proxy clearing only; environment/provider inputs | OS egress deny/allowlist, secret-free worker, audience-scoped credentials, canary tests, no hidden fallback | G3/G5, security |
| Resource exhaustion/runaway loop | Ceilings checked but not imposed | Enforced CPU/memory/process/disk/time/output limits; cancellation/kill; backpressure | G3, platform |
| Cross-run/tenant/BOLA | Principal unused, no owner/tenant, global/latest | Identity as storage/authz constraint; deny-by-default object policy; existence-hiding errors; isolation tests | G5, data+security |
| Prompt/tool/skill poisoning | Optional agent/provider/extension concepts | Untrusted taint, deterministic permissions, pinned tools, no decision-root access, human acceptance, kill switch | Agent gate, security |
| Sensitive data persistence/leak | Plaintext requests/responses; no lifecycle | Minimize/classify/encrypt, explicit purpose/consent/license, local default, retention/deletion/backup/diagnostic policy | Before any sensitive data, privacy |
| False or irreversible adverse action | Verdict language, missing appeal/correction | Six assurance semantics; no automated sanction; evidence access; challenge/appeal; conflict review; successor/withdrawal | Before adverse use, product+legal |
| Supply-chain/release compromise | Mutable installer/stale checksums/build context | Pinned candidate, SBOM/provenance/signing, secret-excluded context, two-party verification and rollback | G3/G5, release+security |

## 4. Import, rendering, execution and network policy

- Inspect never executes. Active HTML/SVG/PDF/Markdown/script content is rendered in a non-scripted isolated viewer or downloaded with warning; remote resources are disabled.
- Import streams with member/total/count/compression/time limits, rejects traversal/absolute/ambiguous names, duplicate critical entries, symlinks/junctions/hardlinks/special files and TOCTOU-prone resolution. Original bytes are quarantined and hashed.
- Execution starts only from a reviewed workflow/executable digest and immutable inputs in the isolated worker described in architecture. Unsupported isolation fails closed; trusted-local fallback is separately named/degraded.
- Network is deny-by-default and enforced below the process; every allowed destination, method, purpose, data class and credential audience/scope is shown/audited. DNS/proxy/environment bypass and local metadata endpoints are adversarially tested.
- Output is size/count/type constrained, scanned and rehashed. Worker cannot write authoritative DB, sign, publish, notify or alter policy/verdict.

## 5. Identity, authorization and separation of duty

Profile L/O has one explicit local owner/trust store and loopback/read-only boundaries. It does not represent asserted reviewer identity as verified. Profile I/H remains disabled.

Future protected mode requires phishing-resistant admin auth, session/cookie/token controls, object/action authorization for every resource, tenant/run constraints in storage/object paths/cache/events, scoped service identities, key separation, rate limits and audit. `404`/`403` behavior prevents unauthorized existence disclosure.

Two-person/independent approval is required for policy/profile release, trust-root/key change, high-risk correction/withdrawal, privacy/legal-hold conflict, emergency break-glass and release. Break-glass is purpose/scoped/time-bound, cannot alter scientific bytes, notifies owners and receives retrospective review.

## 6. Cryptography and trust policy

Hashing/content addressing proves equality to a referenced digest under canonicalization. A signature proves control of a key/identity at validation time. Transparency proves a statement was logged. None proves evidence truth, signer honesty, authorization unless policy checks it, or scientific validity.

The signed subject names its object type and includes schema/profile/canonicalization versions, mandatory manifest/root, lifecycle relation and relevant policy/data/code/env/output digests through domain-separated bytes. Verification pins algorithm suite, issuer, subject identity **and authorization**, workflow/repository/environment, trusted-time context, transparency checkpoint, trust-root snapshot and revocation policy. It reports validity at sealing/renewal/current policy separately. Key generation/storage/access/rotation/revocation/recovery/destruction and lost-key behavior have named owners. Stripping, predicate/subject substitution, replay, valid-but-unauthorized signer, time ambiguity, trust-root rollback and downgrade are tested offline.

Algorithm migration is append-only: a renewal statement binds old root/evidence to a new suite before deprecation; it never rewrites old canonical bytes or repairs a compromise that predates trustworthy renewal. `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` owns the suite, time, archival and TCK contract.

## 7. Privacy lifecycle

Before collection, every data class records controller/processor/owner, purpose/legal or consent basis, necessity, sensitivity, source/accuracy, location, access, encryption, retention, backup, deletion, legal hold, third parties, cross-border transfer, license and rights route. Local telemetry/analytics is off by default.

Minimize receipt content: prefer approved typed metadata and selective disclosure, but do not publish a plain digest merely because raw bytes are hidden. Low-entropy values, filenames, exact sizes/times and stable identifiers can be guessed or correlated. Each item uses an approved `PUBLIC_DIGEST`, access-controlled, withheld-with-no-public-digest, or privacy-reviewed commitment/keyed-token class. A disclosure is a separately rooted derived receipt and cannot inherit source completeness. Raw prompts/responses, person-level data, file paths, identities and sensitive science are excluded unless necessary and explicitly governed. Logs/audit contain minimized opaque identifiers/decisions, not raw material or secrets. Diagnostic export is redacted and previewed.

Public transparency anchoring is opt-in for non-public projects after a metadata/linkability preview. Publishing a salt alongside a low-entropy commitment or reusing it across receipts is not accepted as hiding. Encryption/commitment/key loss, rotation, authorized opening and deletion limits are in the privacy threat model.

Rights workflow covers notice, access/export, correction, objection/restriction where applicable, deletion, consent withdrawal and appeal. Deletion distinguishes authoritative store, derived indexes, caches, backups, external anchors and shared/legally held evidence. The system states residual copies and expiry; it never claims cryptographic erasure it cannot establish.

A DPIA/legal-basis/jurisdiction/export-control/records/IRB or ethics determination is required before sensitive human, clinical, employment, dual-use, controlled or cross-border data. This design is not legal advice.

## 8. Procedural justice and ethics

- No automated adverse decision, misconduct label or accusation.
- Affected parties receive understandable scope, evidence basis, machine/human separation, access limits, opportunity to respond, independent/conflict-free review, correction/appeal, reason and export.
- False positives and false confidence are treated as harms; refusal and unresolved disagreement remain valid.
- Whistleblower/source protection, retaliation, power imbalance and discovery obligations require specialist process; v0 does not accept such cases.
- Model/provider output, citations and detector signals disclose uncertainty/version/provenance; automation bias is tested through comprehension studies.
- Sponsor/maintainer conflicts cannot privately change policies, thresholds or suppress corrections/negative results.

## 9. Security/privacy acceptance and incident response

Before external Alpha: complete hostile archive/file/path, command/postinstall, symlink/junction, secret canary, egress/DNS/proxy, resource/DoS, cross-run/BOLA, malicious receipt/signature/downgrade, prompt/tool/skill injection, log/diagnostic leak, retention/deletion/restore and correction/appeal tests. Independent review is required for the declared platforms and profiles.

Incident flow: detect → contain/freeze/revoke → preserve minimal evidence → assess affected data/receipts/versions/users → notify under policy/law → correct/withdraw/release fix → validate recovery → publish bounded postmortem/advisory. Named contacts, acknowledgement/escalation, drills and out-of-band channel must exist before an SLA is promised.

Residual risks always remain: compromised endpoints, coerced/lying authorized actors, undisclosed source evidence, unknown vulnerabilities, external-service failure, legal conflict and scientific uncertainty. They are visible limits, not marketing footnotes.
