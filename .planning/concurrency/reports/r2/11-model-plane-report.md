# R2 Lane 11 Report — model-plane (Provider/model transport, routing, structured output, usage/cost)

- Branch: `ws/r2/11-model-plane` (from `baseline/parallel-r2` = `47cc373`)
- Worktree: `work/r2-11-model-plane`
- Date: 2026-08-25
- Naming note: the goal-pack header named this lane's branch `ws/r2-model-plane/main`;
  the repo contract (BASELINE.md/INTEGRATION_RULES.md, and all 10 existing lane
  branches) mandates `ws/r2/<nn>-<slug>` — the contract won. Same for the report
  path (`reports/r2/11-model-plane-report.md` per BASELINE "Lane report paths").

## 1. Commits

| SHA | Subject |
|---|---|
| `04baf88` | feat(model-plane): registry, task routing, strict-JSON, prompts, benchmark — **residue PORT** of `build/hx-reconstruction` `0cc128d` via `git cherry-pick -x` (rule 3: port, never rebuild; attribution preserved in the commit body) |
| `520bf37` | feat(model-plane): competition route gate + 08-25 re-verification + failure-path proof |
| (this commit) | docs(concurrency): lane 11 report |

## 2. What this lane delivered

### 2.1 Residue fusion (the mandated port)

`0cc128d` (previous model-plane lane, unfused per BASELINE residue table) ported
cleanly: `src/model-plane/{capabilities,routing,plane,prompts,benchmark}.ts`,
`tests/model-plane*.test.ts` ×2, `evidence/W-MP/**`, additive receipt plumbing
(`shared/ports.ts` `params`+`routing`, `domain/provenance.ts`, `pipeline/llm.ts`,
`providers/{http,dashscope}.ts`). Port verified before any new work:
typecheck 0 / build 0 / ported tests 36/36. Post-`0cc128d` residue check: only
`src/shared/ports.ts` +7 lines (multimodal lane's, NOT ported — belongs to lane 05's
residue; integrator reconciles).

### 2.2 Competition route re-verification (2026-08-25, primary sources)

`evidence/W-MP/RESEARCH-competition-2026-08-25.md` — both official pages +
Bailian structured-output doc fetched live today:

- **Route/model/proof rules UNCHANGED**: Qwen-family base via Bailian (or official
  创作工具 list), 调用凭证或截图, deadline 2026-09-05.
