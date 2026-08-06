---
status: reviewed
owner_role: product-strategy-lead
last_verified: 2026-08-05
scope: detailed strategic scoring, user hypotheses, service design, and product boundaries
authoritative_for: [strategy candidate scoring, sensitivity analysis, detailed service analysis]
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003]
related_requirements: [REQ-PROD-001, REQ-WF-001]
supersedes: []
superseded_by: null
---

# FAR-Lab strategy, product and service judgment

| Field | Value |
|---|---|
| Status | `PIVOT_RECOMMENDED; VALIDATION_REQUIRED` |
| Owner | Product strategy owner (unassigned); accountable sponsor required |
| Evidence level | A for repository capability; D/E for demand and adoption hypotheses |
| Last verified | 2026-08-05 |
| Authority | Product thesis, scope, users, service closure and strategic stop rules for the reboot |

## 1. Judgment

`PIVOT`: retain the deterministic kernel, FEC, evidence ledger, lifecycle mechanics and portable export work, but reorganize them around a local-first, threat-bounded **verification receipt protocol and policy-conformance workflow for preregistered computational claims**. The first product is a researcher/integrator CLI plus a minimal review surface; an institutional investigation platform and universal scientific adjudicator are explicitly not the first product.

Confidence: **0.78 in the need to pivot away from the current universal/truth framing; 0.58 in the proposed wedge**. The first confidence comes from direct repository contradictions. The second is lower because no real target-user study, willingness-to-adopt evidence, independent verifier, or domain-validity trial is present (`.far-design/HUMAN_ACTIONS.md:28-44`; OQ-003–005).

### Product positioning

For computational researchers and technical reviewers who must hand off a claim, method, result and provenance without asking the recipient to trust the author’s software, FAR-Lab compiles a versioned verification receipt and checks it against an explicit policy, so the recipient can reproduce bounded checks, see missing evidence and request correction. It supports a human decision; it does not decide scientific truth or misconduct.

### Trust statement

FAR-Lab may report what was supplied, what deterministic rule was applied, what was recomputed, what differed, which trust anchor was used, and which facts remain unverified. Scientific interpretation, authorship attribution, misconduct findings, legal consequences, and institutional decisions remain with accountable humans.

## 2. Why the original thesis does not hold

| Original implication | Repository reality | Judgment |
|---|---|---|
| “AI4S lie detector” that lets anyone verify true/false | README disclaims scientific truth; benchmark is offline fixture with no reviewed oracle | RETIRE |
| Deterministic kernel is a universal scientific adjudicator | Determinism proves repeatability of a rule, not validity of its domain policy or inputs | RETIRE |
| `.far-proof` already enables independent third-party recomputation | Envelope is TypeScript self-check, code is omitted, integrity manifest is optional | REFRAME and REDESIGN |
| 28-domain report demonstrates breadth | It demonstrates fixture/schema/branch breadth only | DOWNGRADE to conformance corpus |
| Web/API/CLI form a platform | Protected Web flow, resource authorization, async jobs and procedural redress are missing | LIMIT to local-first reference application |
| Enterprise/production readiness follows from test volume | Current runtime is blocked; governance, release, privacy, SRE and support evidence are incomplete | PROHIBIT |

The product still has a credible nucleus: explicit falsification contracts, a deterministic policy kernel, provenance-aware records, refusal outcomes, versioning intent, append-oriented lifecycle history, negative/tamper tests, and an export format. These are valuable when described as verifiable workflow constraints, not truth certification.

## 3. Problem tree and intervention boundary

Evidence about frequency, severity and buying behavior is currently an E-level hypothesis; the table defines what to validate rather than pretending it has been learned from users.

