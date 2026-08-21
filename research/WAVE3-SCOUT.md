# Wave-3 Scout — trigger measurements + candidate due diligence (2026-08-22)

**Author context:** produced by the parallel research session while the EV2 closeout session
owns `.control/`+`evidence/W-EV2/`+`eval/` closeout. This file is the Wave-3 decision-evidence
feed for the next Marginal Value Gate. Raw data: `spikes/output/relation-precision*.jsonl`,
read-only queries against `.far-run/far.db`.

## 1. Deferred-candidate trigger measurements (registry §B)

### 1.1 GROBID / fulltext phase B — trigger data measured

Trigger was: "when fulltext phase A ships and residual pdf_url demand is real".

Phase A shipped (live-verified). Residual demand, measured across 278 source_documents in 25 runs:

| contentDepth | docs | share |
|---|---|---|
| abstract | 226 | 81.3% |
| metadata_only | 34 | 12.2% |
| full_text | 18 | 6.5% |

Identifiers: openalex=211, doi=220, arxiv=67, pubmed=15 (multi-valued). accessState: open=265
(95%), paywalled=13. oaUrl present on 265 docs.

Interpretation: docs reachable by phase-A channels (arXiv LaTeXML, EuropePMC JATS) are ≤ 82/278
(29%); **~65% of OA docs are DOI-only** and would need PDF→text (GROBID-class) for fulltext.
Residual demand is real IN SHAPE. However deepening is deliberately bounded (≤3 docs/run), so
phase B's value depends on whether deeper corpus improves outputs (unproven) vs infra cost
(Docker sidecar + JVM = new service; minimal-architecture bar). Gate should decide: measure
quality delta on a deepened slice first, or defer until product-level demand (user-supplied PDFs)
exists.

### 1.2 Local ONNX cross-encoder rerank — trigger NOT met (measured)

Trigger was "pool > 60 or offline need". Pre-selection pool sizes from 15 corpus_snapshots
(fusion.instrumentation era): **max=44, mean=23.1, over-60 count=0**. LLM listwise rerank applied
successfully on every snapshot. Offline-need is absent (DeepSeek route works; product is
API-based). → stays DEFER with quantitative evidence.

### 1.3 Local ONNX NLI as claim-relation cross-checker — trigger MET (P1 finding, see §2)

Trigger was "if LLM-only relation precision measured insufficient". Measured 2026-08-22:
**insufficient** (blind re-judging, see §2).

## 2. P1 FINDING: claim→hypothesis relation labels unreliable, `contradicts` severely so

**Spike:** `spikes/relation-precision.mjs` — blind same-family judge (deepseek-chat, temp 0),
stratified seeded sample of claim→hypothesis `evidence_relation` objects from completed runs.
Judge sees claim text + bound source quote + hypothesis statement; pipeline label compared after.
Data: `spikes/output/relation-precision.jsonl` (N=25: supports 12, contradicts 8, weakens 5;
qualifies quota unfilled — all 102 completed-run `qualifies` relations are F4 claim-claim links
with no targetHypothesisId, excluded by design).

| pipeline label | exact match | adjacent (contradicts↔weakens, qualifies→supports) | total |
|---|---|---|---|
| supports | 7 (58.3%) | 3 | 12 |
| **contradicts** | **1 (12.5%)** | 1 | 8 |
| weakens | 2 (40%) | 0 | 5 |
| **overall** | **10 (40.0%)** | 4 (56.0% incl.) | 25 |

**Replication (seed 777, 12 fresh `contradicts` only, excludes first sample;**
`spikes/output/relation-precision-contradicts-r2.jsonl`): **0/12 exact**, 2/12 adjacent
(weakens), 8 unrelated, 2 qualifies, **2 direction-reversals judged `supports`**.
**Pooled contradicts: 1/20 exact (5%), 4/20 (20%) adjacent-inclusive.** Judge errors 0 both runs;
mismatch confidences frequently 0.9–0.95.

