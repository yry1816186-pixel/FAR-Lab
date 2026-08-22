# Wave-G WP2 · Full-Code Adversarial Review — Findings, Adjudication, Disposition

Date: 2026-08-22 · Method: 10 parallel read-only review agents (one per module family) →
main-agent verification of every load-bearing claim (code read before fix) → root-cause fixes
with paired regression tests → mutation spot-checks → independent adversarial re-audit of the
fix batch (verdict appended in AUDIT.md).

Scope: 58 src files + web/src + eval (27 scripts) + zcode-harness + scripts + 24→27 test files.
Excluded from fixing (parallel WAVE-PRODUCT session ownership): `src/server/api.ts`,
`src/cli/main.ts`, `tests/api.test.ts`, `web/src/**`, `desktop/**` — their findings are QUEUED (§4).

## 1. Findings inventory (per module review)

| Module (review agent) | Findings | P0 | Notes |
|---|---|---|---|
| src/domain + src/shared | 8 | 1 (rank no-op ternary, fixed) | canonicalSha256/ids arithmetic verified CLEAN |
| pipeline core + early stages (llm/types/scope/retrieve/verify/align/shared/guard/title-normalize) | 7 | 0 | W6 fusion constants verified spec-compliant; retry/backoff verified correct |
| evidence/hypotheses/falsify/rank | 16 | 3 | includes the rank ternary + 2 cleanups |
| plan/revise/feedback/export | 10 | 2 | changedFields JSON.stringify; lockfile cwd |
| src/sources | 13 actionable | 5 | 1 self-retracted by reviewer (openalex w-prefix), 1 was reviewer's spec error (F14) |
| src/providers | 14 | 3 | 1 downgraded after brute-force (parseString recursion, §3) |
| persistence + app (W8 layer) | 17 | 5 | 2 adjudicated as over-claims (§3), 2 fixed, 1 index fixed |
| CLI + server (REPORT-ONLY) | 12 | 3 | queued for parallel-session close |
| web/ (REPORT-ONLY) | 8 | 3 | one (runProgress drift) already fixed by parallel session mid-review |
| eval + harness + tests-quality | ~20 | 2 | both fixed (churn + deepseek default) |

## 2. Fixed in this batch (root cause → regression test)

Code fixes (19 files) — each verified by main agent reading the site before editing:
1. **rank.ts no-op ternary** (`valid.length >= MIN ? valid : valid`) — dead gate removed; the
   per-hypothesis floor at the stage level (discard + warning) is the real enforcement; comment
   now says why the schema must NOT throw (one under-scored hypothesis must not kill the payload).
2. **revise.ts changedFields** — JSON.stringify → canonicalJson comparison (key-order-canonical;
   audit trail can no longer report phantom changes).
3. **export.ts dependencyLockHash** — process.cwd() → findUp from import.meta.dirname
   (FARLAB_LOCKFILE_PATH override); a run from any directory now hashes the real lockfile.
4. **export.ts truncate** — codepoint-aware (no split surrogate pairs before ellipsis).
5. **evidence.ts** — stray double block scope removed; `'corpus_snapshot' as never` → typed call.
6. **guard.ts isCancellationError** — word-boundary regex (stage-suffixed messages match;
   `cancelled by userX` does not).
7. **sources/arxiv.ts** — XML attrs parsed for BOTH quote styles; queries carrying arXiv syntax
   (quotes/field-prefixes/booleans) pass through untokenized.
8. **sources/http.ts encodePathSegment** (new) — path-segment-safe encoding for DOI interpolation
   (escapes `?`/`#`, preserves `/` and `doi:`); crossref + openalex migrated off encodeURI.
9. **sources/fulltext.ts** — arXiv id route guard (rejects traversal/scheme-shaped ids, accepts
   modern + legacy ids); EuropePMC network-retry 1s backoff (was zero-delay tight loop);
   nested-table strip-until-stable; dead FULLTEXT_FAMILIES export removed.