| Problem family | Harm / current response | Technically identifiable part | Human/organizational part | FAR-Lab boundary |
|---|---|---|---|---|
| AI-assisted writing | Disclosure/policy inconsistency; manual/editor checks | Capture declared tools, versions and transformation records | Decide acceptable use and sanctions | Record disclosure evidence; never infer authorship from prose alone |
| Undisclosed AI use | Trust and policy risk; detectors/manual inquiry | Policy-field completeness and process provenance | Intent, identity and culpability | Do not be an AI-text detector |
| Plagiarism | Attribution harm; similarity search/investigation | Import external similarity reports and source anchors | Substantial similarity, fair use, intent | Do not replace specialist similarity/index services or adjudicate misconduct |
| Citation error/fabrication/mismatch | False support and review cost | Resolve identifiers, availability, quotation/claim linkage, version | Interpret semantic support and acceptable scholarship | Carry citations and checks; require human/external oracle for semantic finding |
| Data fabrication/tampering/selective reporting/p-hacking | Scientific/ethical harm; audit and replication | Preregistration diff, provenance gaps, statistical red flags, omitted-run indicators | Determine fabrication, motive, legitimate exclusions | Emit signals/evidence gaps, never accuse |
| Image/chart/media manipulation | Misleading figures; forensic review | Import hashes and specialist tool results; check source lineage | Context/intent and acceptable processing | Integrate, do not build universal media forensics now |
| Statistical/model misuse or unidentified causality | False inference; methods review | Versioned checks for predeclared designs and assumptions | Scientific interpretation and causal warrant | Conformance to a named policy only; no universal correctness score |
| Code/environment/result irreproducibility | Reviewer time and non-verifiable conclusions | Lock inputs, parameters, environment, outputs; replay bounded checks | Access restrictions and acceptable tolerances | Core in-scope wedge |
| Paper mills/template/identity fraud | Systemic integrity/identity harm | Import external signals; provenance inconsistencies | Investigation, identity verification, due process | Out of scope as primary detector |
| Authorship/contribution/COI | Credit and governance disputes | Record declarations, versions and approvals | Resolve contribution, conflicts and sanctions | Evidence carriage only |
| Missing research-process lineage | Cannot audit claim derivation | Content identifiers, relations, run receipts, policy versions | Define required process and exceptions | Core in-scope wedge |
| Data/code/model licensing | Legal/reuse risk | Record license/source and machine-readable compatibility rules | Legal interpretation and exceptions | Warn/route to owner; not legal advice |
| Institution/journal/funder policy variance | Rework and inconsistent review | Version policies and produce conformance diff | Author policies and grant exceptions | Core policy-conformance layer |
| Procedural injustice in investigations | Unappealable adverse signals | Immutable timeline, evidence access, corrections and appeals | Final decision, conflict management, remedy | Must support due process before any high-stakes use |
| Retaliation/weak-party risk | Reputational, employment and safety harm | Minimize visibility, log access, redact/export | Protection, investigation ethics, duty of care | Do not accept sensitive cases until governance and privacy gate pass |

Highest-value tractable problem: handoff failure between an author and a reviewer of a computational claim—inputs, declared method, run environment, result, policy and limitations arrive fragmented, making bounded recomputation and correction expensive.

## 4. Strategic candidate scoring

Weights were chosen because a competition demo can over-reward novelty while a real integrity product fails on scientific validity, adoption cost or harm. The score therefore gives 20% to problem/user value, 18% to scientific/evidence validity, 15% to workflow adoption, 12% each to defensibility and implementation/data feasibility, 10% to safety/legal/privacy, 8% to operations/sustainability and 5% to ecosystem integration. Each score is 0–10; weighted totals are out of 100. Demand-related scores are low-confidence E until research occurs.

