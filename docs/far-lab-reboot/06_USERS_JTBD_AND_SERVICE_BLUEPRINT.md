---
status: reviewed
owner_role: product-research-and-service-design-lead
last_verified: 2026-08-05
scope: target users, research questions, jobs, adoption path, and human/service responsibilities
authoritative_for:
  - target user priority
  - jobs to be done
  - service blueprint
  - adoption and stop evidence
evidence_level: D
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-006, DEC-009]
related_requirements: [REQ-PROD-001, REQ-WF-001, REQ-WF-002, REQ-WF-003, REQ-WF-004, REQ-WF-005, REQ-WF-006]
supersedes: []
superseded_by: null
---

# 06 — Users, JTBD, and service blueprint

## 1. Evidence status

All personas and jobs in this document are **hypotheses**, not observed demand. Repository assets establish possible capabilities; they do not establish that a scientist will change workflow, that a reviewer will rely on the output, or that an institution will fund it. The authoritative repository evidence and strategic scoring are in `02_REPOSITORY_FORENSICS.md` and `03_STRATEGY_PRODUCT_SERVICE.md`.

## 2. Priority participants and decision rights

| Role | Primary need | Authority | Exposure/harm | v0 treatment | Evidence needed |
|---|---|---|---|---|---|
| ROLE-01 Computational author | Package a bounded computational claim once and know what is missing before handoff | Owns draft/material disclosure; cannot self-certify science | Disclosure burden, rejected claim, data leakage | Primary user | Observe five real non-sensitive handoffs |
| ROLE-02 Independent reviewer/reproduction engineer | Verify bytes, declared process, replay result and limitations without trusting author state | Can request evidence, annotate and recommend; cannot silently alter receipt | Time waste, false confidence, hostile archive/code | Primary user | Clean-room verification and comprehension |
| ROLE-03 Scientific/method reviewer | Judge policy applicability, assumptions, uncertainty and domain meaning | Endorses/contests scientific interpretation; independent of machine result | Invalid rules gain authority | Required service role | Blinded labels and conflict/adjudication record |
| ROLE-04 Affected author/subject | Inspect evidence, challenge errors and obtain correction/withdrawal | Due-process participant; must see reasons and evidence access rules | Reputational/career harm | Required before adverse use | Adversarial journey and rights/legal review |
| ROLE-05 Lab PI/research manager | Set minimum receipt policy and decide whether work advances | Local policy owner; cannot rewrite evidence | Rubber stamping, workflow blockage | Pilot sponsor | Policy concept and exception study |
| ROLE-06 Repository/editor/funder operator | Triage completeness at volume | Process owner, not scientific oracle | Unfair rejection, backlog, liability | Deferred until pilot | Shadow workflow and error-cost study |
| ROLE-07 Privacy/security/legal reviewer | Veto unsafe data/process use | Controls legal basis, sensitive data and incident handling | Breach, unlawful processing | Gate owner | DPIA/threat/legal determination |
| ROLE-08 Local administrator/support | Install, diagnose, back up, restore, upgrade and exit | Operational authority; no scientific override | Loss, outage, secret exposure | Conditional local/institution role | Clean install/restore/incident drill |
| ROLE-09 Integration developer | Produce or consume receipts without proprietary state | Adapter author within scoped permissions | Semantic loss, supply-chain risk | File/CLI/API only in v0 | Independent consumer implementation |
| ROLE-10 Product/release/science governance | Own claims, profiles, releases, corrections and end-of-life | Separate accountable roles with conflict rules | Capture, unowned incidents, unsupported release | Must exist before Alpha | Named staffed RACI and exercises |

Whistleblowers, clinical decision subjects, employment/misconduct subjects and hostile multitenant actors are not v0 target users; their harms still shape explicit non-goals and threat controls.

## 3. Jobs to be done

