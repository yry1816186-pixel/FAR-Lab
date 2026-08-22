# WAVE-G SCOUT — Weakness-Driven Open-Source Scouting (governance summit wave)

Date: 2026-08-22 · Method: 4 parallel scout lines, weakness-selected from WP1/WP2 findings +
`eval/north-star.json` laggards + registry B deferrals; every candidate triple-gated
(exists / maintenance / license); anti-duplication against WAVE3..WAVE9 + TECH_CANDIDATES
checked. Decision vocabulary mandatory; reversal triggers recorded. Main agent verified
load-bearing citations (CounterRefine arXiv page fetched HTTP 200, title matched) and executed
the fusions that passed the Marginal Value Gate.

## 0. Weakness → line mapping (why these lines)

| Weakness (evidence) | Scout line |
|---|---|
| counter-evidence-substantive-hit 0.143 vs 0.70; misses 5/7 EMPTY (topical drift) | L1 contrastive/counter-evidence retrieval |
| our own Skills/plugin/wave-prompt orchestration quality | L2 Skills/plugin engineering |
| public-release hygiene gaps (WP1 proposal: no LICENSE/SECURITY/CI/policy docs) | L3 world-class repo governance |
| novelty honesty, plan statistical rigor, claim certainty (north-star laggards) | L4 same-category scientific tools |

## 1. Line 1 — counter-evidence retrieval & claim verification

| Candidate | Gate | Decision |
|---|---|---|
| **CounterRefine** (arXiv:2603.16091, verified live: HTTP 200; paper CC BY-SA 4.0 per agent metadata) | PASS×3 | **ADAPT → EXECUTED as W-G/F-A** (mechanism: answer-conditioned expansion; we ported the PATTERN as a deterministic repair — no code copied) |
| SciFact/VeriSci (allenai; paper CC BY prose, repo license NOASSERTION) | license FAIL (code) | KEEP (two-stage retrieve→rationale concept as future fulltext-deepening reference); REJECT code. Reversal: upstream adds a permissive LICENSE. |
| scite.ai smart citations (paper public; model/API proprietary) | partial | EXTRACT taxonomy only (contrast sub-types) — recorded, NOT executed (additive label without a measured failure mode; revisit with relation-blind-agreement live data). |
| SparseCL (contradiction ranking; no license + needs embeddings) | FAIL | REJECT (zero-dep invariant + license). Reversal: license + ONNX deferral lifted. |
| args.me (CC BY 4.0) | PASS | REJECT for this gap (debate-portal domain ≠ scientific mechanisms). Reversal: cross-domain argument-mining evidence. |

**Fusion W-G/F-A EXECUTED** — anchored counter queries in `src/pipeline/stages/retrieve.ts`:
deterministic `anchorCounterQueries()` repair (containment floor 0.3 vs question+background
tokens; appends ≤4 uncovered anchor terms, first-appearance order; preserves counter
vocabulary) + SYSTEM_PROMPT anchoring rule. **Offline replay measured (real DB, zero API
calls)**: 40 historical runs × 2 counter queries → anchor pass-rate **0.563 → 0.825**
(spikes/waveg-anchor-replay.mjs). Unit tests lock repair determinism/passthrough/bounds.
Live retrieval-quality delta + north-star re-measurement: BLOCKED on model routes (D-036) —
recorded UNVERIFIED-live, no claim made.

## 2. Line 2 — Skills/plugin engineering (user-mandated focus)

| Candidate | Gate | Decision |
|---|---|---|
| anthropics/skills (MIT) — description-as-router, progressive disclosure | PASS | **ADAPT (harness docs improvement)** — our zcode-harness skills' frontmatter descriptions are the routing surface; improving them is queued as harness polish (S effort). |
| Claude Code plugin format (public docs; proprietary impl) | docs-only rule | KEEP pattern reference; our plugin already mirrors commands/hooks/agents — no code action. |
| opencode plugins (MIT) | PASS | KEEP (permission-model reference for future). |
| cursor rules scoping | public format | KEEP (context-economy pattern; no action this wave). |
| LangGraph declarative retry/checkpoint patterns (Apache-2.0, design only) | PASS | **KEEP as design reference — our W8 leases/checkpoints already implement the imperative equivalent** (verified in WP2 review); no framework adoption (zero-dep invariant). |

