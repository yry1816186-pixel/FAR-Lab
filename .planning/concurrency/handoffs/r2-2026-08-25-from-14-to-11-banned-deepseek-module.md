# Handoff: banned DeepSeek provider module still present, wired only from tests

- **From:** lane 14 (evaluation-redteam) — **To:** lane 11 (model-plane, owns `src/providers/**`)
- **Date:** 2026-08-25
- **Urgency:** low-medium (compliance hygiene; no runtime exposure found — the module is unreachable from production entrypoints)

## Requested change

Delete `src/providers/deepseek.ts` (and its import in `tests/providers.test.ts`) per the standing user directive: DeepSeek is banned project-wide since 2026-08-22 (recorded in AGENTS-level state, eval/PROTOCOL.md addendum, and `src/providers/index.ts` live-set comment).

## Evidence (lane-14 P1 wiring probe, 2026-08-25)

- `src/providers/deepseek.ts` is unreachable from both production entrypoints (`src/server/main.ts`, `src/cli/main.ts`).
- Its only importer anywhere in the repo is `tests/providers.test.ts`.
- Probe output: `eval/results/r2-14/p1-wiring.json` → `testOnly` list (committed copy in `evidence/r2-14/`).

## Notes

- No masquerade: P3 live-masquerade audit found zero stub/banned-provider live receipts in the 5072-receipt DB copy — the module is dead code, not a live route.
- Keeping a banned-provider module test-only still advertises the surface in the tree; deletion closes the compliance gap. If a keep-reason exists (e.g. harness for future unban), document it next to the module.
