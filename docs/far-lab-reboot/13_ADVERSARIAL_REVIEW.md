---
status: reviewed
owner_role: independent-review-chair
last_verified: 2026-08-05
scope: eight-perspective adversarial review of repository evidence and reboot specification
authoritative_for:
  - adversarial veto findings
  - rescue paths
  - review disposition
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-010]
related_requirements: [REQ-PROD-001, REQ-TRUST-002, REQ-SCI-001, REQ-SEC-001, REQ-OPS-001]
supersedes: []
superseded_by: null
---

# Adversarial review — eight veto perspectives

Review date: 2026-08-05. Scope: observed repository snapshot plus the target design. The review does not turn a design into implementation evidence. Each perspective follows the mandated structure exactly: three veto defects, three dangerous assumptions, one omission, one falsifiable experiment, one minimum rescue path and one conclusion.

Labels: **FACT** = direct repository/run evidence; **INFERENCE** = reasoned consequence; **UNKNOWN** = evidence missing; **RECOMMENDATION** = future test or design response.

## 1. Product strategist

### Three veto defects

1. **FACT:** no real target-user interview, workflow adoption, repeat-use, payer or funding evidence exists. **INFERENCE:** technical relevance does not establish a problem worth changing a scientific workflow for.
2. **FACT:** “AI4S lie detector/universal adjudication” conflicts with repository disclaimers and fixture-only science. **INFERENCE:** the original product thesis cannot continue.
3. **FACT:** 28-domain and competitive-leadership claims have no same-condition independent study. **INFERENCE:** neither breadth nor differentiation is established.

### Three dangerous assumptions

1. **UNKNOWN:** authors will accept disclosure, freezing and handoff cost.
2. **UNKNOWN:** independent reviewers can verify without author help and will change a downstream decision.
3. **INFERENCE:** file/test/detector/document volume may be mistaken for a moat despite weak governance and a copyable protocol.

### One omission

**FACT:** the initial payer, workflow-change authority and long-term maintainer are unknown.

### One falsifiable experiment

**RECOMMENDATION:** run eight real non-sensitive author→reviewer handoffs. If fewer than five cause a rerun, correction, conditional acceptance or specific evidence request—and fewer than three pairs repeat—stop the standalone-product expansion.

### One minimum rescue path

**RECOMMENDATION:** retain one local-first author–reviewer receipt task, explicitly excluding truth, misconduct and broad detection.

### Conclusion

**PIVOT, DO NOT EXPAND.** Reject the universal adjudication product; conditionally preserve the receipt wedge.

## 2. Skeptical scientist/domain expert

### Three veto defects

1. **FACT:** all benchmark cases are `offline_replay(fixture)` and `unreviewed`. **INFERENCE:** there is no scientific accuracy evidence.
2. **FACT:** FEC inputs may be placeholders/empty and literature support/refutation can feed verdict vocabulary. **INFERENCE:** repeatable output is not demonstrated observation or valid inference.
3. **FACT:** hash/provenance cannot establish source truth, absence of omission, measurement validity or rule adequacy. **INFERENCE:** “proof” language creates false authority.

### Three dangerous assumptions

1. **INFERENCE:** determinism is being mistaken for scientific validity.
2. **INFERENCE:** domain labels are being mistaken for external validity.
3. **INFERENCE:** mutation detection is being mistaken for detection of selection bias, threshold fishing or an internally consistent forged history.

### One omission

**FACT:** there is no independently governed gold set/locked holdout, error-cost model, calibration result or reviewer-agreement study.

### One falsifiable experiment

**RECOMMENDATION:** preregister one two-group profile and blind independent experts on locked positive/null/negative/OOD/incomplete/confounded data. Any critical false confirmation, holdout leakage or failure of the preregistered abstention gate vetoes that profile.

### One minimum rescue path

**RECOMMENDATION:** expose provenance, integrity, identity, conformance, reproduction and scientific verdict separately; default to abstention and call every result a bounded policy check.

### Conclusion

The current system may be called an engineering verification prototype, not a scientific adjudicator or cross-domain valid system.

## 3. Author/reviewer/affected user

### Three veto defects

1. **FACT:** observed long hypothesis/API work lacks durable task, cancellation, idempotency and reliable recovery. **INFERENCE:** the author cannot know whether retry is safe.
2. **FACT:** active `.far-proof` omits code/dependencies and makes full integrity conditional. **INFERENCE:** a reviewer cannot reliably complete clean-room verification.
3. **FACT:** current Web/API does not close challenge, appeal, correction, withdrawal, retention and deletion. **INFERENCE:** a contested result has no procedural remedy.

### Three dangerous assumptions

1. **UNKNOWN:** researchers can install the CLI, satisfy schemas and preserve exact environments.
2. **UNKNOWN:** authors disclose unfavorable runs/deviations rather than curating the best result.
3. **UNKNOWN:** reviewers can distinguish integrity, conformance, reproduction and science without author explanation.

### One omission

**FACT:** there is no implemented evidence-access, challenge, independent-review and correction journey for an affected or less-powerful party.

### One falsifiable experiment

