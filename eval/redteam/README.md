# R2-14 Red-Team Probe Suite — Independent Evaluation Lane

Owner: lane 14 (`ws/r2/14-evaluation-redteam`, base `baseline/parallel-r2` = 47cc373).
Scope: `eval/**` only. Production code is read-mostly — findings become handoffs,
never production patches from this lane.

## Threat model

Each probe exists to falsify one class of fake capability (mission taxonomy):

| Fake-capability class | Probe |
|---|---|
| disconnected library / wrapper with no caller | p1-wiring |
| UI controls with no effect (client route with no server) | p2-route-contract |
| mock/synthetic results presented as live | p3-live-masquerade |
| stale Web assets served as current | p4-stale-web |
| citation/DOI fabrication; ungrounded "verified" claims | p5-citation-grounding |
| "sandbox" that is only a cwd prefix check | p6-sandbox-escape |
| memory that stores but does not improve behavior | p7-memory-benefit |
| multi-agent that is only multiple prompts (no permission plane) | p8-agent-isolation |

## Usage

```bash
node eval/redteam/scorecard.mjs        # full battery + replay benchmarks + scorecard
node eval/redteam/p2-route-contract.mjs  # single probe (each writes eval/results/r2-14/<id>.json)
```

Inputs: `eval/results/r2-14-inputs/far.db` — a read-only copy of the primary
workspace runtime DB (gitignored; never written). Absent DB degrades the DB-audit
probes to ADVISORY, never silently to PASS.

Outputs: `eval/results/r2-14/` (runtime, gitignored) and a committed snapshot in
`evidence/r2-14/` for lane 15 + the final integrator.

## Verdict semantics

- `PASS` — no findings.
- `ADVISORY` — divergences that need a human/owning-lane decision (test-only
  modules, marker-vocabulary lines, cross-run bindings…). They appear in the
  scorecard's divergence report and in handoffs, never silently dropped.
- `FAIL` — a probe falsified a capability claim. The scorecard converts every
  FAIL into an explicit invalid-claim entry naming the undermined claim.
- `BLOCKED-live` — reserved for findings whose verification requires a live model
  route (none of P1-P8 needs one; live-route probes stay in eval/PROTOCOL.md
  land under the workspace no-live-API directive).

## Honest limits

- P1's import graph follows literal relative specifiers; non-literal dynamic
  imports are detected and downgrade affected modules to manual review.
- P2 proves the route contract, not full UI semantics; dead-handler scanning is
  heuristic (advisory only).
- P6 drives the TS analyzer battery directly; the Python sidecar mirror is
  checked for presence, not executed (sidecar execution belongs to lane 10's
  real-run evidence).
- P8 behavioral checks cover the permission engine; full subagent rollouts need a
  model route — the subagent wiring is verified by source markers instead.
- The scorecard evaluates THIS TREE (the R2 baseline). Lane branches are not
  fused; lane 99 must re-run the battery on the integrated tree.