| Candidate | Value 20 | Science 18 | Adoption 15 | Defensibility 12 | Feasibility 12 | Safety 10 | Ops 8 | Ecosystem 5 | Total | Confidence | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| A AI-generated-content detector | 4 | 2 | 4 | 2 | 5 | 2 | 5 | 4 | 34.0 | medium | REJECT |
| B multi-signal research-integrity detection platform | 8 | 3 | 5 | 5 | 5 | 3 | 4 | 6 | 50.1 | low | PIVOT AWAY |
| C provenance/reproducibility evidence infrastructure | 8 | 7 | 7 | 7 | 7 | 7 | 6 | 8 | 71.7 | medium-low | DESTINATION, CONDITIONAL |
| D institutional investigation/review workbench | 8 | 4 | 6 | 5 | 3 | 2 | 3 | 5 | 48.7 | low | DEFER/REJECT NOW |
| E researcher local-first self-check and evidence package | 7 | 7 | 8 | 6 | 8 | 8 | 7 | 7 | 72.5 | medium-low | WEDGE, CONDITIONAL |
| F open evidence protocol, CLI, SDK and integrations | 7 | 8 | 6 | 7 | 8 | 8 | 7 | 9 | **73.5** | medium-low | CORE, CONDITIONAL |
| G journal/funder pre-submission integrity check | 8 | 5 | 7 | 6 | 5 | 5 | 5 | 7 | 61.2 | low | PILOT ONLY LATER |
| H lab research-asset/reproduction operating system | 7 | 5 | 5 | 4 | 3 | 5 | 2 | 6 | 48.5 | low | REJECT SCOPE |
| I standards/dataset/evaluation only | 6 | 7 | 4 | 5 | 7 | 8 | 6 | 8 | 61.8 | medium-low | FALLBACK if product demand fails |
| J stop product and release reusable assets | 2 | 9 | 1 | 1 | 10 | 10 | 10 | 6 | 55.9 | medium | CONTROL OPTION |

The recommendation is not to build F, E and C as three products. F is the stable core contract; E is its narrow reference workflow and adoption wedge; C is a later ecosystem outcome if external integration demand appears.

### Sensitivity analysis

- Increasing adoption/user weight by ten points and reducing science/ecosystem proportionally makes E the leader, but the same F/E/C cluster remains ahead.
- Increasing standards/ecosystem and scientific-validity weights makes F the leader by a wider margin.
- Increasing institutional revenue/policy value does not rescue D or B unless safety, ground-truth and workflow scores are assumed rather than evidenced.
- Plausible ±5-point weight shifts rotate F/E/C, but do not move the original broad detection platform B above the conditional-continuation threshold.
- If five workflow observations show no downstream use of a receipt, F/E fall below viability and I or J becomes the correct choice.

Thus the pivot itself is stable; the exact commercial/product wedge is not yet stable.

## 5. Counterfactual tests

| Counterfactual | Result for proposed core | Required design response |
|---|---|---|
| No LLM exists | Core value remains: contracts, receipts, policy checks and replay do not require an LLM. | LLM generation is an optional upstream input, never product identity. |
| Third-party model/API disappears | Deterministic verifier remains useful if inputs are portable. | Vendor adapters are replaceable; receipt cannot require live provider access. |
| No exclusive data | Protocol is copyable; defensibility is weak. | Build trust through interoperability, independent implementations, conformance corpus, governance and workflow integrations—not secrecy. |
| Large platform adds similar checks | Users may prefer the incumbent. | Offer local/offline verification, neutral format, export/exit and cross-platform verification; stop if neutrality is not valued. |
| Local-only operation | Researcher wedge remains plausible; institution investigation does not. | Prioritize CLI and filesystem package; keep server optional. |
| No automatic truth decision allowed | Core value improves by becoming safer and clearer. | Output check results, evidence gaps and refusal; human owns decision. |
| False-positive rate is high | Detection-platform strategy fails. | Restrict to deterministic conformance checks and non-accusatory signals; allow abstention. |
| Institution refuses upload | Local package and selective disclosure can work. | No mandatory hosted control plane; export redaction and offline verifier. |
| Users refuse workflow change | Standalone product fails. | Integrate with existing repositories/submission systems; receipt generated from current artifacts. |
| Team halves | Broad Web/agent/platform becomes unsustainable. | Freeze protocol/kernel/CLI; retire showcase surfaces and providers without active use. |