**RECOMMENDATION:** five authors produce receipts from their own material, three independent reviewers verify without author state, and five contested cases traverse evidence request/correction/appeal. Any overwritten history, blocked appeal or majority verification failure vetoes pilot use.

### One minimum rescue path

**RECOMMENDATION:** ship only a read-only static viewer plus offline CLI first; correction creates an immutable successor and human process owns all decisions.

### Conclusion

The current repository is an expert local demo, not a closed author–reviewer service.

## 4. UX/accessibility reviewer

### Three veto defects

1. **FACT:** the experience specification is a target, not implementation evidence. **INFERENCE:** current usability cannot be inferred from the new documents.
2. **FACT:** current wizard/hero/demo include simulation/fixtures, and the D3 visualization lacks complete keyboard/nonvisual equivalence. **INFERENCE:** showcase states can mislead and exclude users.
3. **UNKNOWN:** no full keyboard, screen-reader, 400% zoom, dynamic-status or disabled-user task result exists.

### Three dangerous assumptions

1. **INFERENCE:** CLI cannot be treated as an accessibility fallback without disabled-user validation.
2. **INFERENCE:** automated accessibility checks/ARIA presence do not establish WCAG 2.2 AA.
3. **INFERENCE:** mixed Chinese/English strings do not establish complete localization or trust-boundary comprehension.

### One omission

**FACT:** there is no trust-calibration/comprehension study for authors, reviewers and affected parties.

### One falsifiable experiment

**RECOMMENDATION:** complete create, verify, request evidence, challenge and export using keyboard-only, NVDA+Firefox, VoiceOver+Safari and 200%/400% zoom. Require 100% critical-task completion, zero critical/serious defects and ≥90% correct trust-boundary comprehension.

### One minimum rescue path

**RECOMMENDATION:** remove simulated progress/showcase navigation; deliver a semantic static viewer, table/tree alternative to graphs and the CLI.

### Conclusion

No current claim of accessibility, usability or complete bilingual experience is permitted.

## 5. Principal engineer/architect

### Three veto defects

1. **FACT:** V1 is same-stack self-check; manifest may be absent; code is not embedded. **INFERENCE:** the trust root cannot support “independent proof.”
2. **FACT:** global/latest reads and label-only `runId` coexist with synchronous long work. **INFERENCE:** safe concurrency/recovery are structurally unproven.
3. **FACT:** authenticated principal is not used for resource authorization and schema lacks owner/tenant. **INFERENCE:** institutional mode requires domain/storage redesign, not middleware alone.

### Three dangerous assumptions

1. **INFERENCE:** append-only hash is treated as one answer to integrity, authentication and truth.
2. **INFERENCE:** Web/API/CLI breadth is treated as one platform despite semantic/state/permission drift.
3. **UNKNOWN:** current storage/proof/verdict formats can evolve to protected multi-user operation without breaking compatibility.

### One omission

**FACT:** no frozen mandatory-member Receipt V2 with explicit profiles and an independent implementation governs the active path.

### One falsifiable experiment

**RECOMMENDATION:** run one kill suite: remove manifest, substitute/re-hash all content, downgrade version, execute two concurrent runs, crash/retry, and attempt a duplicate seal. Any silent pass, cross-run association or duplicate current receipt vetoes the candidate architecture.

### One minimum rescue path

**RECOMMENDATION:** freeze local single-run V2 with mandatory manifest, six assurances, scoped identities and fail-closed compatibility; disable interfaces that cannot preserve it.

### Conclusion

The components are valuable, but the current composition is not a closed trust architecture.

## 6. Security/privacy/legal reviewer

### Three veto defects

1. **FACT:** scheduler uses `shell:true`; science runner does not impose OS egress/CPU/memory isolation. **INFERENCE:** hostile input risks host execution and exfiltration.
2. **FACT:** authentication lacks object authorization/tenancy and global/latest access can cross-associate runs. **INFERENCE:** shared deployment risks BOLA/cross-scope disclosure.
3. **FACT:** model requests/responses can persist plaintext without classification, retention, deletion or legal-hold lifecycle. **INFERENCE:** sensitive/person data use is unacceptable.

### Three dangerous assumptions

1. **INFERENCE:** subprocess/Docker/name “sandbox” is mistaken for verified containment.
2. **INFERENCE:** logged in is mistaken for authorization, isolation and separation of duties.
3. **INFERENCE:** a hash chain is mistaken for consent, legal basis, author identity or third-party authenticity.

### One omission

**FACT:** accountable security/privacy/legal owners and a tested security contact/incident chain do not exist; DPIA/ethics/legal applicability is `UNKNOWN`.

### One falsifiable experiment

**RECOMMENDATION:** in an isolated lab inject shell/archive/path/symlink, secret canary/egress, cross-scope IDs and deletion/restore cases. Any escape, leak, unauthorized read or false deletion fails the profile.

### One minimum rescue path

**RECOMMENDATION:** restrict to local, offline, non-sensitive, trusted code; remove/disable scheduler and untrusted execution; prohibit hosted/multi-user/clinical/adverse claims.

### Conclusion