Errors: 0. Judge confidences on mismatch often high (0.9–0.95).

**Manual cross-check (main agent, 3/3 contradicts mismatches read in full):** in all three, the
pipeline label overclaims and the blind judge is more defensible:

1. `ev_ab50…` — claim "PEnGUiN outperforms both EGNNs and standard GNNs" (MARL) labeled
   contradicts against an equivariant-classification hypothesis; pipeline rationale misreads the
   claim as "standard GNNs can outperform equivariant ones" (not what it says) + domain mismatch.
2. `ev_15x3…` — leaky-ReLU stable-rank claim labeled contradicts against a double-descent
   smoothness hypothesis; no actual incompatibility asserted.
3. `ev_wenp…` — REM-disruption evidence vs protein-synthesis hypothesis: genuine tension but
   "qualifies" (alternative locus), not "contradicts".

**Controlled contrast — F4 claim-claim relations audit (seed 4242, N=20;**
`spikes/output/relation-precision-f4.jsonl`): **80.0% exact** (contradicts 8/10, supports 4/6,
qualifies 4/4). Same judge, same blind protocol, same day, same model family. The F4 stage
(evidence.ts D-018) has strict definitions, `not_comparable` escape, shared-subject requirement
and a referent-overlap prefilter; falsify has none of these. **The 40%-vs-80% delta is
attributable to generation-stage design, not judge noise — and F4 is the in-repo template for
the falsify fix.**

**Root cause (code-level, src/pipeline/stages/falsify.ts):**
1. `contradicts` is the DEFAULT label for counter links:
   `mkRelation(weakening.has(id) ? 'weakens' : 'contradicts', id)` — any counter link not
   explicitly listed in weakeningClaimIds becomes "contradicts".
2. System prompt sets an adversarial-reviewer role with no strict contradicts/weakens
   definitions and no "insufficient/not-relevant" abstention option.
3. `availableClaims` passes only `{id, text, bindingStatus}` — bound source quotes are NOT
   included, inviting cross-domain stretching.

**Blast radius (why P1):** these relations feed `bucketClaims` → hypothesis
supporting/counter evidence, counter-evidence seats, scorecard/tournament inputs. EV1's
"+104% counter-evidence relations" (quantity) needs a quality asterisk: with only 1/20
`contradicts` labels surviving blind re-judging (and 2/20 judged as `supports` — direction
reversals), counter-evidence signals are substantially noise.
Mitigating disclosure: judge is same-family (deepseek) without corpus context — but replication
+ manual 3/3 confirmation make judge-noise an insufficient explanation.

**Fix directions (for Gate to sequence, not silently dropped):**
- prompt: strict label definitions + abstain option + include bound quotes + require quoting the
  tension span; make `weakens` the default counter label, reserve `contradicts` for asserted
  incompatibility;
- deterministic cross-check (the ONNX-NLI candidate — trigger now met; or lighter keyword/quote-
  containment gate) before a relation may carry `contradicts`;
- regression eval: extend `spikes/relation-precision.mjs` into eval/ with pass bar.

## 3. Subagent due-diligence results

### 3.1 Idea2Plan + POPPER license verification (done 2026-08-22)

