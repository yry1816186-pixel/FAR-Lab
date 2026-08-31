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

## Integrated Wave 0 closure checkpoint

The preserved conversation lane was committed byte-for-byte as `b8afe4b`, then
the Wave 0 hardening commit was rebased on top as `c926aa9`. No primary-worktree
file was reset or overwritten. Subsequent FA-first repair commits restored the
conversation thinking/durability contract (`d17d6eb`, `bbc4418`, `7d54404`) and
converged research-scope editing (`8d32da1`, `d39b427`).

Direct verification on the integrated auxiliary worktree:

- Conversation/provider targeted gate: 83 tests passed; adjacent API,
  conversation and reasoning gate: 106 tests passed.
- Scope/API/i18n focused gate: 17 tests passed; compiled CLI scope/draft and
  freshness gate: 28 tests passed.
- Scope browser journey: 3/3 Playwright Chromium tests passed against an
  isolated production route on port 3298. User-owned port 3196 was untouched.
- Root and web typechecks passed; root and web production builds passed; lint
  had zero errors and three pre-existing unused-disable warnings.
- Final controlled full Vitest gate (`--maxWorkers=4 --minWorkers=4`): 231 files
  passed, one file explicitly skipped; 2334 tests passed, 12 explicitly skipped,
  zero failed (232 files / 2346 tests total).
- Deterministic secret scan: PASS across 899 files, no HIGH findings. The 68
  MEDIUM heuristic matches are 67 visible test/dummy credential assignments and
  one production lexical false positive (`const token = jsonStringPrefixAt`),
  not a plaintext credential.
- Path hygiene: zero errors; only ignored auxiliary `dist` and `node_modules`
  artifacts were warned. `git diff --check` and tracked status were clean before
  this evidence update.
- Five-table sync/check: structural PASS over 901 tracked files, but actual
  reviews remain runtime 2/378, tests/evaluation/evidence 2/321,
  delivery/operations 1/114, product/specs/docs 0/38, governance/assets 0/50.
  Shallow assertions remain 1/167 adjudicated. FA-W0-05/06 therefore stay
  PARTIAL by design.

Wave 0 implementation criteria FA-W0-01/02/03/04/07 are now evidenced PASS.
This is not a release-completion claim: the exhaustive sweep and the pre-existing
frontier in `FINAL_ACCEPTANCE.json` remain open. Next action is Wave A, starting
with the highest-leverage hosted-CI/platform root cause that can be verified
without mutating the user-owned primary worktree or port 3196.