No code fusion from L2 this wave (highest-value items are documentation/polish of our own
harness); recorded honestly rather than forcing a low-value change.

## 3. Line 3 — world-class repo governance → public-release hygiene

| Pattern (upstream evidence) | Decision | Status |
|---|---|---|
| SECURITY.md + threat model (honojs/hono, paper-qa SECURITY.md) | **BUILD — EXECUTED** | `SECURITY.md` landed (this wave) |
| Zero-dep policy doc (nalgeon/zero pattern CC0; hono practice) | **BUILD — EXECUTED** | `DEPENDENCY_POLICY.md` landed (states the zod-only invariant + exceptions process) |
| Minimal CI (vitejs/vite ci.yml pattern; Windows runner) | BUILD — **USER-GATED** (CI platform choice) | workflow draft recorded; not created |
| release-please changelog (googleapis) | BUILD — USER-GATED (release automation) | recorded |
| CONTRIBUTING.md (vite pattern) | BUILD | queued with public-release export (WP1 proposal §2) |
| Data/code separation (paper-qa/scifact pattern) | ALIGNED | WP1 export allowlist already implements this boundary |

## 4. Line 4 — same-category scientific tools (gaps not previously scouted)

| Candidate | Gate | Decision |
|---|---|---|
| **GRADE framework** (public methodology; GRADEpro tooling commercial — NOT used) | PASS (methodology) | **EXTRACT → EXECUTED as W-G/F-B**: deterministic GRADE-lite certainty ladder (`gradeClaimCertainty` in `src/domain/claim.ts`), attached at claim admission, surfaced to the falsify/relation judge payload. Soul-boundary: GRADE supplies the certainty VOCABULARY only; our domain model unchanged. Metric impact (relation-blind-agreement) UNVERIFIED-live. |
| NOVA-Test 3-gate audit (ICML 2026 workshop, paper-only) | paper-only | EXTRACT partial: gates 1/3 already exist in our zod falsification schema + completenessCheck (recorded as ALREADY-COVERED); the novel delta (hypothesis-level contradiction gate) needs live LLM → DEFER with trigger (funded route). |
| Maastricht statistical checklist (public rubric) | PASS | **DEFER→B (small)**: deterministic statistical-design checks (pre-declared power/effect-size) as an EXTENSION of checkPlanExecutability; not executed this wave (behavior change to the executability gate deserves its own slice + tests). |
| SWAN ontology (W3C) | PASS | ADAPT later as an EXPORT interchange (JSON-LD ResearchStatement) — with the public-release export work, not now. |
| OrchBench / Ancestor / Critiplot / Evidence Evaluator / AI-Researcher / CISP / HypER / IdeaSynth / ScienceAgentBench / SparseCL | various | REJECT/DEFER with reasons in the line report (task-execution vs plan-feasibility mismatch; license unverified; visualization-only; dormant; superseded by already-adopted mechanisms). |

## 5. Marginal Value Gate ledger (this wave)

| Fusion | Measured evidence | Gate | Verdict |
|---|---|---|---|
| W-G/P1 bounded stage concurrency (WP4; W8 stretch resumed) | stub benchmark 534→272ms = **1.96×** falsify segment, outputs byte-identical; receipts profile shows 67% of model latency in parallelizable loops | ≥5% | **LANDED** (live full-run re-measure gated) |
| W-G/F-A anchored counter queries | historical replay anchor pass-rate 0.563→0.825 (**+47% relative**) on 80 real queries | eliminates a MEASURED failure mode (5/7 EMPTY misses) | **LANDED** (live retrieval delta gated) |
| W-G/F-B GRADE-lite certainty | deterministic ladder + tests; judge-context surfaced | qualitative + live-gated metric | **LANDED as honest addition** (no metric claim) |
| L2/L3 doc/harness items | n/a | n/a | SECURITY.md + DEPENDENCY_POLICY landed; CI/release/CONTRIBUTING user-gated or queued |

## 6. Registry sync

New/updated rows go to `research/TECH_CANDIDATES.md` (A: CounterRefine ADAPT-executed,
GRADE EXTRACT-executed; B: Maastricht checklist, NOVA-Test contradiction gate, OrchBench,
SWAN export format, scite contrast-types; C rejected with reasons). Reversal triggers as
listed per row.