## 6. Stakeholder and role hypotheses

No named persona, quote or demographic is claimed. These are role hypotheses requiring research.

| ID | Role / trigger | Core job and desired outcome | Power / payer | Adoption barrier / unacceptable risk | Evidence needed | Failure impact |
|---|---|---|---|---|---|---|
| ROLE-HYP-001 | Computational researcher preparing internal review/submission | Package a claim and bounded reproduction evidence once | User; lab or institution may pay | Setup burden, exposing data, false confidence | Observe five real package handoffs | Wasted time or misleading receipt |
| ROLE-HYP-002 | Reproduction engineer/data analyst receiving a claim | Determine exactly what can be rerun and why it differs | Operator/influencer | Missing dependencies/data; format friction | Timed clean-room tasks | Cannot reproduce; rejects tool |
| ROLE-HYP-003 | PI/lab manager approving release | Require minimum evidence without reading every log | Decision owner/budget influence | Additional gate delays; liability | Policy-concept test and pilot | Rubber-stamps or blocks work |
| ROLE-HYP-004 | Journal/funder technical editor | Triage completeness before specialist review | Process owner; publisher/funder payer | Volume, integration, accusations | Workflow shadowing; error-cost interviews | Review backlog or unfair rejection |
| ROLE-HYP-005 | Independent statistical/method reviewer | Inspect assumptions, policy and exceptions | Reviewer, not always payer | Domain policy inadequacy | Domain review on blinded cases | Invalid checks gain legitimacy |
| ROLE-HYP-006 | Research-integrity officer | Preserve evidence and due process in a contested case | High decision power/institution payer | Privacy, discovery, procedural/legal risk | Sensitive-process interviews with counsel | Reputational/employment harm |
| ROLE-HYP-007 | Subject of review / affected author | Understand, challenge and correct evidence | Affected party; little buying power | Opaque signal, inability to appeal | Adversarial usability research | Procedural injustice |
| ROLE-HYP-008 | Whistleblower/source | Supply protected evidence safely | Evidence source | Retaliation/deanonymization | Safety/legal design research | Personal harm |
| ROLE-HYP-009 | Library/open-science/RDM staff | Help projects produce reusable provenance packages | Advisor/integrator | Standards mismatch and support load | Integration workshop | Parallel bureaucracy |
| ROLE-HYP-010 | Security/privacy/legal reviewer | Approve data handling and threat controls | Veto power | Raw data persistence, unknown processor roles | DPIA/threat-model review | Deployment blocked or unlawful |
| ROLE-HYP-011 | Institutional IT/platform operator | Install, update, observe, back up and exit safely | Operator/procurement influence | Native deps, support burden, no SLO | Install/restore/upgrade trial | Outage/data loss |
| ROLE-HYP-012 | Tool/integration developer | Produce or verify receipts from another workflow | Ecosystem multiplier | Unstable schema/SDK and ambiguous semantics | Independent implementation attempt | Lock-in or incompatible forks |

Initial primary user: ROLE-HYP-001. First verifying user: ROLE-HYP-002/005. Affected-party design must include ROLE-HYP-007 from day one. Initial payer is unknown; no business-model assertion is permitted.

## 7. User-research protocol tied to decisions

### Priority questions and samples

Conduct 18–24 semi-structured, artifact-based sessions across researchers, reproduction/method reviewers, lab managers, journal/open-science staff, integrity/privacy staff and integration developers. Include at least four skeptical participants, four affected/reviewed-party perspectives, multiple disciplines, Chinese and English workflows, smaller and larger institutions, and both open and restricted data. Do not use survey agreement as product validation.

Then run 8 observed handoff tasks using participants’ own non-sensitive computational claims, followed by 3 clean-room independent-verifier exercises and at most 2 shadow-mode institutional pilots. Record consent, minimize research data, separate identity from observations, set retention, and permit withdrawal.

