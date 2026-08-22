# Wave-Breakthrough 2026-08-23 — GUI & API verification evidence

All verification ran on the rebuilt product (`npm run build` + `web build` + fresh
`serve.mjs` on 127.0.0.1:3196) against the REAL workspace database (52-run library),
within the no-live-API directive (no model calls were made; all surfaces exercised are
deterministic or receipt-derived).

## BP-2 researcher sovereignty (direct edit -> causal revision chain)
- Hypotheses tab renders an 编辑 button on every card; the form prefills
  statement/mechanism, requires a reason, disables submit until valid (walked).
- A no-changed-field submission is honestly rejected by the server with 400
  (`edit requires at least one of statement / mechanism / predictions`) — observed
  live (network request 26).
- A real edit on run_hzxxc7tgjjq3arkvckdnm6nv4c/hyp_ey07yjtft80e213h84r9n99fz1
  returned 200: `version: 1, revisionId rev_m4d6fgdzt17e421zjh9rk2dqja,
  feedbackId fbk_yc9xjjyq2q6e3mj41d02849v4e, predecessorArtifactRef sha256:86a21e…`
  (network request 36, response body recorded).
- Revisions tab renders the FULL causal chain: feedback (human_expert,
  "workbench direct edit (BP-2)") -> 修订 v0 → v1 (modify op with before/after)
  -> 版本差异 ([hypothesis] … human edit (statement) v0 -> v1) -> 剩余不确定性
  (staleness disclosure). Screenshots: gui-verify-tab-paper.png (tab), plus the
  revisions DOM walked via accessibility snapshot.
- The edit made `revisionNewerThanBundle` true → re-export produced a new bundle
  carrying the paper artifact (verified below) — the loop edit -> revision ->
  re-export is closed.

## BP-3 research-product output (paper projection)
- `POST /runs/:id/reexport` → new bundle; `GET /runs/:id/paper` now returns the
  full IMRaD markdown (title, standing uncalibrated-disclosure, Abstract from the
  rank-1 hypothesis — including the sentence added by the BP-2 edit — Methods,
  Results per ranked hypothesis, Discussion, Limitations, Conclusion, References).
- Limitations are real counts from this run: sources=12 (5 metadata-only,
  7 abstract-only, 0 full-text), 48/48 uncalibrated dimensions, 6/10
  model-stipulated thresholds, 17/18 verified + 1 resolved_unaligned called out,
  0/6 experiment coverage, 15 open uncertainties.
- BibTeX entries generated from stored metadata only: `@article{Ayde2023Prediction…}`
  with `\%` escaping, `@misc` for preprints; DOI dedupe applied.
- Pre-BP3 bundle correctly 404s with an honest message ("carries no paper-outline
  artifact (pre-BP3 export)") and the web download button stays hidden until a
  carrying bundle exists (observed both states in the GUI).
- Verify tab shows 「下载论文骨架 (paper.md)」 after re-export
  (screenshot: gui-verify-tab-paper.png).

## BP-4 model control plane v2
- Settings panel renders the 用量与成本 dashboard from REAL receipts across the
  workspace: deepseek/deepseek-chat 1739 calls · 6,211,516 tokens; zai/glm-4.6
  946 calls · 2,301,617 tokens; zai/glm-5.3 266 calls · 796,726 tokens; cost
  column honestly shows 未配置定价 (no invented price tables).
  (screenshot: gui-settings-usage.png)
- `GET /runs/:id` now carries `usage`: run_hzxxc7tgjjq3arkvckdnm6nv4c =
  zai/glm-4.6 · 49 calls · 120,891 tokens · costUsd null · pricingBasis unknown.
- Fallback/pricing editors + 发现模型 button render in the config form (walked);
  live discovery is BLOCKED-live by directive (offline parser covered by tests).

## BP-5 confirmatory binding + implied power
- Server capability verified by tests (tests/experiment-confirmatory.test.ts 6/6):
  approveExperiment binds comparison->hypothesis, snapshots the falsification
  decision rule, bumps spec version, re-validates fail-closed; impliedPowerFor
  math cross-checked against the mdeFloor convention.
- The walked run has no experiment results, so the impliedPower badge render path
  is verified at the component/typecheck level (web tsc clean) — no live GUI
  surface existed to walk. IMPLEMENTED_UNVERIFIED-live for the badge rendering.

## Suites
- Full: 933 passed / 2 skipped (Docker user-side) — includes new suites
  run-budget (8), quality-gate (7), paper-outline (9), model-plane-v2 (22),
  experiment-confirmatory (6), hypothesis-ops +2, api +1.
- npm run build, eslint (changed files), web tsc/build, secret-scan: all PASS.