10. **sources/text.ts** — 30 common JATS/LaTeXML named entities decoded (unknown pass through).
11. **sources/snapshot.ts** — missing-family volatile-list guard (loud boundary error).
12. **providers/http.ts** — buildMessages RNG seam (rides deps.random like the W4-F1 jitter);
    Bearer redaction matches zero-whitespace echo; repairUnescapedQuotes trailing-backslash guard.
13. **providers/json-repair.ts** — parseString recursion depth bound (20) — defense-in-depth (§3).
14. **persistence/db.ts** — migration v4: `idx_runs_status_lease` (watchdog poll was a full scan).
15. **persistence/store.ts** — putStepOutput INSERT+event now transactional; createRun event moved
    inside the TX; STAGE_ALL derived from domain STAGE_ORDER (was a third independent copy);
    dead Store.integrity() wrapper deleted (db.integrityCheck stays, tests use it directly).
16. **app/orchestrator.ts** — lease re-checked AFTER `await fn(run)` before updateRun (closes the
    theoretical adoption window if a transition fn ever becomes async); BOOT_NONCE crypto-random.
17. **persistence/artifacts.ts** — path() hash-format guard (path-join escape closed); get()
    maps only ENOENT to null — unreadable artifacts now surface as errors, not "missing".
18. **domain** — ScorecardId/TournamentId branded (`sc_`/`trn_`); ObjectRef id shape-checked per
    kind (garbage cross-refs reject at parse; artifact kind accepts sha256 form); VersionDiffEntry
    shares RevisedObjectType enum with RevisionOperation; dead ReceiptSink + objectRefFor deleted.
19. **eval** — lib.mjs makeProvider: deepseek hard-banned (explicit fatal), default glm-anthropic,
    zai/dashscope alternates, now async with all 4 callers awaited; ev1-judge-agreement.mjs
    write-if-changed (test runs no longer churn the committed artifact — verified idempotent);
    PROTOCOL.md dated addendum (pre-declared text untouched); counter-evidence-metric evaluate()
    exported + CLI direct-run guard; glm-anthropic-provider fetchImpl seam + tolerantParse export;
    fetch-models-dev real fetch timing (was `undefined ms`).

Test fixes/fixtures: scorecard ids corrected to `newId('sc')` in domain-schema (was a REAL latent
fixture bug — `newId('ev')` for a scorecard — caught by the branded-id tightening),
pipeline-export (`'scorecard-1'`), api.test (`'scorecard-seed-1'`).

New tests (28): tests/waveg-wp2-regressions.test.ts (13 — one per fix family),
tests/glm-anthropic-provider.test.ts (10 — was the single largest untested module: the default
judge route), tests/counter-evidence-metric.test.ts (5 — north-star metric classification;
CLI rerun reproduced the recorded 0.143 [0.026, 0.513] exactly).