| Question | Continue evidence | Pivot evidence | Stop evidence | Conservative default | Latest decision |
|---|---|---|---|---|---|
| Is handoff/review pain frequent and severe? | ≥60% of observed target workflows lose ≥30 min or block on missing provenance | Pain exists only in one narrow domain | <25% show material cost | Do not scale product | Gate 0 |
| Does the receipt change a downstream decision? | ≥5/8 real handoffs use a check/gap to rerun, correct, accept conditionally or request evidence | Used only as documentation | No downstream action in ≥6/8 | Maintain standard/eval only | Gate 1 |
| Can a recipient verify without author-controlled state? | ≥2/3 independent teams complete bounded verification within declared time | Needs common external archive/integration | All require author assistance or hidden state | Withdraw “independent” claim | Gate 3 |
| Are false alarms/abstentions acceptable? | Error-cost interviews accept predeclared thresholds and redress | Only non-blocking advisory use accepted | Any signal would trigger irreversible action without review | Prohibit automated adverse action | Gate 0/3 |
| Will users keep data local? | Local mode handles ≥80% core tasks | Need institution-private service | Hosted upload is required but cannot pass privacy | Local CLI only | Gate 1 |
| Who can authorize process change/pay? | Named sponsor and operator commit to a bounded pilot | Bottom-up developer adoption only | No owner accepts maintenance/support | Open protocol or stop | Gate 0 |

Stop recruitment when two consecutive sessions within each critical role add no strategy-changing task, risk or exception, but never before affected-party and security/privacy roles are represented. Report disconfirming evidence and non-response bias.

## 8. Strategy-stage job hypotheses

These `STRAT-JOB-*` rows were used to select the product wedge. They are not canonical JTBD IDs. Core `JTBD-01..06` and their final meanings are owned only by `06_USERS_JTBD_AND_SERVICE_BLUEPRINT.md`; the mapping is `STRAT-JOB-01→JTBD-01`, `02→02`, `03→03+04`, `04→05`, and `05→06`.

| JTBD | Situation / progress | Input → done | Current alternative | Evidence/control needs | Misuse boundary / metric |
|---|---|---|---|---|---|
| STRAT-JOB-01 Create a receipt | Before sharing a computational claim, assemble only the artifacts needed for bounded review | Claim + plan + inputs + run + result + policy → locally verified package and explicit gaps | README, archive, notebook, manual checklist | Preview/redaction; version/identity; no silent upload | Done when a second machine verifies structure and declared computations; track time and corrections |
| STRAT-JOB-02 Review a receipt | On receiving a claim, identify what is supported, missing or changed | Package + trusted policy/anchor → checks, differences, limitations and review tasks | Manual reconstruction, ad hoc scripts | Independent verifier, safe rendering, provenance modes | Never output misconduct/truth; measure correct comprehension and action |
| STRAT-JOB-03 Correct/contest | When evidence or policy is wrong, preserve history while changing current standing | Challenge + added evidence + reviewer → superseding receipt and reason | Email threads/version overwrite | Access, conflict declaration, audit timeline | No history erasure; measure resolution time and successful appeal |
| STRAT-JOB-04 Integrate a gate | In CI/submission workflow, enforce only agreed machine checks | Versioned policy + receipt → stable exit/report without hidden network | Custom scripts/checklists | JSON contract, deterministic exits, offline cache | No mutable “latest” policy; track false block and recovery |
| STRAT-JOB-05 Exit/archive | When project/tool ends, retain or delete according to authority | Export/retention instruction → portable package, deletion receipt or legal hold | Vendor export/manual copy | Completeness manifest, keys/anchors, retention authority | No unverifiable deletion claim; test restoration/migration |

## 9. Minimal real service loop

The first strategy-validating loop is deliberately narrower than the current six-stage “AI scientist” experience:

`declare claim and policy → inspect/redact inputs → compile receipt locally → deterministic preflight → hand package to an independent reviewer → recompute bounded checks → show pass/fail/unknown with evidence mode → request missing evidence or contest → issue superseding receipt → archive/export`

