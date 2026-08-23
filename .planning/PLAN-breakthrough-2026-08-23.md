Status: ARCHIVED (BP1-BP5 landed + adversarial audit closed; see EXECUTION_STATE phase note) — 2026-08-24

# Breakthrough Saturation Plan — 2026-08-23 overnight mission

Mission: MAKE FAR-LAB CROSS A LEVEL. Not incremental polish. Chosen by
`Scientific Impact × User Impact × Architectural Leverage × Reuse × Feasibility`,
grounded in 4 parallel code surveys + GUI dogfood on real runs (52-run library).

Constraints honored: no live API testing (offline/deterministic verification only;
live-required items marked BLOCKED-live), zero new Node runtime deps (zod-only),
no DeepSeek, lane ownership respected, UI states map real runtime state.

## BP-1 Adaptive research intelligence (core runtime breakthrough)
Problem: pipeline = fixed linear `prompt→model→JSON` sequence; production-grade
agent kernel exists but only reachable post-hoc via CLI; no budget governance.
Slices:
1. RunBudget ledger: per-run token cap (env-configurable), tracked at callStructured
   via stage ctx; stages check remaining; exhausted → honest partial completion with
   reason `budget_exhausted` (never fake success). Cost map from receipts.
2. Quality gate: after rank, deterministic weakness signal (top composite + BT
   dispersion + swap-disagreement). Weak → ONE bounded regeneration round of
   generate_hypotheses with critique context injected (why previous batch weak),
   then re-critique/re-rank. Loop bounded (max 1 retry round), visible in timeline.
3. Evidence investigation: replace hardcoded gap-seek with scoped agent-loop
   (existing kernel + search tool) bounded by turns+budget, falling back to legacy
   gap-seek path when agent loop unavailable.
Files: src/app/orchestrator.ts, src/pipeline/types.ts, src/pipeline/llm.ts,
src/pipeline/stages/{rank,hypotheses,evidence}.ts, new src/app/run-budget.ts.
Tests: deterministic (test-stub provider), assert bounded retries, honest skip,
budget stop, gate triggers only on signal.

## BP-3 Research-product output layer (scientific credibility breakthrough)
Problem: export = internal workbook; no paper projection, no limitations synthesis,
no BibTeX. Slice: deterministic IMRaD renderer (no LLM) from stored objects:
Title/Abstract-skeleton/Introduction/Methods (preregistration projection)/
Results (rankings + evidence bodies + experiment verdicts)/Discussion
(limitations synthesis: evidence ceiling, uncalibrated-judgment density,
stipulated thresholds, unresolved verifications)/References (BibTeX from source
metadata). Wired into export stage + bundle + web download.
Files: new src/domain/paper-outline.ts, src/pipeline/stages/export.ts, web verify tab.
Tests: every cited claim/source resolves; limitation sections derive from real
counts; bibtex validity (id escaping, required fields).

## BP-2 Researcher sovereignty: direct edit into causal revision chain (product breakthrough)
Problem: researcher can only VIEW; corrections require full AI feedback round-trip.
Slice: hypothesis statement/mechanism/prediction inline edit (web) → server
endpoint creates versioned edit op (source=human_expert), archives predecessor,
flags downstream staleness (falsification spec), receipt; revision history shows
human edits in same causal chain. Plan edit deferred (recorded debt).
Files: src/server/{api,hypothesis-ops}.ts, web HypothesesTab/HypothesisCard.
Tests: edit→version bump→predecessor archived→stale flag set→revision chain row.

## BP-4 Model control plane v2 (product + runtime)
Problem: no cost visibility, no failover, no model discovery; users shouldn't
need env vars. Slices:
1. Usage/cost ledger: aggregate receipts per run + per config; static price map
   for known models, `unknown pricing` honest display for custom; settings
   dashboard + per-run spend in header meta.
2. Fallback chain: ordered config ids; resolution at stage boundary retries next
   on transient/5xx/quota with cooldown; failures receipted.
3. Model discovery: list models from OpenAI-wire `/v1/models` + Ollama `/api/tags`
   (live button; offline tests via stub; live run BLOCKED-live).
Files: src/domain/model-config.ts, src/app/provider-resolver.ts, src/server/api.ts,
web SettingsPanel.
Tests: failover order/cooldown unit tests; ledger aggregation math; discovery
parse shapes.

## BP-5 Confirmatory binding + power (scientific execution; time-permitting)
approve-experiment endpoint → BindingApproval (approver+timestamp+snapshot);
impliedPower on StatReport (normal approx); UI badge + warning <50% power.

## Gates (all BPs)
vitest full suite green (844+ baseline, new tests added), tsc+build both ends,
lint clean, secret-scan, completion-gate. GUI verification on rebuilt dist with
fresh server. Red-team (adversarial-auditor) before close. Morning delta report
with before/after evidence.

## Deferred (recorded, not silently dropped)
Collaboration/sharing layer (needs identity model decision), PDF/LaTeX export,
cross-run knowledge graph, offline service worker, plan-step direct edit,
GPU/compute plane (remote gateway remains Docker-gated user-side).