Zero-tolerance sweep after batch: `: any` = 0, `@ts-ignore` = 0, `as unknown as` = 0,
empty catch = 0 in src/ (hooks' fail-open catches are zcode-harness, by design, documented).
Gate: typecheck 0 / eslint 0 / vitest 592/592 (27 files) / build 0.

## 3. Rejected / downgraded findings (with evidence — recorded so they are not relitigated)

1. **[persistence F3] "TOCTOU lease fencing hole — disowned worker can write run state"** —
   OVER-CLAIM. transition() fns are synchronous patches (no LLM awaits inside); lease is checked
   at every transition entry; the designed fencing surface is ctx.disowned() checkpoints before
   domain writes (W8 audit P1-3 fix) + 20/20 fault-injection pass. The post-await recheck was
   added anyway as cheap hardening (zero cost, closes the future-async-fn window).
2. **[persistence F4] setStage mutates run** — by design; run is a fresh store copy per
   transition; structuredClone adds cost without closing any real window.
3. **[providers P0-3] json-repair unbounded recursion DoS** — brute-force probe (7 pathological
   batteries ×500 repeats) found NO input that diverges the retry chain; upstream jsonrepair has
   shipped without a bound for years. Kept the depth bound as defense-in-depth; test asserts the
   crash-class property (only ok or JsonRepairError), NOT a depth trigger.
4. **[providers P1-1] finishReason undefined → repair allowed** — DISCLOSED residual risk
   (W7-F2 comment + D-030 41/41 live evidence); changing it would contradict a recorded decision
   without new evidence. Registry B deferral: trigger = a registered provider omitting finish_reason.
5. **[cli F-004] Windows argv mojibake** — false positive: Node on Windows reads argv via the
   wide-char API (GetCommandLineW), no codepage decoding occurs.
6. **[cli F-011] dist-freshness test-file false positive** — no test files exist under src/.
7. **[stages F-13] "no prompt fencing in stages"** — fencing lives in the transport layer
   (buildMessages random-delimiter fence, W4-F2); stages pass structured payloads.
8. **[stages F-14] "zod passthrough"** — z.object strips unknown keys by default; no passthrough.
9. **[domain F4-part] Assumption.id loose** — assumptions are LLM-emitted identities; tightening
   would reject legitimate model output. Kept loose deliberately.
10. **[retrieve P1] O(n²) swap-in** — pool capped at 48; worst case ~2.3k comparisons. Rejected.
11. **[sources F14] sources/http.ts "no retry, doc-drift vs W4-F1"** — reviewer's spec confusion
    (my prompt cited the providers transport); the sources comment is accurate as written.
12. **[eval F-008-class] web sourcemap "leak"** — local-first loopback product; sourcemaps serve
    the local user only. Downgraded to P3 note for any future hosted deployment.

## 4. QUEUED (parallel-session zones — apply when that session closes)

- api.ts: void-IIFE request handler needs a .catch (unhandled-rejection hardening); runId
  path-segment format guard (defense-in-depth); bundles `.at(-1)!` TOCTOU anchor; watchdog
  consecutive-sweep-error surfacing in /health.
- cli/main.ts: runId validation; jsonOutput helper (serialization-failure envelope).
- web/src: normalize.ts 3 fail-open firstArray paths (violates the module's own fail-closed
  contract); events-polling orphaned AbortControllers (cross-run contamination under latency);
  dead LabeledBadge; 28 `as never` i18n casts → typed key helpers; useResource lint-suppression
  docs. (runProgress drift was fixed by the session itself mid-review.)
- README PORT doc-drift (3196 vs 8787) — verify scripts/serve.mjs actual default, one-line fix.

## 5. Mutation spot-checks (baseline hard gate)

- MUT-1 (disable json-repair depth bound): test did NOT redden — honest outcome: the bound is
  not observable via a craftable input (see §3.3); test rewritten to the discriminating
  crash-class property. Recorded as a NEGATIVE mutation result, not hidden.
- MUT-2 (Bearer redaction back to `[ \t]+`): **RED** — redactSecrets zero-whitespace test failed
  exactly on the mutated line, restored, green.
- MUT-3 (ObjectRef superRefine removed): **RED** — shape-gate test failed (garbage id accepted),
  restored, green.
- Fixture-fix mutation (scorecard branded id removed): the three pre-existing suites reddened
  at fix time (domain-schema, export, api) — the tightening demonstrably discriminates.

## 6. Backlog recorded (not Wave-G scope)

- verify.ts DOI-resolution failure does not fall back to arXiv id (P1, behavior change in
  verification semantics — needs its own decision + live validation).
- title-normalize CJK tokenization (single-token CJK titles degrade Jaccard) — scientifically
  sensitive: changes verification gates and metrics; requires live A/B per red-line discipline.
- mlr-bench gap attribution items (presentation-level, product session's domain).
- zcode-harness hooks' fail-open empty catches: acceptable by design (hook must never block the
  toolcall); documented here as accepted-pattern.
