---
status: draft
owner_role: open-source-governance-council
last_verified: 2026-08-05
scope: proposed contribution, review, release, and maintainer governance; not active in this audit
authoritative_for:
  - proposed contributor governance
evidence_level: D
related_decisions: [DEC-002, DEC-010]
related_requirements: [REQ-GOV-003]
supersedes: []
superseded_by: null
---

# Draft contributing and governance policy

> **DRAFT ONLY.** This document does not replace current `CONTRIBUTING.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `SECURITY.md` or remote repository settings.

## 1. Project scope and contribution promise

FAR-Lab accepts work that makes a threat-bounded scientific verification receipt more reproducible, understandable, challengeable, secure and maintainable. It does not accept claims or features whose purpose is universal truth detection, fraud/misconduct adjudication, authorship attribution, autonomous adverse decisions, or generic coding-agent/platform breadth.

Contributions may cover deterministic protocol/kernel behavior, one approved scientific profile, receipt verification, author–reviewer workflows, accessibility, local/offline operation, security/privacy/reliability, documentation, evaluation and governance. New domains, hosted multitenancy, autonomous agents and extension ecosystems require validated demand plus an approved RFC/ADR.

## 2. Setup and attributable baseline

Published contributor setup must pin supported OS/runtime/package-manager versions and provide a clean-room diagnostic. Contributors record revision and dirty state before changes and run the authoritative baseline. If native dependencies or data cannot run, open a reproducibility issue with exact environment/output; do not rebuild silently or report historical green evidence as current.

Never include secrets, private research material, proprietary benchmark answers, personal data or unlicensed corpora. Use synthetic or approved governed fixtures.

## 3. Issue, RFC and ADR routing

| Change | Required path |
|---|---|
| Bug/doc/test improvement within frozen behavior | Issue or PR with reproducer, requirement and evidence |
| User-visible behavior/API/CLI/schema change | Issue + implementation plan + compatibility review |
| Architecture, new dependency/service/protocol/language | RFC + ADR + threat/operations/cost review |
| Trust kernel, receipt, FEC, scientific profile or threshold | RFC + ADR + independent science/trust review |
| Authorization, crypto, isolation, privacy, migration, release | Security/privacy RFC + two qualified reviewers |
| New scientific domain/profile | Demand evidence, method card, expert owners, licensed data, preregistered validation and correction plan |

RFCs state problem/user, evidence, non-goals, alternatives, threat/data model, compatibility, operations/cost, evaluation, stop conditions and reversibility. ADRs record the chosen decision, not an implementation diary.

## 4. Review and decision rights

At least two active maintainers must be able to triage, release and respond to incidents. Define CODEOWNERS for trust/protocol, science/evaluation, security/privacy, data/migrations, CLI/API/Web, platform/release and documentation/accessibility. The author cannot solely approve a high-risk change.

| Area | Required approval |
|---|---|
| Ordinary implementation/docs | One code owner |
| Public interface/compatibility | Component owner + product/API owner |
| Trust/proof/crypto | Protocol owner + independent security/verifier reviewer |
| Science/profile/threshold | Scientific owner + two domain reviewers/evaluation owner |
| Privacy/authorization/data lifecycle | Privacy/legal + security/data owner |
| Migration/release/supply chain | Data/release owner + second maintainer |
| Public capability claim | Product + evidence owner + science/legal where material |

Review resolves correctness, failure/recovery, security/privacy/science, compatibility, tests, docs, operations, cost and user-control impact. Approval means the evidence was inspected, not merely that CI is green.

## 5. Testing and documentation

Every behavior change includes an old-behavior reproducer and meaningful regression assertion. Critical logic requires negative, boundary, tamper, downgrade, concurrency, cancellation and recovery coverage as applicable. Test deletion/weakening requires two-person review and an equal-or-stronger replacement.

PRs report exact commands, environment, revision, counts and blocked/skipped gates. Required documentation includes user task, limits, schema/API/CLI compatibility, migration/rollback, threat/privacy/science cards, operation/runbook and traceability. Synthetic fixtures remain labeled; benchmark and evaluator versions are pinned.

## 6. AI-generated contribution policy

AI assistance is permitted only with human accountability. The contributor must disclose material generated or transformed work, tools/models where policy requires, and validation performed. The submitter owns licensing, security, privacy, correctness and provenance; “the model wrote it” is not a defense.

Generated code/data/documentation receives the same review. Never submit model output containing secrets, private source, fabricated citations, copied incompatible material, hidden benchmark answers or unreviewed scientific labels. Agents may assemble evidence but may not self-approve a deterministic verdict rule or scientific threshold.

## 7. Security and privacy contributions

Use a tested private reporting channel for vulnerabilities and sensitive privacy issues; do not publish exploit details before coordinated handling. The security team acknowledges, triages, sets embargo/remediation expectations, credits reporters safely and publishes advisories with affected versions and mitigations. Placeholder contacts and untested SLA promises are forbidden.

Changes involving authentication, authorization, filesystem/archive processing, commands, network, secrets, crypto/keys, sandbox, tenancy, retention/deletion, legal hold or sensitive data require threat tests and an independent reviewer. No waiver can ship a known critical trust-root, isolation, cross-scope access, secret leakage or false-success defect.

## 8. Dependencies, models and extensions

Every new/updated dependency, model, dataset, tool, skill, plugin or remote server declares need, exact version/digest, source, maintainer/signature, license, transitive dependencies/SBOM, vulnerabilities, data/network behavior, runtime authority, evaluation, rollback and maintenance plan. Avoid mutable branches/tags and install-time remote execution.

Model/provider changes are evaluated on the frozen task set with data-boundary/cost/latency/quality results; they cannot silently change deterministic outcomes. Extensions remain outside the trust root and are individually revocable with affected-result analysis.

## 9. Release, compatibility and deprecation

A release is one immutable candidate: source, locks, schemas, policy/kernel/profile versions, datasets, tests, artifacts, SBOM, checksums, provenance and approvals all bind the same revision. Two people independently build/verify it. Stable release requires all applicable G0–G6 evidence and no unresolved P0 blocker.

Lifecycle is `experimental → preview → stable → deprecated → removed`. Public APIs, CLI machine output, receipt schemas/conformance classes, events, qualified policies/profiles and data schemas publish compatibility, migration, support window and deprecation notice. Legacy V1 verification remains visibly degraded; migration never fabricates missing evidence. Rollback selects a prior immutable candidate rather than rewriting a release.

## 10. Maintainer governance

- Publish current maintainers, roles, term/review cadence, succession, inactivity/retirement and emergency delegation.
- Use recorded decisions and disclose relevant conflicts of interest; conflicted maintainers abstain.
- Routine decisions seek consensus; contested reversible decisions use documented majority; trust/science/privacy exceptions require their qualified owners and cannot be outvoted by feature maintainers alone.
- A removal requires objective inactivity/conduct criteria, notice and appeal. Security emergency action is narrow, time-bound and retrospectively reviewed.
- Publish funding/sponsorship relationships and prohibit sponsors from privately changing verdict rules or suppressing valid negative results.
- Maintain an archival/fork continuity plan if staffing or funding ends.

## 11. Conduct and scientific disagreement

Adopt and enforce a code of conduct with confidential reporting, proportional response, conflict/appeal path and anti-retaliation. Separate interpersonal conduct, product defect, scientific disagreement, privacy request and security incident; each has a different owner and record policy.

Scientific disagreement is resolved by evidence, declared methods and qualified review, not authority or contributor popularity. The product must preserve `INCONCLUSIVE`/refusal and correction without labeling a participant dishonest.

## 12. PR completion evidence

A PR is mergeable only when it links its issue/plan, requirements, decisions and risks; scopes changed files; explains user outcome/non-goals; supplies relevant tests and raw gate results; documents data/security/privacy/science/compatibility/operations; gives migration/rollback; updates traceability; identifies generated content and residual limitations; and passes required reviewers/settings on the exact head revision.

Merge, release, deploy and external publication are separate authority decisions. A merged change is not automatically released or scientifically approved.