Current controls support only a restricted local demonstration, not sensitive or shared high-risk use.

## 7. SRE/release/open-source governance reviewer

### Three veto defects

1. **FACT:** the snapshot is heavily dirty and full test/demo execution is blocked by platform-native dependencies and the audit write boundary. **INFERENCE:** there is no attributable current runtime baseline.
2. **FACT:** Docker context may include `.env`, installer follows mutable source and checksum/version evidence conflicts. **INFERENCE:** no trustworthy immutable release unit exists.
3. **FACT:** bus factor is one, contacts/owners are placeholders, and no live on-call/metrics/restore/incident drill is evidenced.

### Three dangerous assumptions

1. **INFERENCE:** historical green tests are transferred to current dirty code/release artifacts.
2. **INFERENCE:** workflow/CODEOWNERS files are mistaken for enforced remote settings and required checks.
3. **INFERENCE:** backup commands/runbooks are mistaken for measured RPO/RTO and correct restore.

### One omission

**FACT:** no second release-capable maintainer, working security channel, candidate release owner or succession plan is evidenced.

### One falsifiable experiment

**RECOMMENDATION:** two people independently build/install/verify one immutable candidate on every supported platform, compare artifacts/provenance and inject crash/disk-full/migration/restore/withdrawal failures. Any irreproducibility or unrecoverable state blocks release.

### One minimum rescue path

**RECOMMENDATION:** claim no stable release; first pin one candidate/installer/dependencies, publish verified checksums/SBOM/provenance, exercise restore/security contact and name two maintainers.

### Conclusion

The observed tree is neither a release candidate nor production-ready open-source service.

## 8. Competition judge/investor

### Three veto defects

1. **FACT:** no independently expert-reviewed real scientific end-to-end case exists; the 30 cases are fixtures.
2. **UNKNOWN:** no external adoption, changed downstream decision, independent-verifier success rate, payer or sustained funding evidence exists.
3. **FACT:** README truth/platform/maturity language conflicts with code and repository disclaimers. **INFERENCE:** credibility damage is especially serious for a trust product.

### Three dangerous assumptions

1. **INFERENCE:** test/file/document volume is being mistaken for user value or execution moat.
2. **INFERENCE:** 28 labels and five outputs are being mistaken for scientific coverage.
3. **INFERENCE:** Merkle/hash/determinism is being presented as authenticity, truth or a difficult-to-copy moat.

### One omission

**FACT:** there is no validated adoption/business path: payer, displaced workflow/cost, support load and scientific/security accountability remain unknown.

### One falsifiable experiment

**RECOMMENDATION:** run a blinded five-minute judge challenge on a clean machine: verify one real expert-reviewed claim, detect one mutation and explain all six assurance limits. Require at least two of three independent judges to complete without author help and zero truth/misconduct misinterpretation.

### One minimum rescue path

**RECOMMENDATION:** abandon the grand lie-detector story; demonstrate one real receipt that catches a mutation, reproduces bounded computation, correctly abstains and publicly exposes failures/limits.

### Conclusion

The kernel is competition-interesting, but present evidence cannot support a top-tier award or investment claim; reassess only after narrow real independent evidence.

## 9. Cross-review disposition

| Review finding | Severity | Disposition in reboot spec | Remains unresolved until |
|---|---|---|---|
| ADV-001 Universal/truth thesis invalid | VETO | Accepted: PIVOT and anti-positioning in 01/05/07 | Public repository/product language is changed and comprehension tested |
| ADV-002 Six assurances collapse risk | VETO | Accepted: orthogonal vector in 07/11 and interface rules | Schemas/interfaces/vector tests implemented and users understand |
| ADV-003 No active independent Receipt V2 | VETO | Accepted: WP-04/REQ-TRUST-001/002 | Two implementations and tamper/downgrade clean-room pass |
| ADV-004 Run/concurrency/authorization unsafe | VETO | Accepted: Profile L/O only; WP-02 | Storage/authz/concurrency tests; Profile I still separate |
| ADV-005 Unsafe execution/privacy | VETO | Accepted: trusted local restriction and isolation/privacy gates | Adversarial isolation + DPIA/lifecycle evidence |
| ADV-006 No scientific validity | VETO | Accepted: one profile, fixture downgrade, locked expert study | Preregistered independent scientific thresholds pass |
| ADV-007 No user/service validation | VETO | Accepted: UR/EXP stop rules | Real handoff/repeat/comprehension evidence |
| ADV-008 No release/governance authority | VETO | Accepted: immutable candidate/two-person/staffing gates | Clean full run, release/restore drill and named owners |
| ADV-009 Accessibility/current UX unproven | BLOCK | Accepted: static viewer/CLI rescue and WCAG task gates | Independent accessibility and disabled-user task evidence |
| ADV-010 No comprehensive leadership evidence | BLOCK | Accepted: zero “exceed” claims and fair protocol | Repeated same-condition benchmark + independent review |

Strategic result after adversarial review remains **PIVOT**, but release/readiness status remains **BLOCKED**. The review changes no fact into a pass; it converts vetoes into explicit stop gates and rescue paths.
