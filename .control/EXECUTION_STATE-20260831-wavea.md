# Wave A execution lane — 2026-08-31

Branch: `lane/endgame-wave0-root`, continuing from the verified Wave 0 head
`9843eff`. The primary Windows worktree and user-owned port 3196 remain
untouched.

## FA-PLT-02 — canonical CI / loaded-home CLS

Finding state before repair:

- Current canonical `main@cc4009c` hosted run 33315252432 is red. Its verify
  job passed; web-e2e reported 22 passed and one failed. The sole failure is
  `perf: home first paint and layout stability`, CLS 0.123795 on both attempts
  against the unchanged `<0.1` budget.
- A fresh isolated route on local port 3299 measured home CLS 0.0001 and map
  CLS 0.0785 (2/2 pass), so an unconditional page-wide rendering regression is
  ruled out.
- The real preceding suite state was reproduced on isolated port 3300 by
  running core-journey, draft-scope, then perf in one scratch workspace. After
  one completed study and one persisted draft existed, home CLS was 0.115515
  on both attempts; six other tests passed. This makes the first asynchronous
  data-load transition the bounded seam. Source-node attribution is the next
  diagnostic; no threshold or retry weakening is allowed.

Design-gate summary for this repair:

- User need/task: a returning researcher must reach the workbench without the
  navigation rail, judgment queue, or study index jumping while saved work
  loads.
- Information hierarchy: persistent shell and compose entry first; saved study
  and conversation projections appear only from real API state.
- State/failure: initial loading must reserve or atomically replace honest
  structure; errors remain visible and retryable; no fake rows or fabricated
  progress.
- Verification: deterministic loaded-workspace reproduction, layout-shift
  attribution, fresh and loaded perf gates, full browser surface regression,
  production build, then hosted run after an authorized integration/push.

Repair checkpoint — source commit `87a1f3f`:

- Layout-shift attribution found that `AwarenessBar` was inserted only after
  `/runs` returned active work. The resulting 43px shell insertion moved
  `.app-body` from y=59 to y=102 and contributed 0.115474 CLS. The strip now
  owns one stable semantic slot and renders truthful loading, idle, and active
  states instead of conditionally changing shell geometry.
- Two adjacent shell shifts were closed at the same ownership boundary: the
  app frame now owns a bounded viewport/scroll region, and the recent-study
  rail group owns a stable loading/empty/loaded region rather than appearing
  after asynchronous data arrives.
- Permanent layout-shift source/rectangle attribution was added to the perf
  regression. This exposed a second deterministic map defect after the home
  fix: the evidence request set `scienceLoaded` before the independent
  `/science` request settled, removing a 311.5px state placeholder and
  contributing 0.158829 CLS. A separate `spineLoaded` fact now owns that
  projection; one request can no longer claim another has completed.
- The loaded-home perf case now creates active work explicitly, asserts the
  awareness surface, requests cancellation, and waits for a persisted terminal
  state. An intermediate full-suite run showed why the last step matters: only
  requesting cancellation leaked an active worker into the later resilience
  case. The cleanup contract was fixed rather than hidden with a retry.

Direct verification after the final repair:

- Web typecheck and production build: PASS.
- Root typecheck: PASS; lint: zero errors and the same three pre-existing
  unused-disable warnings.
- i18n key regression: 4/4 passed.
- Isolated perf route: 2/2 passed; loaded home CLS 0.0001, map CLS 0.0185,
  seven claims, zero admissible template hypotheses, zero long tasks.
- Original reproduction order (`core-journey`, `draft-scope`, `perf`): 7/7
  passed; loaded home CLS 0.0001 and map CLS 0.0184.
- Complete Chromium route with one worker: 23/23 passed in 4.6 minutes; no
  retry or failure. It includes resilience, role/a11y, bilingual/theme,
  keyboard, narrow-screen, researcher-judgment, task-metric, and real-terminal
  paths.
- Secret scan: PASS across 901 files, no HIGH finding. Path hygiene: zero
  errors; only ignored `dist`/`node_modules` artifacts warned. `git diff
  --check` passed before commit.
- Five-table sync/check after the source commit: structural PASS across 902
  tracked files. Coverage remains deliberately incomplete at 5/902 reviewed
  (runtime 2/378, tests/evaluation/evidence 2/321, delivery/operations 1/114,
  product/specs/docs 0/38, governance/assets 0/51); shallow assertions are
  1/168 adjudicated. FA-W0-05/06 therefore remain PARTIAL.

FA-PLT-02 remains PARTIAL rather than PASS: canonical `main@cc4009c` still has
the red hosted run recorded above. The local root cause is closed at `87a1f3f`,
but a canonical hosted verify+web-e2e green run must be observed after this lane
is integrated before the hosted-CI acceptance criterion can change state.
