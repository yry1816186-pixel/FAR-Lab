# Morning Delta — 2026-08-23 Breakthrough Saturation Mission

**TLDR**: FAR-Lab crossed a level tonight. Five breakthrough surfaces landed, one
adversarial P0 was caught and fixed with a real-stage regression test, and every
claim below has command-level or live-GUI evidence. Final gates: **vitest 935
passed / 2 skipped** (baseline at mission start: 842/844), tsc + build clean on
both ends, secret-scan / path-hygiene / completion-gate PASS.

## What changed, by felt capability (not by file count)

**1. The system now notices its own weak output and acts on it (BP-1).**
Before: a fixed linear pipeline that accepted whatever rank produced and barreled
into planning. Now: a deterministic post-rank quality gate (top-score thinness /
order-swap disagreement / too-few competitors) reopens hypothesis generation for
ONE bounded round with the critique injected into every strategy prompt, a
deterministic paraphrase guard against round-1 restatements, and round-scoped
checkpoints that cannot replay round-1 generations. Attempts stay honest
(attempt=2 visible in the timeline). A run-level token budget (receipts as the
only spend authority) refuses new model calls when spent, skips stages with
reason `budget_exhausted`, never gates export, and re-opens exactly those stages
when the cap is raised and the run resumes.
*Honest scar*: the adversarial audit proved my first version of the reopen loop
was dead code (flag never written; stub tests masked it). It is fixed AND locked
by a regression test that drives the REAL generate_hypotheses stage through the
orchestrator and asserts round-2 hypotheses are actually persisted.

**2. The researcher can now correct the machine directly (BP-2).**
Before: a near-miss hypothesis could only be fixed by writing a paragraph of
feedback and waiting for a full AI round-trip. Now: an inline 编辑 form
(statement/mechanism + mandatory reason) whose save enters the SAME causal
revision chain the product already renders — human_expert feedback → Revision
with before/after → version bump → monotonic staleness uncertainty disclosing
that the falsification spec predates the edit → predecessor archived as a
content-addressed artifact. Verified live end-to-end in the GUI on a real run
(see evidence/wave-breakthrough/gui-verification.md).

**3. The export is now a research PRODUCT, not an internal workbook (BP-3).**
A deterministic (zero-LLM) IMRaD paper projection: Abstract from the ranked
hypotheses, Methods from the frozen plan/preregistration, Results with
mechanical experiment verdicts, Discussion with ACH-derived interpretation, a
Limitations section synthesized from REAL counts (evidence ceiling, uncalibrated
judgment density, stipulated thresholds, unresolved verifications,
single-source bodies, experiment coverage, monotonic uncertainty inventory),
and BibTeX references generated from stored metadata only (escaped, deduped,
honest @misc). Downloadable from the Verify tab; bundled into the
reproducibility bundle. Verified live: the paper for a real run renders with
that run's true counts (12 sources, 48/48 uncalibrated dims, 6/10 stipulated
thresholds...).

**4. Models are a managed plane, not env vars (BP-4).**
Failover chains with LiteLLM-source-verified semantics (rate-limit/timeout/
quota/auth/5xx fail over AFTER each provider's own retries; 400-class and
invalid-output never do; process-level 60s cooldown; the serving route is
visible in every receipt). A receipt-derived usage ledger: the settings panel
now shows the workspace's real spend surface (deepseek 1739 calls / 6.2M tokens,
zai 946 / 2.3M, glm-5.3 266 / 797K tonight) with cost computed ONLY from
user-declared pricing — unknown stays unknown, never estimated. Model discovery
parsers for OpenAI/Anthropic wires (live use BLOCKED-live by the standing
no-live-API directive).

**5. Experiments can now become confirmatory (BP-5).**
The explorer→confirmatory gap closed: a researcher binds a drafted comparison to
a hypothesis (+ declared MDE per the g5 hard gate), the approval snapshots the
CURRENT falsification decision rule, the spec re-validates fail-closed, and
re-execution produces verdict-capable reports. StatReports now carry implied
power (disclosed worst-case convention, same as the MDE floor) with an
under-powered warning when <50%.

## Verification summary
- Full suite: **935 passed / 2 skipped** (skips = Docker user-side condition, unchanged).
- New suites: run-budget (8), quality-gate (8 + real-stage regression),
  paper-outline (9), model-plane-v2 (23), experiment-confirmatory (6), plus
  hypothesis-ops/api additions.
- Live GUI walk on the rebuilt product against the real workspace DB: edit chain,
  paper download (before/after re-export), usage dashboard — screenshots + API
  transcripts in evidence/wave-breakthrough/.
- Adversarial audit: 1 P0 + 1 P1 + 4 P2 found → all fixed; P0 locked by a
  real-stage regression test (stub handlers can no longer mask it).

## Recorded debts (owned, not hidden)
- Agent-kernel wiring into the evidence gap-seek (BP-1 slice 3) — kernel is
  production-grade but still CLI-reachable only.
- Paper outline is download-only tonight (no in-app preview).
- BP-5 approve flow has API+op paths complete; the workbench drawer is pending.
- Model discovery live run: BLOCKED-live under the 2026-08-23 no-live-API directive.
- Collaboration/sharing, cross-run knowledge graph: deferred by design (needs an
  identity-model decision, not code volume).

## Commits
b7347e6 (BP-1) → f80db77 (BP-2) → c91c868 (agent checkpoint) → f791c3f
(BP-3/4/5 + flake root-fix) → cc24715 (parallel HX session: research composer;
absorbed part of the red-team source fixes) → 981f262 (red-team fixes: tests +
remaining files). HEAD gates green.
