# Wave-5 Live Verification Attempt 2 (2026-08-22 ~15:40 local) — protocol FIXED, window-limited

Sequence of events (all command-evidenced):

1. **Protocol root fix landed (D-071)**: zai provider now speaks the Anthropic Messages
   wire on `open.bigmodel.cn/api/anthropic` (user-identified route). Provider-level live
   probe PASSED (structured JSON call, finishReason=stop, usage accounted).
2. **First eval batch failed on a NEW bug**: every `research start --json` child crashed —
   root cause `src/cli/main.ts jsonOutput` **called itself instead of serializing**
   (infinite recursion, "Maximum call stack size exceeded"). Regression born in D-069's
   batch; it broke every --json consumer. FIXED + committed
   (`fix(cli): jsonOutput self-recursion broke every --json path`); zero-API verification:
   `node dist/cli/main.js runs --json` emits valid JSON, exit 0. Attempt artifacts archived
   `eval/results/rediscovery-jsonfail-attempt*.jsonl` (5 error rows + 2 junk judged rows).
3. **Single-task foreground verification** (crispr-offtarget, zai route) exposed the real
   current gate, verbatim:
   > `zai: HTTP 429 code 1308: [1308][已达到 5 小时的使用上限。您的限额将在 2026-08-22 17:45:05 重置。]`
   (retry budget of 2 exhausted — correctly classified rate_limited, retried within
   budget, then failed visible; run `run_d2aj4wq7z7eav191ytnmjxq9t9` partial at scope).

Reading of the evidence:

- **The 1113 "insufficient balance" class is GONE on this route** — the account pays per a
  5-hour window on the anthropic wire; today's window (shared with the parallel session's
  live judging runs) is exhausted. Window resets **2026-08-22 17:45:05 local**.
- The pipeline is healthy on this route up to the model call (clean run creation, honest
  stage failure record, valid JSON output) — both blockers that masked this (wrong wire
  protocol; CLI recursion) are fixed and committed.

Live queue state (STRICT one-shot-per-item discipline, small judge quotas, no polling):

| item | cost when it runs | status |
|---|---|---|
| rediscovery 5-task full re-run (W5-F4 effect → rediscovery-mean-f1) | ~5 pipeline runs + v2.1 judge | QUEUED at window reset 17:45 local |
| relation blind-agreement small quota (W5-F5 effect; spike judge switched deepseek→zai) | 16 judge calls | QUEUED (needs a completed W5 run first) |
| mlr-bench --skip-runs re-judge 30 artifacts (W5-F3 judge-context protocol) | 30 judge calls | QUEUED |

No further API calls attempted after the single 1308 record (user quota discipline +
one-attempt-record policy). Resume command at reset:
`FARLAB_JUDGE_PROVIDER=zai node eval/rediscovery.mjs` (fresh run files; seeds nothing).
