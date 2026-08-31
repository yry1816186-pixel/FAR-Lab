# Web performance baseline (HX §21)

Measured by `web/e2e/perf.spec.ts` against the production web route in a
scratch workspace. The deterministic offline run currently materializes seven
visible claims and zero hypothesis cards: the hypothesis honesty gate refuses
template/in-process-test-double content. The loaded-home case deliberately
starts real active work, then cancels it and waits for a terminal state so the
test neither depends on suite order nor contaminates later cases.

CI gates the same runner-variance-safe ceilings: LCP < 4000ms and CLS < 0.1.
The limits are intentionally looser than the local reference numbers, but the
CLS threshold is not retried away or weakened.

## Current local reference (2026-08-31)

Environment: WSL2 Linux 6.6, Node 24.18.0, Playwright 1.62.1 Chromium, one
worker. Ranges below cover an isolated perf run, the original seven-test
core/draft/perf ordering, and the full 23-test browser suite.

| Surface | FCP | LCP | CLS | Long tasks |
|---|---:|---:|---:|---:|
| Loaded home `#/` (active run present) | 168–248ms | 220–296ms | **0.0001** | 0 |
| Settled study map `#study/<id>` | 136–144ms | 168–180ms | **0.0184–0.0185** | 0 |

Verification on the repaired lane:

- isolated `perf.spec.ts`: 2/2 passed;
- `core-journey + draft-scope + perf`: 7/7 passed in the order that previously
  reproduced the loaded-workspace regression;
- complete Chromium E2E gate: 23/23 passed in 4.6 minutes with one worker.

These are local integration results, not hosted-CI evidence. Canonical
`main@cc4009c` remains red until this lane is integrated and the hosted run is
observed green.

## 2026-08-31 defects found and fixed

The hosted run first reported loaded-home CLS **0.123795** twice. The real suite
ordering reproduced **0.115515** twice while an isolated empty workspace stayed
at 0.0001. Layout-shift source attribution identified three independent shell
and projection defects:

1. `AwarenessBar` returned `null` until `/runs` found active work. Its late
   43px insertion moved `.app-body` from y=59 to y=102 and contributed
   **0.115474** CLS. The bar now owns a permanent semantic slot with truthful
   loading, idle, and active states.
2. The app frame used `min-height` and asynchronously inserted the recent-study
   rail group, allowing the status bar and conversation group to move. The
   viewport frame now has a bounded scroll owner, and the study rail keeps a
   truthful fixed-capacity loading/empty/loaded region.
3. The map used the evidence request's `scienceLoaded` flag to remove the much
   taller science-state placeholder. When evidence won the race against
   `/science`, a 311.5px `map-node` vanished and contributed **0.158829** CLS.
   `spineLoaded` now records the independent science projection, so one request
   cannot claim another has settled.

`perf.spec.ts` retains node/rectangle attribution for non-input layout shifts,
making future failures diagnostic rather than threshold-only.

## Historical baseline (2026-08-27)

The settled map originally measured CLS 0.259 because evidence/hypothesis bands
rendered “empty” before their first fetch and then expanded. A first-fetch gate
and reserving bands reduced it to 0.0000 settled / 0.081 worst observed during
materialization. The 2026-08-31 work above closes separate loaded-shell and
science-projection races that the earlier empty-workspace measurement missed.

## Not yet measured

- INP: needs user-event instrumentation beyond synthetic clicks; zero observed
  long tasks is only a proxy.
- Large-corpus browser scaling (>100 claims / >20 hypotheses): the current
  deterministic route exposes seven claims and no admissible hypothesis cards.
  Any generated stress corpus must remain explicitly labelled synthetic and
  cannot serve as evidence of scientific validity.
