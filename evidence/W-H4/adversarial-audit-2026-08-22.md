# Wave-4 fusion adversarial audit (2026-08-22, main-agent executed)

**Scope**: commits c8a0b54 (W4-F1 jittered backoff + Retry-After, W4-F3 secret redaction),
2e115e3 (W4-F4 judge self-consistency), 2b2cb60 (docs) — the Wave-4 closeout claim in D-039.

**Method deviation (honest)**: the fresh-subagent adversarial audit was attempted first and
failed on an account-level rate limit (spawn error 1302, 10:42 local, concurrent serial-wave
sessions consuming the budget). The main agent executed the audit instead with command-level
evidence below: static code review + 3 mutation spot-checks + independent recomputation from
the shipped dist. A fresh-eyes re-audit can re-run this checklist when the account allows.

## Checks run (all commands executed 2026-08-22 10:36-10:49 local)

1. Full gates on the landed tree: `npm test` → **295/295 passed**; `npm run typecheck` exit 0;
   `npm run build` exit 0; `npx eslint src tests eval --max-warnings=0` exit 0.
2. F1 algorithm recomputation from `dist/providers/http.js` (NOT just src — shipped artifact):
   backoff table random∈{0,0.5,1} × attempt 1-5 =
   `750|1500|3000|6000|12000` / `1000|2000|4000|8000|16000` / `1250|2500|5000|10000|20000` —
   **identical to evidence/W-H4/fusion-f1-f3-f4.md table**. Jitter = symmetric multiplicative
   `0.75+0.5·rand` × `1000·2^(n-1)`, cap 30s applied after jitter (ceil→min).
3. F1 header parsing edge cases (dist, live node): `retry-after:7`→7000;
   `retry-after-ms:600000`→capped 30000; garbage `retry-after-ms` falls through to
   `retry-after:2.5`→2500; past HTTP-date→0; absent headers (object and `undefined`)→undefined
   (exponential path); negative hint→0 (never negative sleep); NaN hint→exponential fallback.
4. F1 contract preservation (src read, src/providers/http.ts): `MAX_TRANSPORT_RETRIES=2`
   unchanged (:46); classification precedes any delay consumption (:708 classify → :768-769
   retryable-kind gate → :779 backoff) so **a quota/budget 429 can never be resurrected by a
   server Retry-After header**; auth 401/403 and quota 429 fail closed with zero sleeps;
   corrective re-asks ≤3; 120s total budget enforced before every attempt. Old
   `TRANSPORT_BACKOFF_MS` table fully deleted (no dead references).
5. F3 redaction: applied at the persistence chokepoint `fail()` (:663) AFTER raw-text
   classification (quota regex on raw envelope — tested explicitly at tests/providers.test.ts
   'quota classification keeps its semantics on raw text'); live corpus check from dist:
   sk-/AKIA/Bearer families redacted; false-positive corpus untouched (`token = 0.85`,
   `sk-learn-classifier`, "Bearer of good news", 40-char git SHA).
6. F4 aggregation (eval/judge-votes.mjs + llm-judge.mjs): odd-count integer median; even-count
   half-values documented in module header; zero successful votes → `aggregateVotes` null →
   `judge_ok:false` honest; `per_vote` retains every raw vote incl. failed-vote error detail;
   N=1 default leaves `scores.<system>.<dim>` integer-identical to v1 (additive fields only;
   no automated consumer exists — audited in module header); `FARLAB_JUDGE_VOTES` validated
   fail-fast on non-positive-integer.
7. Test discrimination — 3 mutations, each verified RED then restored GREEN (62/62):
   - M1 `retryAfterMsHint = undefined` (ignore header): 2 Retry-After tests failed.
   - M2 delete `sk-` pattern from SECRET_PATTERNS: 4 redaction tests failed.
   - M3 break medianOf sort: judge-votes median test failed.
   Files restored from backup; `git diff --stat src/providers/http.ts eval/judge-votes.mjs`
   clean afterwards; providers+judge-votes suites 62/62 green post-restore; dist rebuilt.
8. Doc honesty: evidence/W-H4/fusion-f1-f3-f4.md numbers all reproduced (see 2-3);
   F4 live variance reduction labelled UNVERIFIED (D-036 route block) — no overclaim found.

## Verdict

| item | verdict | findings |
|---|---|---|
| W4-F1 | **PASS** | 0 P0/P1/P2 |
| W4-F3 | **PASS** | P3-obs: assignment pattern can redact long numeric values in `secret = 0.8526…` style text — inherited codex shape, error-path-only, disclosed trade-off in code comment; no action |
| W4-F4 | **PASS** | P3-obs: even-vote median yields half values — documented in module header; default N=1/N=3 odd unaffected |

Audit basis for the Wave-4 closeout claim in D-039: accepted.