**Idea2Plan** ([arXiv 2510.24891](https://arxiv.org/abs/2510.24891), MSR):
- Published dataset repo `github.com/Jn-Huang/idea2plan_icml2026` is **404** (not in author's
  repo list, no forks, no HF dataset) → **running the subset is BLOCKED** (registry's "verify
  license before running subset" resolves to: dataset unreachable, license unverifiable).
- Paper-level mechanisms remain borrowable (published methods, not code): the **5-section
  research-plan schema** (Introduction w/ measurable objectives+RQs / Key Literatures w/
  relevance notes / Methods / Initial Experimental Design / Resources-Compliance-Ethics; excludes
  timeline/logistics as LLM-unknowable) and the **JudgeEval protocol** (2 independent annotators
  κ=0.768 + tie-breaker; per-section binary rubric → macro-F1; all judges leniency-biased).
- Engineering signals from the paper: literature grounding is the hardest section; ReAct agents
  did NOT beat direct prompting; SFT on idea→plan pairs hurt via hallucination; best planning
  accuracy 62% — headroom real.
- Decision: **ADAPT (paper-level only)**; re-trigger when the repo/dataset reappears.

**POPPER** ([github.com/snap-stanford/POPPER](https://github.com/snap-stanford/POPPER), ICML 2025):
- Root listing via GitHub API: **still no LICENSE file** (last push 2025-05-14, dormant;
  setup.py `license='MIT'` is metadata, not a grant) → **code DEFER unchanged** (triple gate i).
- Paper-level mechanism is the valuable part and legal to port: **sequential falsification with
  e-value aggregation and strict Type-I error control** (alpha-spending over ≤5 staged tests,
  relevance-checker gating). FAR-Lab's falsify stage produces single-shot decision rules with
  no multiple-testing discipline — this is a Direction-A core rigor upgrade with zero
  supply-chain exposure (EXTRACT mechanism → TS reimplementation).
- Decision: **EXTRACT (paper mechanism)** — strong Wave-3 candidate alongside §2's label fix.

### 3.2 Open-world 10-dimension scan (done 2026-08-22; probe-verified where marked)

Top findings (full detail in scan agent report; all license/maintenance claims source-cited):

1. **OpenAlex API policy drift** — pricing blog announces mandatory key + usage-based pricing
   (since 2026-02-24, $1/day free per key) + fulltext PDF/TEI downloads for 60M OA docs +
   semantic search beta + deprecated filter-search syntax (new OQL). **Probe-verified NOW
   (2026-08-22 04:10 local): keyless `?search=` and DOI lookup both return 200** — keyless
   still works, contradicting the scan agent's "broken" framing; drift is real but not an
   outage. Our adapter already uses `?search=` (src/sources/openalex.ts:139), so no syntax
   migration needed. Adaptation item: optional `OPENALEX_API_KEY` + optional fulltext-download
   adoption (bears on §1.1 GROBID decision!). Registry already flags
   "keyless limited tier is a policy-drift risk".
2. **FIRE-Bench rediscovery eval** (arXiv 2602.02905, ICML 2026): agent must re-derive
   PUBLISHED findings from pre-discovery corpus; F1 vs established findings = objective truth,
   no LLM judge, no circularity. EXTRACT design → complements MLR-Bench for honest FAR-Lab
   evaluation. Code availability UNVERIFIED.
3. **Trusted-anchor debiasing gate** (arXiv 2607.02104): covariate-corrected BT from pairwise
   comparisons is UNIDENTIFIED; gate bias-correction on K≥10 trusted anchor pairs (zero false
   enables in 6000 gates); pairwise rendering control beats post-hoc correction; gains only
   for cheap-competent judges (ρ=−0.84), none for frontier. Direct upgrade candidate for the
   Robin-style tournament (D-016).
4. **jsonrepair** (ISC, zero-dep, actively maintained): deterministic repair layer before
   schema validation — 5th tolerance layer. NOTE: conflicts with zod-only runtime invariant
   unless vendored; Gate must weigh vs hand-written repair.
5. **DeepSeek strict function-calling beta** (`api.deepseek.com/beta`, `strict:true`):
   server-side JSON-schema validation — provider-capability matrix in the model-agnostic
   gateway (strict where available, tolerance layer as last resort).
6. **models.dev registry** (MIT, live): community DB of 1600+ models / 25+ providers with
   standardized endpoints — build-time snapshot could turn the "all models worldwide" claim
   into registry-backed reality.
7. **Claimify select→disambiguate→decompose** (MSR 2025, paper-only): claim atomicity +
   decontextualization for evidence binding — relevant to §2's precision problem AND
  claim-grounding tightness.
8. **SciArena-Eval** (NeurIPS 2025 D&B): meta-benchmark for how well LLM judges match expert
   preferences on scientific tasks — calibration harness for FAR-Lab's own judge prompts.
9. **AstaBench** (Ai2): external-comparability task family mapping; license UNVERIFIED.
10. **Streamdown** (Apache-2.0, Vercel): streaming markdown renderer — conditional, only if
    web report view streams generated content.

Saturated dimensions (nothing new above covered baseline): D1 AI4S frameworks, D3 scholarly
APIs (beyond OpenAlex item), D7 provenance (RO-Crate 1.2 stable/2.0 modular — deferral stands),
D8 wasm (no new pure-wasm reranker; wllama noted as only TS-runnable local-LLM option, MIT).

### 3.3 ONNX rerank/NLI wasm feasibility (done 2026-08-22; source-verified)

**Verdict: conditional GO technically, DEFER now.** Key facts (all primary-source):

- **transformers.js v4.2.0 is OUT as a runtime dep**: hard deps on `onnxruntime-node` + `sharp`
  (native binaries install on `npm i` regardless of use); Node branch of its onnx backend
  throws on `device:'wasm'` (v4 source read; supportedDevices excludes wasm in Node). Also:
  **no `text-ranking` pipeline exists** (HF snippet-generator artifact; real rerank usage is
  AutoModelForSequenceClassification over logits).
- **Viable pure-wasm stack**: `onnxruntime-web` 1.27 (pure JS+wasm, MIT; Node = single-threaded
  wasm EP only, per official docs) + `@huggingface/tokenizers` 0.1.3 (pure JS, Apache-2.0,
  zero deps) + ~100–200 lines glue (pair encode, session.run, id2label — entailment index
  DIFFERS between deberta-NLI and bert-MNLI, must not be hardcoded).
- **Models**: rerank ms-marco-MiniLM q8 ≈23MB; NLI nli-deberta-v3-xsmall q8 ≈21.4MB
  (apache-2.0); all ONNX-ready in Xenova HF repos; HF API `?blobs=true` provides sha256 for
  pinning (transformers.js does NOT hash-verify downloads — must self-verify).
- **Latency**: NO published Node benchmarks; browser-wasm extrapolation suggests ~20–100ms
  per 256–512-token pair single-threaded on commodity CPU → 60-pair rerank ≈1.5–6s (estimate,
  unmeasured). Spike design documented in agent report (isolated package.json under
  spikes/, native reference group, correctness checks, RSS).
- **fastembed** (npm) also native (onnxruntime-node); no other production-grade pure-wasm
  alternative exists.

**Convergence note (two-session coordination, 2026-08-22 ~04:15):** the closeout session's
D-023 (harvesting this spike's first run) converged on the same defect attribution and chose
a **deterministic topical gate** (D-018-style prefilter) on falsify critique links + REJECTing
the NLI candidate for this pattern, with post-gate re-measurement queued. §5's fix spec is
complementary, not competing: topical gate selects WHICH links are considered; label
discipline (definitions + bound quotes + weakens-default) fixes the labels of gated links.
Both belong in the fix. §3.3 closes the ONNX question: candidate stays DEFER (rerank trigger
unmet, NLI pattern REJECTED, feasibility documented if a future trigger fires).

## 5. Fix spec for item #1 (falsify relation reliability) — implementation-ready

Scope: `src/pipeline/stages/falsify.ts` + tests (new file, to avoid riding the closeout
session's in-flight test edits). Persisted domain objects unchanged (EvidenceRelation already
supports 'qualifies'; bucketClaims polarity map already handles it). Old runs stay valid.

1. **Schema v2** (`FalsifyOut`): replace `counterClaimIds: string[]` + `weakeningClaimIds:
   string[]` with `counterLinks: Array<{claimId, relation: z.enum(['contradicts','weakens',
   'qualifies']), linkReason (>=20 chars)}>`; keep `supportingClaimIds`/`supportingLinks`.
0. **Deterministic topical gate** (per D-023, same rule family as D-018's
   `crossRelationPairs` prefilter): before a claim may be linked to a hypothesis's critique,
   it must pass a topical-overlap check; gated-out links are dropped with visible warnings,
   never silently kept. This fixes the "topical-distance" defect class (my 3/3 manual
   mismatches were all cross-domain stretches).
2. **Prompt**: port F4's discipline (evidence.ts D-018 wording): strict per-label definitions
   ("contradicts" = asserts a finding directly incompatible with THIS hypothesis's core
   mechanism/prediction; "weakens" = reduces confidence without direct incompatibility;
   "qualifies" = adds scope conditions); explicit abstention ("only link claims genuinely
   relevant to THIS hypothesis's mechanism — when in doubt choose the weaker label or do not
   link; never invent a conflict"); include each claim's bound quote in `availableClaims`
   (`{id, text, quote, bindingStatus}`).
3. **Deterministic default**: any counter link whose relation is absent/unparseable defaults to
   **'weakens'** (never 'contradicts').
4. **Tests** (new file): explicit-label pass-through; default-weakens; invalid-claim-ref
   dropping preserved; quote present in payload; completeness gate unaffected.
5. **Verification protocol**: full suite + typecheck + lint → one live run → rerun
   `spikes/relation-precision.mjs` (claim→hyp mode) on the new run's relations → compare vs
   this file's §2 numbers (target: contradicts exact ≥ 8/10-level like F4; report honestly
   whatever comes out; do not tune to the bar).
6. **Blast-radius note**: ranking consumes buckets via polarity (both counter kinds → counter
   bucket), so expected effect is fewer FAKE counter claims (misclassified "unrelated")
   → cleaner supporting/counter separation; EV1 "+104% counter-evidence" quantity metric gets
   a quality-qualified reading either way.


## 4. Decision feed for Marginal Value Gate

Ranked by expected value (P1 first):

| # | candidate | trigger state / evidence | recommendation |
|---|---|---|---|
| 1 | Relation-label reliability fix in falsify (port F4 discipline: definitions + escape + quotes + weakens-default) | P1: contradicts 1/20 exact, 80%-vs-40% controlled contrast vs F4 (§2) | **GO** — highest-value executable; directly restores counter-evidence scientific truth |
| 2 | Trusted-anchor gate + pairwise rendering control for tournament | identifiability result + zero-false-enable evidence (§3.2.3) | GO — small, rigorous, protects ranking integrity |
| 3 | FIRE-Bench rediscovery eval design | objective-truth eval, no judge circularity (§3.2.2) | GO as eval harness work (multi-day; sequence after #1) |
| 4 | OpenAlex adaptation (optional key + syntax migration + optional fulltext download) | policy drift real, keyless still 200 today (probe §3.2.1) | ADAPT soon; fulltext download option interacts with #7 |
| 5 | POPPER e-value sequential falsification (paper-EXTRACT) | Direction-A core rigor, zero supply-chain (§3.1) | strong Wave-3 item (code stays deferred: no LICENSE) |
| 6 | DeepSeek strict FC beta + provider capability matrix | server-side schema validation (§3.2.5) | ADAPT — reduces tolerance-layer load |
| 7 | OpenAlex fulltext downloads / GROBID phase B | ~65% docs DOI-only OA (§1.1); OpenAlex now serves PDF/TEI for 60M OA docs | OpenAlex-download first (no infra), GROBID stays deferred |
| 8 | Idea2Plan 5-section template + JudgeEval | paper-ADAPT legal (§3.1) | fold into proposal rendering/eval; subset-run BLOCKED (repo 404) |
| 9 | models.dev provider registry snapshot | MIT, live (§3.2.6) | supports model-agnostic claim; low cost |
| 10 | jsonrepair 5th tolerance layer | ISC zero-dep but breaks zod-only invariant (§3.2.4) | Gate decision; weigh vs strict-FC (#6) making it moot |
| 11 | ONNX NLI cross-checker | trigger MET via §2 but D-023 REJECTs for this pattern (deterministic gate chosen instead) | REJECT for this pattern; wasm feasibility documented (§3.3) for future triggers |
| 12 | ONNX rerank | NOT met (max pool 44<60) (§1.2) | stay DEFER |

## 6. Post-execution verification record (scout session, 2026-08-22 04:35)

Independent verification of the closeout session's Wave-3 landings (all recomputed from raw
files by the session that produced §1-§5):

- **ea3fb1b + 96b9ae0 (relation-label fix)**: reproduced post-fix measurement exactly —
  `relation-precision-postfix.jsonl` N=11, exact 6/11 (54.5%), adjacent 7/11 (63.6%);
  contradicts label class eliminated on the live run (0 produced vs pre-fix 11-19/run mostly
  wrong). Pre-fix pooled baseline 26/57 (46%) reproduces from r1 10/25 + r2 0/12 + r3(F4)
  16/20. Evidence file's run-heterogeneity disclosure (8/10 from run_28ph vs 0/12 across 8
  ML runs) confirmed. Fix = all five §5 items landed (topical gate ea3fb1b; schema v2 +
  definitions + quotes + weakens-default 96b9ae0).
- **df3be48 (POPPER multiple-testing discipline)**: reviewed — declaration-gate design is
  statistically sound (three policy definitions correct; single-hypothesis exemption valid;
  no silent default). Tests cover the three states. **Two P3 hardening suggestions** (owner
  decides): (a) `alpha_spending` without `multipleTestingNote` currently passes — the note IS
  the allocation and should be gate-required for it; (b) `single_primary` passes without
  designating WHICH comparison is primary — consider requiring the note for all multi-hypothesis
  policies (schema docstring already says "auditable rationale, not just the label").
- **Gate battery at this checkpoint**: `npm test` 241/241; `npm run typecheck` clean;
  `completion-gate.mjs` VERIFIED_READY (19 live_verified + 1 tested, 0 missing/failed);
  secret-scan PASS; path-hygiene was FAILED (fcdadd6 deleted START_HERE.md +
  FINAL_BUILD_PROMPT.md) → restored in 69d4f1b, now WARN-only (gitignored dist/node_modules
  notices, pre-existing).
- **Open question for Gate**: post-fix supports precision (~62%) sits at the label-granularity
  boundary (supports↔qualifies adjacency dominates residual error); N=11 single-run. A future
  cross-domain postfix measurement would sharpen it — recorded, not blocking.

## 7. Final status (scout session, 2026-08-22 06:15)

- #1 relation-label reliability: EXECUTED (ea3fb1b + 96b9ae0) + independently verified by
  this session (§6).
- #6 strict-FC: audited (D-029 — P1-1/P1-2 refuted with live-probe evidence, P2-1/P1-3
  confirmed), fixed (7cd3100, 056e931 incl. the inner-quote corruption root-cause), and
  FULLY live-verified: run_prrxcee6 41/41 tool_calls across all 9 stages, zero failures
  (evidence/W-EV2/strict-fc-live-verification.md, D-030).
- #8 Idea2Plan template: EXECUTED (a0d0af9) — eval rendering v2, five sections,
  deterministically verified via --render-only; v1↔v2 comparability disclosed.
- #3 FIRE-Bench rediscovery: harness landed by the closeout session (a05a746); live run in
  flight at time of writing.
- NEW USER-ACTION items surfaced live: OPENALEX_API_KEY (keyless pool now HARD budget-capped
  daily — D-029b) and DASHSCOPE_API_KEY (B-QWEN-LIVE-ROUTE, submission-mandated).
- #9 models.dev remains network-blocked; ONNX rerank/NLI stay DEFER/REJECT per §3.3/D-023.
