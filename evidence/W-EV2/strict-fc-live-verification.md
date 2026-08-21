# Strict-FC Default Transport — Live Verification Journey (W-EV2/Wave-3 #6)

**Date:** 2026-08-22 05:00–06:10 local · **Decision trail:** D-026 (adopt) → D-029 (independent audit + fixes) · **Code:** `src/providers/http.ts`, `src/providers/deepseek.ts`, `src/providers/zai.ts`, `src/pipeline/llm.ts`

## Timeline (all command-level, receipts in `.far-run/far.db`)

| Time (local) | Event | Evidence |
|---|---|---|
| 05:01–05:04 | First full-pipeline attempt `run_8n37…` (closing session): 12 tool_calls receipts through scope/retrieve/build_evidence, then **failed at generate_hypotheses** (`invalid_output`: intermittently corrupted tool arguments) | events stage_failed 21:04:29Z; receipts finishReason=tool_calls |
| ~05:05 | Adversarial audit (independent session) returned FAIL-limited verdict; my verification refuted P1-1 (receipts exist — auditor queried receipts as a table) and P1-2 (anyOf-null probe **200**, `spikes/output/strict-fc-null-probe.json`), confirmed P2-1 (bare-{} subschema from `z.record` projection → **400**, `strict-fc-shape-probe.json`) and P1-3 (zai tools leak) | D-029 |
| ~05:07 | Fix `7cd3100`: projection v2 (UNPROJECTABLE sentinel + union arm-drop + endpoint-contract invariant), zai strip, revise policy path | commit + suite 260/260 |
| ~05:10 | Root-caused the corruption class: model intermittently emits **unescaped inner quotes** in long string values (live-reproduced ~1-in-5 at ≥20k chars; captured `spikes/output/strict-fc-corrupted-args.json`). Fix `056e931`: content-preserving repair scan; structural flip-retry evaluated and **rejected** (can move string boundaries → silently distorted content) | commit + suite 264/264 |
| 05:24–05:28 | Second attempt `run_wkncq5…`: **17/17 tool_calls** incl. the previously-fatal generate_hypotheses; failed at critique_falsify on `decisionRuleProvenance='mixed'` — model honest, enum too narrow | events stage_failed 21:28:26Z |
| 05:29–05:30 | Enum fix `'mixed'` (closing session, 3ab5e7a+bfa41b7) — two sessions converged on the same live incident independently | commits |
| 05:36–05:47 | Third attempt `run_z1d63k…`: rank receiving receipts every ~3-4s (fixed projection accepted repeatedly) but **killed mid-rank** — my background task wrapper exited and reaped the worker process group (ops lesson: `research start` blocks; keep the launching task alive) | receipts 21:47:22–36Z then silence |
| 05:57–06:07 | **Final run `run_prrxcee6x58fv44temqa02b9mj`: COMPLETED, no stage failures** | below |

## Final verification (run_prrxcee6, 2026-08-22T22:07:09Z)

- **41/41 model calls finishReason=tool_calls** across all 9 stages:
  scope, retrieve, verify_sources, build_evidence, generate_hypotheses, critique_falsify, **rank**, plan, export.
- **rank stage live-proved the array-arm projection** (pre-fix z.record projection 400'd on the beta endpoint; post-fix schema accepted across the full tournament).
- Plan carries `multipleTestingPolicy=single_primary` with a substantive allocation note; executabilityCheck passed (POPPER discipline end-to-end).
- claim→hypothesis relations: supports=20, weakens=10, qualifies=13, **contradicts=2 (explicit assertions only)** — the pre-fix default-labeling produced 11–19 mostly-wrong contradicts per run (see relation-precision.md).

## Honest residuals

- Tool-argument inner-quote corruption is INTERMITTENT (~20% at large sizes, live-sampled); the repair scan recovers the content-preserving class, deeply corrupted structures (temp-1.3 prose-with-JSON-fragments sample) stay unrecovered **by design** — a bounded corrective retry (now with explicit quote-escaping hint) + fail-visible rejection is preferred over any boundary-moving repair.
- Two zombie runs (`run_z1d63k…`, `run_aqbhgz…`) remain status=running in far.db after worker kills — cosmetic DB-state debt, listed for a future sweep; no data written after their last receipts.
- zai route is json_object-transport by capability decision (unverified strict-tools on GLM) — not a regression, documented in D-029.