Completion requires a real author and a different real reviewer using a real non-sensitive computational claim. An offline fixture, author-operated verifier or screenshot is not completion.

### Service blueprint

| Phase | User/frontstage | Backstage/system | Human handoff / SLA | Failure/recovery | Audit and exit |
|---|---|---|---|---|---|
| Discover/evaluate | Read bounded capability and run safe sample | Compatibility/privacy preflight | Support response target only after owner exists | Honest unsupported-platform message | No telemetry by default |
| Configure | Select local workspace, policy and disclosure level | Pin schema/ruleset/verifier; no data upload | Security review for organization mode | Revert config; export plain manifest | Record config version, not secret |
| First material | Add claim, plan, inputs, environment and result | Classify data; hash locally; validate required fields | Data steward for restricted material | Quarantine invalid/unsafe files | User sees exact included/excluded list |
| Compile/check | Start bounded tasks | Immutable run/task records; deterministic policy | Reviewer only where policy says | Cancel safely; resume from checkpoint; no duplicate seal | Receipt ID and component hashes |
| Wait/long task | See state, estimate and resource use | Durable job, retry policy and heartbeats | Escalate after SLO breach | Retry from safe checkpoint or fail with partial artifact | Complete transition timeline |
| Review | Inspect evidence modes, gaps and diffs | Safe renderer and independent verification | Assign method/domain reviewer | Quarantine active content; preserve comments | Reviewer identity/COI and policy version |
| Conflict/gap | Request evidence or mark unknown | Link request to claim/check | Owner responds by due date | Refuse decision if unresolved | No silent override |
| Appeal/correct | Contest signal; add evidence; request independent review | Append appeal and superseding state | Separate reviewer; target acknowledgement 2 business days in pilot | Restore prior active state when allowed | Preserve reason, access and outcome |
| Incident/support | Report exposure/corruption | Contain, revoke anchor/key, notify | Named incident commander required | Offline export and service-disable path | Incident and postmortem records |
| Archive/delete/exit | Export, set retention, request deletion | Verify export; cryptographic erasure where applicable; legal-hold gate | Records/privacy owner approves | No deletion under active hold; retry with receipt | Machine-readable export and deletion limitations |

No SLA above becomes a public promise until staffed, measured and rehearsed.

## 10. Product principles

1. Separate source assertion, observed data, derived signal, policy result, reviewer opinion and accountable decision.
2. A deterministic result is never stronger than its input provenance and policy validity.
3. `UNKNOWN`, `UNTESTED`, refusal, correction, withdrawal and supersession are first-class successful outcomes.
4. Every consequential result names evidence mode, policy/ruleset, parameters, environment, verifier and trust anchor.
5. Local/offline operation and data minimization are the default; network use is explicit and inspectable.
6. Authors and affected parties can inspect, challenge, supplement, appeal and export without erasing history.
7. High-risk decisions require independent human review, conflict disclosure and separation of duties.
8. Web, CLI and API are projections of one domain policy and one lifecycle, not separate products.
9. Verification fails closed on ambiguity or downgrade; rendering of untrusted artifacts is isolated.
10. Public claims are versioned evidence products with owners, expiry and falsifiers.
11. Open formats and exit paths outrank vendor lock-in; an independent implementation is a release gate.
12. Complexity must unlock observed user value or risk reduction; showcase surfaces carry no presumption of survival.

## 11. Automation boundary

