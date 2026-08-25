# R2-14 Independent Scorecard — evaluation/red-team lane

Generated 2026-08-25T17:48:57.962Z against `47cc373` (baseline/parallel-r2).

**Overall: PASS_WITH_DIVERGENCES** — 0 invalid-claim entries, 10 divergences.

| Probe | Verdict | Summary |
|---|---|---|
| p1-wiring | ADVISORY | 208 src modules; 5 unreachable from [src/server/main.ts, src/cli/main.ts]: 0 orphans, 5 test-only, 0 script-only; 3 files with non-literal dynamic imports |
| p2-route-contract | PASS | 70 client-declared routes probed against the real server: {"OK":13,"EXISTS_VALID":47,"EXISTS_UNAVAIL":2,"EXISTS_404":8} |
| p3-live-masquerade | ADVISORY | stub-in-production: clean; 16 literal 'live' receipt sites (src/agent/capabilities/refine.ts, src/agent/exploration-runner.ts, src/agent/mcp.ts, src/app/provider-resolver.ts, src/app/spend-limit.ts, src/model-plane/plane.ts, src/pipeline/stages/evidence.ts, src/pipeline/stages/export.ts, src/pipeline/stages/hypotheses.ts, src/pipeline/stages/retrieve.ts, src/pipeline/stages/verify.ts, src/providers/custom.ts, src/providers/dashscope.ts, src/providers/http.ts, src/providers/zai.ts, src/shared/ports.ts); DB audit: 5072/5072 live receipts, 0 masquerades; 1 fake-vocabulary lines for review |
| p4-stale-web | PASS | D-031 guard: missing-dist flagged, older-dist flagged, fresh-worktree clean; real serve on stale tree refused, on fresh tree started |
| p5-citation-grounding | PASS | 1261 verified / 5 non-verified claims; 1261 verified locators re-checked under the product's own alignment gate: 0 missing sources, 0 failing even the fuzzy bar, 21 fuzzy-aligned (near-verbatim), 0 malformed DOIs |
| p6-sandbox-escape | ADVISORY | layer A (TS policy): 8/8; layer B (python namespace, live sidecar): 10/11 |
| p7-memory-benefit | PASS | write OK; idempotence OK (memory=2/fts=2); compile OK; consume wiring present |
| p8-agent-isolation | PASS | permission decisions: 4/4 as expected; loop enforcement wired; subagent policy inheritance present, depth cap present |

## Divergences (advisory, for owning-lane handoffs)

- p1-wiring/P1-TEST-ONLY: src module wired only from tests: src/model-plane/benchmark.ts (importers: test:tests/model-plane-benchmark.test.ts)
- p1-wiring/P1-TEST-ONLY: src module wired only from tests: src/model-plane/plane.ts (importers: test:tests/model-plane.test.ts)
- p1-wiring/P1-TEST-ONLY: src module wired only from tests: src/model-plane/prompts.ts (importers: test:tests/model-plane-benchmark.test.ts)
- p1-wiring/P1-TEST-ONLY: src module wired only from tests: src/model-plane/routing.ts (importers: test:tests/model-plane-benchmark.test.ts, test:tests/model-plane.test.ts)
- p1-wiring/P1-TEST-ONLY: src module wired only from tests: src/plugins/host-main.ts (importers: test:tests/plugins.test.ts)
- p1-wiring/P1-DYNAMIC-IMPORT: non-literal dynamic import() present — graph may under-count reachability: src/plugins/host-main.ts
- p1-wiring/P1-DYNAMIC-IMPORT: non-literal dynamic import() present — graph may under-count reachability: src/plugins/import.ts
- p1-wiring/P1-DYNAMIC-IMPORT: non-literal dynamic import() present — graph may under-count reachability: src/server/api.ts
- p3-live-masquerade/P3-FAKE-MARKER: fake-success vocabulary in production code: src/ingest/parsers/pptx.ts:188: if (title.length === 0) warnings.push(`slide ${n} has no title placeholder — a positional "Slide ${n
- p6-sandbox-escape/P6-NUMPY-OK: layer B observation numpy-submodule-import-limitation: {"id":"numpy-submodule-import-limitation","ok":true,"errorKind":null,"errorMessage":"None","stdout":"6\n"} — numpy surface partially functional; submodule-importing ops fail closed (handoff to lane 10)

## Replay benchmarks

```
metrics.mjs exit=0
=== FAR-Lab per-run ===
P1 run_7zez1a8ezbbrrgw9begtta0gsw completed: srcVer=8/8 (100.0%) claimBind=15/15 (100.0%) counter=12/56 reps=6/11 falsif=83.3% planExec=true live=100.0% span=35.7min tokens=71939
P2 run_yhp0m4kg6qnjmemhj9k5wbmk00 completed: srcVer=9/9 (100.0%) claimBind=4/4 (100.0%) counter=23/43 reps=9/10 falsif=100.0% planExec=true live=100.0% span=13.4min tokens=110377
P3 run_rnjevw1teza5bmjesxybc0g98y completed: srcVer=11/11 (100.0%) claimBind=4/4 (100.0%) counter=2/21 reps=5/10 falsif=100.0% planExec=true live=100.0% span=3.3min tokens=45008
P4 run_fr67580x6asqm0mgnncbmpppph completed: srcVer=12/12 (100.0%) claimBind=12/12 (100.0%) counter=20/51 reps=6/10 falsif=100.0% planExec=true live=100.0% span=5.0min tokens=112702
P5 run_1egthjvkgwbssw93bz2y7yqzdk completed: srcVer=12/15 (80.0%) claimBind=0/0 (n/a) counter=0/0 reps=0/0 falsif=n/a planExec=null live=100.0% span=0.7min tokens=14787
P6 run_tmse5hms5d60ek3299v7ceybt9 created: srcVer=0/0 (n/a) claimBind=0/0 (n/a) counter=0/0 reps=0/0 falsif=n/a planExec=null live=n/a span=0.0min tokens=0
=== baselines (aggregate) ===
direct: call_ok=0/0 shape=0 zodHyp=0 zodPlan=0 falsif=n/a planExec=0 hypN=null cites=0 resolved=0 matched=0 quoteGrounded=0 unsupported=n/a
rag: call_ok=0/0 shape=0 zodHyp=0 zodPlan=0 falsif=n/a planExec=0 hypN=null cites=0 resolved=0 matched=0 quoteGrounded=0 unsupported=n/a
WROTE eval/results/metrics.json


retrieval-baseline.mjs exit=0
runs=67 pooledVerifyRate=0.9847 counterGatePass=1 rerankApplied=0.791 truncated=0.8209
medians: holeRate=0 abstractCov=0.75 identResolv=1 zeroResultRate=0.4286 counterZero=1 poolSize=31

```