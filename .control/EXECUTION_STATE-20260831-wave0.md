# Wave 0 execution lane — 2026-08-31

Branch: `lane/endgame-wave0-root`, based on `cc4009c`.

This lane was created in a clean auxiliary worktree because the primary Windows
worktree contains a genuine, uncommitted conversation-stream/product-shell lane
plus broad CRLF-only WSL diffs. Those files have not been reset, overwritten, or
included here. Integration remains required before FA-W0-02 can become PASS.

## Implemented and directly verified

- FA-W0-01: deterministic Unicode/NFKC evidence tokenizer for CJK scripts;
  Chinese punctuation/transcription and negative controls are regression-tested.
- FA-W0-02 (PARTIAL): closed handoff schema, quality/reference gate and fact-only
  degradation; durable successful-effect action hash deduplication; child-local
  budget splitting; bounded retryable-only MCP reconnect with identity guard.
- FA-W0-05/06 mechanism start: five disjoint Git-tracked sweep tables, FA-first
  finding links, atomic ledger updates, shallow-assertion inventory, and an
  intentionally red `--require-complete` gate.

Verification at this checkpoint:

- 105 targeted tests passed across 9 files after adding durable post-compaction
  effect replay and hard-context-overflow regressions.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 3 pre-existing unused-disable warnings.
- `secret-scan.mjs`: PASS; medium findings are test credential assignments and
  remain subject to file-by-file sweep adjudication.
- `path-hygiene.mjs`: no errors; only ignored root `node_modules` warning in the
  dependency-installed auxiliary worktree.
- FA-HAR-07: the first full-suite attempt exposed a pre-existing sidecar spawn
  lifecycle hang. The finding was registered before repair; missing-launcher and
  provisioned real-sidecar regressions now pass.
- Clean-lane build plus full Vitest gate (controlled 4-worker run against the
  provisioned locked sidecar environment): 228 files passed, 1 file skipped;
  2323 tests passed, 12 explicitly skipped, 0 failed.

## Truthful open state

- FA-W0-02 remains PARTIAL until the primary worktree's AbortSignal/model-output
  streaming changes are integrated and the full gate is run.
- FA-W0-03 remains FAIL: three scope forms have not yet converged.
- FA-W0-04 remains PARTIAL: hygiene scripts ran, but full finding adjudication is
  not complete.
- FA-W0-05 remains PARTIAL: mechanism is tested; tracked-file review is not 100%.
- FA-W0-06 remains PARTIAL: 165 shallow candidates are inventoried; the scanner's
  own fixture string is justified and the remaining 164 are pending.

Next action: commit this isolated Wave 0 slice, take over the existing streaming
lane without losing its changes, rebase/integrate, then implement scope convergence.