| JTBD | Trigger and motivation | Job / desired outcome | Current substitute | Anxiety and control | Observable completion |
|---|---|---|---|---|---|
| JTBD-01 Author preflight and compile | Before internal review/submission, the author needs a bounded, non-ambiguous record | Inventory claim, plan, inputs, run, outputs, policies, omissions and disclosure; create an immutable receipt | ZIP/README/notebook/checklist | Preview exact disclosure; local/offline; no overwrite/upload; refuse missing critical binding | A second environment checks the package and the author understands every limitation |
| JTBD-02 Independent verify/replay | Reviewer receives a package and cannot trust author machine/service | Safely inspect, verify each assurance dimension, replay where allowed, and identify next review action | Manual reconstruction/ad hoc scripts | Safe rendering; no code execution by inspection; trust store visible; bounded errors | Reviewer completes without author DB/state and distinguishes integrity from science |
| JTBD-03 Request evidence/challenge | A required artifact is missing or machine/scientific conclusion is disputed | Ask a specific question tied to evidence/policy/result and receive an attributable response | Email/comment threads | No guilt language; protect source; deadline/owner; conflict disclosure | Case reaches canonical `RESOLVED`/`WITHDRAWN`, or retains its canonical nonterminal state with an attributed escalation event; history is immutable |
| JTBD-04 Correct/supersede/withdraw | Error, new evidence, policy defect or privacy issue changes standing | Publish a successor or withdrawal while preserving affected history and notifying consumers | File replacement/email correction | No silent mutation; show current standing and reason; scoped erasure/legal hold | Old receipt verifies as old, points to successor/withdrawal, and affected results are enumerable |
| JTBD-05 Enforce a bounded gate | Lab/process owner wants agreed machine checks, not a hidden truth score | Apply exact versioned policy and get stable machine output/exit code with an exception path | Custom CI scripts/manual checklist | Offline/pinned policy; reason trace; human override cannot forge machine result | Same receipt/policy gives same outcome across declared implementations |
| JTBD-06 Archive/export/delete/exit | Project/tool/provider ends or rights are exercised | Export complete portable records or perform authorized deletion/tombstone/legal hold with proof of action limits | Manual copy/vendor export | Understand backups, keys, external anchors, what cannot be erased | Restore/verify or deletion audit passes without continuing proprietary service |

## 4. First real service loop

```text
Author preflight
  → local compile candidate
  → deterministic checks + explicit gaps/refusal
  → author disclosure approval
  → immutable receipt + static viewer
  → independent reviewer inspect/verify/replay
  → accept bounded evidence OR request/challenge
  → author/reviewer evidence response
  → corrected successor / contested state / withdrawal
  → archive/export and affected-party notification
```

The machine owns deterministic checks and trace construction. Humans own method interpretation, contested evidence, exceptions, adverse decisions, appeal, disclosure and policy approval. An optional agent may locate/assemble candidate material but cannot seal, sign, distribute, decide, delete, transmit or change a verdict without explicit human action and deterministic validation.

## 5. Service blueprint

| Stage | User action/frontstage | Backstage capability | Human service/decision | Evidence and audit | Failure/recovery owner |
|---|---|---|---|---|---|
| Discover/consent | Select supported profile; read limits/data disclosure | Compatibility and policy catalog | Product/science/legal own wording/profile | Policy/version and consent choice | Support; incompatible profile refuses |
| Preflight | Add claim, data/code/env references and disclosure choices | Quarantine, inventory, classify, validate paths/schema | Author owns completeness statement | Draft ID, manifest preview, omitted/restricted list | Author can repair without sealing or distribution |
| Compile | Start/cancel/resume task; inspect missing evidence | Immutable snapshot, FEC/policy compile, isolated run, deterministic kernel | Science owner pre-approved scientific profile; no live discretionary verdict | Task/attempt/events, bindings, deviations, check trace | Worker/platform; no partial sealed receipt |
| Seal/handoff | Confirm disclosure, seal, then export package/link | Atomic seal; separate distribution event; external signature/anchor if selected | Author attests disclosure; signer authority policy applies | Receipt ID/root/qualified policies/signature/candidate | Protocol owner; failed seal creates no receipt or distribution event |
| Verify/replay | Inspect safely; select verification policy and time context; optionally replay | Independent verifier, trust store, isolated replay | Reviewer interprets and records decision separately | Six assurance dimensions, divergence, limits | Reviewer/support; partial remains partial |
| Challenge/respond | Tie request to an edge/rule/result | Durable review case, permissions, deadlines, notification | Reviewer/author/affected party; conflict handling | Attributed statements/evidence and state transitions | Product ops; escalation cannot alter machine record |
| Correct/withdraw | Propose successor or withdrawal; review impact | Affected-result query, append-only lineage, export invalidation notice | Two-person approval for high-risk correction | Old/current relationship, reason, policy/model defect | Governance; rollback freezes new sealing/distribution |
| Exit/rights | Export, retention, deletion or legal-hold request | Backup/restore, tombstone/scoped erase, anchor/key instructions | Privacy/legal resolves competing duties | Action scope, completion/limits, requester/authority | Privacy/ops; no unverifiable “deleted” claim |