| Action | Class | Rationale |
|---|---|---|
| Parse, hash, canonicalize, schema-check, compare declared values | Automatic | Deterministic and reversible; raw evidence remains inspectable |
| Run a preapproved bounded recomputation in an isolated local runner | Automatic after explicit user start | Resource/security risk requires visible scope |
| Suggest missing evidence, reviewer or policy | Automatic suggestion; human confirms | Context and organizational authority vary |
| Label policy-conformance check pass/fail/unknown | Automatic for versioned deterministic checks | Never relabel as scientific truth |
| Publish/share a receipt, upload restricted data, install tool, invoke network | Human confirmation | External effect/privacy/cost |
| Override a result, accept an exception, resolve a contest | Authorized human, reason required | Accountability and due process |
| Declare truth, fabrication, plagiarism, misconduct, sanction or legal compliance | Forbidden | Not technically identifiable or within product authority |
| Delete under legal hold, erase audit history, weaken a policy silently | Forbidden | Irreversible/procedurally unsafe |

## 12. Product boundary and anti-positioning

FAR-Lab is not:

1. a scientific truth machine or lie detector;
2. an AI-authorship detector;
3. a plagiarism, image-forensics or paper-mill replacement;
4. an autonomous scientist or general coding agent;
5. a substitute for peer review, replication or domain expertise;
6. a misconduct investigator, sanctions engine or court;
7. a cryptographic authenticity/notarization service in keyless mode;
8. a guarantee that source data are complete, lawful or honest;
9. a universal cross-domain accuracy benchmark;
10. a general laboratory information-management/research operating system;
11. an enterprise multi-tenant platform until authorization, privacy and operations gates pass;
12. a legal, regulatory, licensing or ethics opinion;
13. a permanent archive unless its external dependencies and retention authority are satisfied;
14. a replacement for repositories, workflow engines, experiment trackers or provenance standards;
15. a reason to take irreversible action without human review and appeal.

Initially excluded users/cases: clinical/person-level or export-controlled evidence; active misconduct investigations; anonymous accusation workflows; high-concurrency multi-tenant hosting; users seeking automatic truth/misconduct labels; and workflows that cannot disclose even a minimal verifiable manifest.

## 13. Runtime modes

| Mode | Status in target strategy | Data/control boundary | Product promise |
|---|---|---|---|
| Single-machine local | Primary | User filesystem/process; no default network | Compile and verify bounded receipts |
| Fully offline | Primary where dependencies/data available | Air-gapped; external references marked unavailable | Structural/policy checks and cached recomputation |
| Local-first with optional remote resolver | Conditional | Per-operation disclosure preview and consent | Resolve public identifiers or remote artifacts |
| Institutional private deployment | Later, gated | Institution identity, storage, keys and policies | Collaboration only after authorization/privacy/SRE gates |
| Multi-tenant hosted | Not approved | Vendor-controlled shared service | No claim or roadmap commitment until demand and controls exist |
| Hybrid | Research only | Explicit split of metadata, artifacts and computation | No “same experience” assumption across modes |

## 14. Asset portfolio decision

| Asset/surface | Decision | Reason / target treatment |
|---|---|---|
| R0–R9 kernel and five outcome model | RETAIN + RESEMANTICIZE | Versioned policy-conformance result; domain policy separate from engine |
| FEC contract/freeze | RETAIN | Strongest differentiating workflow constraint; add evidence-mode and governance contracts |
| Evidence log and canonicalization | RETAIN + HARDEN | Preserve traceability; distinguish legacy coverage, privacy and external anchoring |
| ProofEnvelope/`.far-proof` | REDO AS RECEIPT PROFILE | Required downgrade-resistant manifest, embedded/archived dependencies or explicit references, independent verifier, verification policies and explicit trust-time context |
| Lifecycle tombstones | RETAIN + EXPOSE | Extend to contest/appeal/correction/withdrawal with authorization and procedural UI |
| Anti-theater detectors | DEGRADE TO VERSIONED CHECK PACK | No universal count/coverage claim; register applicability and validation |
| Statistics/science harness | RETAIN SELECTIVELY | Only validated domain packs; no cross-domain generalization |
| CLI verify/export | PRIMARY SURFACE | Stable machine output, dry-run, local-first, compatibility and recovery |
| Web cockpit | REDESIGN/REDUCE | Reviewer receipt viewer/work queue, not showcase/leaderboard |
| API | REDESIGN AROUND RESOURCES/JOBS | Optional local/institution interface after one domain core |
| `ask` agent loop | DEGRADE TO OPTIONAL AUTHORING ASSISTANT | Never define product value or final evidence semantics |
| Court/arena/leaderboard/hero routes | REMOVE FROM CORE | Contest/demo metaphors distort scientific and procedural trust |
| Scheduler shell-command feature | REMOVE/GATE | Present design is unsafe and outside minimum loop |
| 30-case benchmark | RENAME/RETAIN AS CONFORMANCE FIXTURES | It tests format/branches only; build separate scientific evaluation |
| Tracked nondeterministic implementation artifacts | REMOVE FROM SOURCE AUTHORITY | Replace with immutable release evidence/index, subject to later implementation approval |
| Generic institutional investigation platform | DEFER | Too much legal/privacy/workflow risk before wedge validation |

