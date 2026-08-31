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
