# Handoff 07 → 03: `far research export --format package` wiring

- **Date:** 2026-08-25
- **From:** lane 07 (scientific-communication) — **To:** lane 03 (terminal-desktop)
- **Urgency:** normal (product polish; engine is shipped and usable via script today)

## Requested change

Add `package` (and optionally `paper`) to `far research export <run-id> --format ...` in
`src/cli/main.ts`, delegating to the lane-07 engine — no reimplementation:

```ts
import { buildReproducibilityPackage } from '../../report/package.js';
// format === 'package':
const result = await buildReproducibilityPackage(
  { store: app.store, artifacts: app.artifacts }, rid,
  { outDir, /* formats from --formats csv flag, optional */ },
);
```

## Reason

The reproducibility-package engine (paper md+docx/jats/html via pandoc citeproc, report,
bibliography, deterministic figures/tables, MANIFEST sha256, RO-Crate 1.1, README with
`far verify` instructions) is complete and lane-tested. The only missing surface is the
CLI flag; today it is reachable via `node scripts/export-manuscript.mjs <run-id>`.

## Reference implementation

`scripts/export-manuscript.mjs` (thin dist entry, same argument shape: `--out`,
`--formats docx,jats,html`, `--no-pandoc`, `--json`) — copy its arg handling and output
summary; engine contract documented in `src/report/package.ts`.

## Files

- `src/cli/main.ts` (lane 03 file; export subcommand block)
- `src/cli/completion.ts` (add `--format package` hint words if listed there)