## 15. Feature gates and smallest release scope

### Must exist in the strategy-validation prototype

- versioned receipt schema, qualified verification/scientific/disclosure/numeric policies and six-axis result;
- local preflight with exact inclusion/redaction preview;
- deterministic compile/verify with pass/fail/unknown and stable machine output;
- explicit evidence mode and policy version on each check;
- public TCK plus independent verifier exercise using a clean-room implementation/team;
- correction/supersession and challenge note;
- portable export and compatibility report;
- one narrowly specified computational domain pack;
- accessibility-safe receipt reading and CLI alternative;
- evidence ledger for the pilot itself.

### Must not be built for Gate 0–1

Multi-agent orchestration, generic chat, marketplace/plugins, multi-tenant SaaS, institutional case management, automatic misconduct risk scores, broad media detection, general experiment execution, real-time collaboration, mobile apps, leaderboard or 28-domain expansion.

### Success metrics

Primary: percent of independent handoffs that produce a correct downstream action; verification completion without author help; time to locate a material gap; correction/appeal completion; false-block and unsafe-pass rates by policy; abstention comprehension; privacy disclosures prevented. Guardrails: no irreversible automated decisions, no high-severity security event, no undeclared network/data transmission, no claim stronger than ledger status.

Vanity metrics excluded: repository lines, raw test count, receipt count, page views, number of domain labels, number of detectors and model-token volume.

## 16. Strategy gate conditions

The pivot may proceed only if all are met:

1. at least five of eight observed real handoffs use the receipt to take a meaningful downstream action;
2. two of three independent clean-room verifiers complete the bounded task without author-controlled state;
3. one domain pack reaches predeclared expert agreement/error thresholds and publishes its limitations;
4. affected users correctly distinguish a conformance result from truth/misconduct in ≥90% of moderated critical-comprehension tasks, with zero severe-action misunderstandings;
5. local privacy and security review finds no unmitigated critical/high risk;
6. one named product owner, scientific policy owner, security receiver and release owner accept accountability;
7. current-runtime/release gates pass from one immutable clean candidate on two supported OS environments.

Failure routing:

- demand/workflow failure → I (standards/evaluation only) or J (stop product);
- independent-verification failure → local self-check only, remove third-party claim;
- scientific-validity failure → structural/provenance checks only, no domain verdict;
- privacy/authorization failure → single-user local mode only;
- maintenance/ownership failure → freeze new surfaces and publish archival assets without operational promises.

## 17. Dangerous assumptions that can overturn this strategy

- Users value a receipt enough to change handoff behavior; no repository evidence proves it.
- A neutral open protocol can build trust without a standards body or independent implementers.
- One or two computational domains offer a sufficiently repeatable ground truth and acceptable error cost.
- “Policy conformance, not truth” is compelling enough for competition judges and eventual adopters.
- Local-first UX can hide packaging complexity without hiding evidence or creating false assurance.
- A small team can govern cryptography, scientific policies, privacy and cross-platform distribution simultaneously.

These are experiments, not roadmap promises.