- **Page-count discrepancy REOPENED**: Aliyun page says PDF≤30, NADC says ≤20
  (yesterday's "resolved ≤20" record is stale). Lane decision: prepare to the
  stricter ≤20; escalated to lane 15 (handoff).
- **New official FAQ facts into the registry**: thinking+json_object "结构化输出可能失效"
  (+ official two-step repair; our corrective re-asks are the equivalent) recorded on
  `qwen3.7-flash`/`qwen-plus`; json_object prompt must contain "JSON" (satisfied by
  `JSON_ONLY_SUFFIX` by construction); strict json_schema families unchanged
  (qwen3.7-plus/max, qwen3.8-max).
- Bailian-hosted third-party models (kimi/glm/deepseek) noted, none registered:
  competition mode is Qwen-only and the project-wide DeepSeek ban is unaffected.

### 2.3 Competition route gate at the production chokepoint (the R2 delta)

`src/app/provider-resolver.ts` — opt-in meta switch `competition_route_mode`
(default OFF = bit-exact legacy). When ON, `resolveRunProvider` (the single
chokepoint for pipeline runs via `composition.ts` AND the resident agent via
`conversations.ts`) holds every route in the resolved chain (primary + declared
failovers) to the official rule: `isQwenFamily(modelId)` AND
`isBailianEndpoint(baseUrl)` (`*.aliyuncs.com`, new `capabilities.ts` platform
fact). Violations — including a NO-config resolution, which would otherwise leak
into the env-chain default (zai, non-Bailian) — resolve to a fail-closed
`competition-route-gate` provider (visible `provider_error`, honest receipt, no
network, no fabricated output). Re-read per resolution: settings edits apply to the
next stage of a live run. Exposed `read/writeCompetitionRouteMode` for the API/UI
(handoff to 12/01).

This converts the competition policy from a rule that existed only inside the
not-yet-adopted task-class router into one enforced on **every production call
path that exists today**.

### 2.4 Failure-path proof completion (goal §Proof obligations)

Goal-mandated matrix, all offline/deterministic:

| Obligation | Evidence |
|---|---|
| malformed output | pre-existing: providers/llm-tolerance/json-repair suites (63+9 tests) |
| timeout | providers.test.ts total-deadline abort + retry-budget-exhausted |
| rate-limit representation | 429 jittered backoff + Retry-After precedence tests |
| quota/budget exhaustion | 429+code 1113 quota classification; 402; spend-limit 11 tests; run-budget 9 |
| unavailable model (404) | **NEW** tests/model-plane-failures.test.ts: provider_error, single attempt, receipt honest, not failover-worthy |
| fallback visibility | model-plane-v2 failover chain tests (serving route on receipt, onFailover sink) |
| context-limit behavior | routing-level prune (model-plane.test.ts) + **NEW** transport-level 400 input-too-long classification |

## 3. Evidence (commands + results, 2026-08-25, lane worktree)

- Setup: `git fetch --all`; `git worktree add work/r2-11-model-plane -b ws/r2/11-model-plane baseline/parallel-r2` → HEAD `47cc373` verified; `npm ci` (root, 0 vulnerabilities) + `cd web && npm ci` (**lesson**: web deps are required for the root suite — file-ingest/citation-entries tests import `web/src/utils/ingest.ts` which resolves `@citation-js/*` from `web/node_modules`; the first full-suite run failed 4 files until this was installed) .
- Fresh-baseline sanity (pre-edit): `npm run typecheck` exit 0; `npm run build` exit 0.
- Port verification: ported lane tests 36/36 (`vitest run tests/model-plane*.test.ts`).
- New tests: `tests/competition-route-gate.test.ts` 12/12; `tests/model-plane-failures.test.ts` 6/6.
- Affected-surface regression (resolver consumers): 11 files / 90 tests, all pass.
- Full gates: `npm run typecheck` exit 0; `npm run build` exit 0; `npm run lint`
  0 errors / 3 pre-existing unused-eslint-disable warnings; 
  `node zcode-harness/scripts/secret-scan.mjs` PASS; full `vitest run` (final,
  web deps installed): **1495 passed / 1 failed / 4 skipped (1500 tests, 146 files)**.
  The single failure — `tests/storage-hardening.test.ts` RU-7.3 backwards-clock —
  is **pre-existing at the clean baseline**: reproduced at `47cc373` via
  stash+detach (identical failure), i.e. environment/clock-dependent lane-12/13
  test, not introduced or touched by this lane. Machine also showed heavy memory
  pressure during the round (cygwin fork failures); final numbers are from the
  completed run at `--maxWorkers=4`.
- Live web verification: 4 official pages fetched 2026-08-25 (WebFetch), verbatim
  quotes in the research doc.

## 4. Conflict notes (shared files touched)

- Via the PORT (residue `0cc128d`, additive-optional, legacy-compatible):
  `src/shared/ports.ts` (+`receipt.params`/`receipt.routing` optional fields),
  `src/domain/provenance.ts` (+16), `src/pipeline/llm.ts` (+2 — lane 06's file;
  additive receipt stamping only), `src/providers/{http,dashscope}.ts` (lane 11's).
  Integrator: the only post-port divergence on these files is `src/shared/ports.ts`
  +7 lines on `build/hx-reconstruction` (multimodal lane residue) — merge both
  additively.
- Lane 11's own edits stayed inside its ownership: `src/app/provider-resolver.ts`,
  `src/model-plane/capabilities.ts`, new tests, `evidence/W-MP/**`, handoffs.
- No merges from any lane/residue branch into this branch (rule 3 compliance).

## 5. Handoffs

Given (`.planning/concurrency/handoffs/`):
1. `r2-2026-08-25-from-11-to-15-page-count-discrepancy.md` — official pages
   conflict (PDF 30 vs 20); lane 11 prepares to ≤20; 15 owns the canonical rule.
2. `r2-2026-08-25-from-11-to-12-competition-route-switch.md` — expose
   `competition_route_mode` via settings API (+01 UI presentation).
Received: none.

## 6. Deviations

- Residue port under rule 3 (documented above; `-x` attribution preserved).
- Branch/report naming reconciled to the repo contract (see header).
- None outside lane ownership.

## 7. Remaining live-only proof obligations (BLOCKED-live — no fabricated success)

1. `B-QWEN-LIVE-ROUTE`: real Bailian call with a real key (DASHSCOPE_API_KEY or
   workspace MaaS endpoint) — competition route end-to-end, incl. strict
   json_schema strict:true behavior on qwen3.7-plus/max, qwen3.8-max.
2. Legacy global endpoint `dashscope.aliyuncs.com/compatible-mode/v1` still
   serving (docs now only show the MaaS workspace form; env override is the switch).
3. Live benchmark execution (`src/model-plane/benchmark.ts` harness is offline-
   proven only; no model-quality numbers exist or are claimed).
4. Registry rate-limit numbers / embedding+rerank unit prices (unpublished or
   unscraped — left UNVERIFIED, never guessed).
5. Official rate-limit/quota error shapes on the MaaS endpoint (classification is
   built from OpenAI-style envelopes + Z.ai-observed codes; MaaS-specific codes
   remain to be observed live).

## 8. Known open items (owner lanes, seams ready)

- Per-task-class routing adoption in `composition.ts` (12/08 product decision;
  seam: `plane.providerFor(taskClass)`).
- Stage SYSTEM_PROMPT migration into the prompt asset registry (06; seam:
  `definePrompt`, fingerprints drop in with zero content change).
- Settings UI/API for the competition switch (12/01; handoff filed).

## 9. Saturation statement

Registry, routing, transport hardening, fallback, budgets and receipts were at
strength after the port (previous lane's delivery, now verified on the R2 base).
This round's material additions: the enforced-at-chokepoint competition gate,
the 2026-08-25 primary-source re-verification (which materially reopened the
page-count conflict), registry facts from the official FAQ, and the completed
failure-proof matrix. Remaining in-lane work is either live-blocked (§7) or owned
by other lanes (§8) — lane 11 is at material improvement saturation for R2.
