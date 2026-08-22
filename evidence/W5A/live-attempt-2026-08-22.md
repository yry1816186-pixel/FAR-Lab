# Wave-5 Live Verification Attempt (2026-08-22, after user provided credentials)

## What happened

User attached `.far-run/secrets.env` with the instruction never to read/print its contents.
It is consumed exclusively through `eval/load-secrets.mjs` (loads into process env; no value
ever appears in logs or conversation).

1. **Route probe** (`node eval/probe-routes.mjs`): `zai: 200` on a 5-token glm-4.6 chat
   call ("*** ZAI ROUTE LIVE ***"); `dashscope: NO-KEY`; deepseek stays user-banned.
2. **Live rediscovery re-run** (`node eval/rediscovery.mjs`, W5 queue item 1): after
   `npm run build` (dd13945 falsify audit into dist) and archiving the prior runs file to
   `rediscovery-v2-pass1-runs.jsonl`, ALL 5 task runs FAILED at the scope stage.
3. **Manual reproduction**:
   `FARLAB_MODEL_PROVIDER=zai node dist/cli/main.js research start "…" --domain microbiology --goal explanatory --json`
   → run created (`run_7c1fsgyd2qr1r4334jsxbn538r`), terminal `partial`, lastError verbatim:
   > `model call failed (quota_exceeded) in scope/scope-refinement: zai: HTTP 429 code 1113: Insufficient balance or no resource package. Please recharge. — balance/quota exhausted (not a transient rate limit)`

## Root cause

Same model on both paths (`glm-4.6`, verified in `eval/probe-routes.mjs:14` and
`src/providers/zai.ts:21`) — this is NOT model routing. The tiny 5-token probe call fit
inside the remaining balance sliver; a real pipeline call does not. Sharpens the W9 finding
("/models 200 ≠ spendable balance"): **even a chat-200 on a tiny max_tokens call does not
imply balance for real work**. Recorded as D-058.

## State after the attempt

- Live queue REMAINS user-gated: z.ai recharge (code 1113 verbatim) OR a real
  DASHSCOPE_API_KEY. DeepSeek is user-banned for this project.
- Attempt artifacts archived: `eval/results/rediscovery-zai-attempt.jsonl` +
  `rediscovery-zai-attempt-runs.jsonl` (5 error records each; honest failure rows).
- 6 partial runs in `.far-run/far.db` (5 eval + 1 manual repro) — honestly `partial` with
  quota errors; sweepable via the existing zombie-sweep if desired.
- No north-star change: rediscovery-mean-f1 / relation-blind-agreement / mlr-bench-overall
  stay at their measured currents with the D-050 landed-mechanism notes; the "queued on
  D-036" wording now reads "queued on z.ai recharge or DASHSCOPE key" (D-058).

## Zero-fake-discipline notes

- The secrets file was never read, printed, committed, or echoed; only variable NAMES were
  ever surfaced (by the pre-existing probe script convention).
- No run was retried after the first 1113 class failure beyond one manual reproduction
  (single-attempt record policy; no balance-burning retry loops).