## 6. Adoption research plan

| Research ID | Decision unlocked | Participants/method | Predeclared support | Oppose/stop | Owner / last responsible moment |
|---|---|---|---|---|---|
| UR-01 | Is the receipt a real workflow wedge? | 12 interviews + 5 observed author–reviewer handoffs using participants' work | ≥5 completed; ≥60% prefer to current bundle; ≥3 repeat | <3 repeat or receipt causes no downstream action | Product research / before Alpha implementation |
| UR-02 | Is bounded language understood? | Blinded comprehension test across authors/reviewers/affected parties | ≥90% correct; no subgroup <80%; no critical misconduct/truth inference | Any systematic false-certainty interpretation | UX+science+legal / before UI freeze |
| UR-03 | Is first task class viable? | 8 domain experts + 30 real candidate analyses | ≥70% fit without semantic hacks; reviewers can adjudicate | Low fit, unstable labels or unacceptable error cost | Science / before policy freeze |
| UR-04 | Can review be independent? | 3 clean-room teams, two verifier implementations and tamper corpus | ≥2 teams need no author state; all critical tamper/downgrade found | Any critical silent pass or author-service dependency | Trust/evaluation / before “independent” claim |
| UR-05 | Does local-first aid adoption? | Compare local/private/hosted blueprints with sensitive-data users and admins | ≥60% sensitive users require local/private and can install with support target | Setup burden eliminates value | Product/platform / before deployment investment |
| UR-06 | Is procedural justice adequate? | 5 contested cases with affected-party/legal review | Evidence access, challenge, correction and reason understood/completed | Unresolvable rights/hold conflict or hidden adverse action | Product ops+legal / before adverse-use pilot |
| UR-07 | Can a first-time reviewer reach safe offline value? | Candidate-bound clean-machine moderated study, sample/power set prospectively | Median ≤10 min; completion lower-confidence target met; zero critical truth/certification inference | Hidden prerequisite, setup/data loss or systematic false confidence | UX+release / before Alpha |
| UR-08 | Is selective disclosure both useful and private enough? | 5 representative unpublished/restricted cases plus dictionary/correlation red-team | Review task meets preregistered completion; no protected fixture confirmed or unintended cross-receipt link | Too incomplete for review or any material low-entropy/linkability leak | Product+privacy / before external data |

Recruit across career seniority, author/reviewer role, institution size, accessibility needs, geography/jurisdiction and favorable/skeptical attitudes. Incentives, consent, recording, withdrawal and data-retention terms are mandatory. Satisfaction is secondary to observed behavior, comprehension, error and downstream decision.

## 7. Adoption and support constraints

- Start with non-sensitive, author-controlled, local/offline materials. No clinical, personnel, whistleblower or misconduct cases.
- Provide static viewer and CLI verification before requiring an account or server.
- Minimize duplicate entry: import existing manifest/workflow metadata, but make inferred fields visibly unverified.
- Report preparation/verification time, required author help, evidence requests, corrections, refusal, abandonment and repeated use.
- Every candidate/package carries a versioned support descriptor separating product fault, method dispute, security/privacy incident and appeal/correction. Each route is real and tested, states identity strength, offline exchange format, availability/SLA-or-no-SLA, named owner, escalation and safe disclosure; security intake never defaults to a public issue.
- A pilot cannot quietly become operational assessment. Expiry, deletion, export and stop communication are part of consent.

## 8. Exit conditions

This service design remains `DESIGNED_UNVALIDATED` until UR-01 through UR-04 and the applicable UR-07/08 safety gates pass. Failure of demand selects an open receipt specification/independent verifier or stops product expansion; it does not justify adding dashboards, agents, protocols or domains.
