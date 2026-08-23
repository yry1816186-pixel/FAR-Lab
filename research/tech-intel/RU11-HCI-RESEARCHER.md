# RU-11 HCI-RESEARCHER — Research Packet + PROPOSAL SKELETON (2026-08-24, SEARCH_SATURATED)

RESEARCH-ONLY per user gating (HCI implementation requires user approval).
Main-Agent direct research. Status: SOURCE_VERIFIED at tool/repo level.

## Problem
Human research-experience plane: E15 reading+annotation surface
(highlight→claim promotion as first-class object) · E16 sensemaking/qualitative
coding · E17 trust-calibration UX · A2.7 keyboard-first screening UX ·
E13.1 methodology onboarding · E14.1 deterministic catch-up summaries ·
D3.3 dataset inspection preview before execution.

## Search vocabulary run
`Rayyan screening keyboard shortcuts adjudication`, `ASReview active learning
screening flow`, `EPPI-reviewer interaction`, `Covidence screening UX`,
`Taguette qualitative tagging`, `ATLAS.ti NVivo coding patterns`,
`Lee See 2004 trust calibration automation`, `overreliance explainable AI
2024 2025 studies`, `confidence sourcing display uncertainty UX`,
`W3C Web Annotation Data Model`, `Zotero annotation model ingest`,
`catch-up summary activity digest design`, `dataset profile preview UX`

## Pattern-source table (SC=probed today)
| Tool/Source | Org | License | Interaction pattern worth borrowing |
|---|---|---|---|
| ASReview | asreview | Apache-2.0, very active (pushed 2026-08-23) | ranked queue screening: one-item focus view, relevant/irrelevant keys, model re-ranks after each label; "last reviewed" resume state |
| Rayyan | Rayyan/Qx | commercial SaaS | blind-mode dual reviewer + conflict adjudication screen; arrow-key triage; labels-as-filters |
| Taguette | remram44/taguette | BSD-3-Clause, active 2026-02 | highlight→tag with codebook sidebar; code co-occurrence view; export coded segments — the open-source qualitative-coding canon |
| Hypothes.is client | hypothesis | custom (NOASSERTION) | annotation anchoring patterns; public/social layers we do NOT need |
| W3C Web Annotation Data Model | W3C | spec | canonical annotation object shape {target selector, body, motivation} — interop-ready schema vocabulary |
| Zotero annotations | existing integration | n/a | we ALREADY ingest these; promotion path exists upstream of E15 |
| Lee & See 2004 + XAI reliance lit (2023-26) | academic | papers | trust calibration needs: process transparency > outcome confidence display; uncertainty must stay visible; timing of explanations matters (before decision) |

## Trust-literature findings (with citations)
- Lee & See (2004, Human Factors): calibration = alignment of trust with
  actual capability; overtrust→misuse, undertrust→disuse. Design rule:
  show capability boundaries WHEN they bind, not generic confidence bars.
- XAI-reliance studies 2023-25 (e.g., "overreliance on AI in clinical
  decision-support", CHI/UIST lineage): numeric confidence alone does NOT fix
  miscalibration; showing SOURCES + when-not-to-trust cases reduces both
  over- and under-reliance; explanation-after-decision has no effect.
- Design consequence for FAR-Lab: verdict cards must lead with evidence
  balance + counter-evidence presence (already computed!), gradeCertainty
  ladder explanation inline, and explicit "what would change this verdict"
  (falsification thresholds already exist as data). NO new confidence numbers
  invented — presentation maps existing objects only (UX truth law).

## Verdicts per leaf (closed vocab)
- E15 annotation/promotion: **BUILD** — first-class `annotation` domain
  object {id, target{sourceId, quote_selector, position}, note?, motivation∈
  {promote_claim, flag_counter, question, tag}, created_by, created_at,
  promoted_claim_id?} following W3C shape; PDF/text readers get selection →
  promote action feeding evidence pipeline as USER-authored claim candidates.
- E16 sensemaking: **ADAPT Taguette pattern** — codebook (flat tags +
  descriptions) over evidence cards and annotations; affinity grouping =
  tag clusters view; qualitative layer rides EXISTING objects (no parallel store).
- E17 trust-calibration UX: **BUILD** — verdict card v2: evidence-balance bar
  (existing counts), counter-evidence list FIRST when present, certainty
  ladder tooltip with downgrade reasons, falsification thresholds shown
  pre-verdict ("verdict will be REAL if effect ≥ X"), source-trust badges
  (RU-6 retraction gate feeds this).
- A2.7 keyboard screening: **ADAPT ASReview queue pattern** — single-focus
  review card, j/k or ←/→ include/exclude, u undo, auto-save cursor, rank by
  existing screening scores (no new ML), progress honest (n/total known).
- E13.1 methodology onboarding: **BUILD minimal** — contextual teaching
  moments anchored to real objects (first falsify-spec → 3-line prereg
  explainer; first GRADE downgrade → ladder explainer); dismissible,
  i18n'd, zero gamification.
- E14.1 catch-up summaries: **BUILD deterministic** — event-spine aggregation
  during absence window: {milestones, verdicts landed, interventions-needed
  count, spend delta}; template-rendered zh/en; ZERO generated prose.
- D3.3 dataset preview: **BUILD** — pre-run audit panel wired to RU-8 audit
  artifact {shape, class balance, missingness, dupes, cleanlab flags};
  blocks nothing but is REQUIRED-visible before execute confirm.

## PROPOSAL SKELETON (for user approval — implementation NOT started)
| # | Item | Effort | Depends on | Sequencing suggestion |
|---|---|---|---|---|
| P1 | Keyboard screening queue (A2.7) | M | none | wave 1 — highest daily-use win |
| P2 | Verdict-card trust surfaces v2 (E17) | M | RU-6 gate for badges | wave 1 |
| P3 | Deterministic catch-up digest (E14.1) | S-M | none | wave 1 |
| P4 | Dataset preview panel (D3.3) | S | RU-8 audit op | wave 2 (post RU-8 impl) |
| P5 | Annotation object + promote flow (E15) | L | web lane coordination | wave 2 |
| P6 | Codebook/sensemaking view (E16) | M-L | P5 | wave 3 |
| P7 | Methodology teaching moments (E13.1) | S | none | sprinkle across waves |

## Integration sketch (owners)
- src/domain/annotation.ts: annotation zod owner (+ store DDL later)
- web/: all UI work — REQUIRES PEX/HX sibling-lane coordination before any file touched
- retrieve/screening stage: expose ranking endpoint for queue order (read-only)
- export: annotations/codebooks included in bundle (provenance-complete)

## Deterministic validation workload (offline)
- catch-up digest golden tests from fixture event streams (exact rendered strings)
- keyboard-path walkthrough scripts (axe + tab-order assertions)
- annotation schema round-trip + promotion creates user-authority claim candidate
- screening queue: rank order stability test + resume-from-cursor persistence

## UNVERIFIED
- EPPI/Covidence detailed flows (SaaS docs gated) — pattern table relies on public descriptions
- Hypothes.is LICENSE text (NOASSERTION) — only schema vocabulary borrowed, no code
- Real researcher validation of P1-P7 ordering (user gate exists precisely here)
