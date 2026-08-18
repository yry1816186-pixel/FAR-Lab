# FAR-Lab Human Experience Refactor Manifest

## Baseline

- Repository: `yry1816186-pixel/FAR-Lab`
- Original target branch: `main`
- Original commit SHA: `a6647be68c8012246ffb57de8752649657a847f2`
- Work branch: `ux-refactor/2026-08-18`
- Validated source SHA before report finalization: `bc0dd522b6115cd6c8b5b6b0a52f037e0a1ab5d4`

## Architectural and product changes

1. Preserved the existing route/navigation SSOT and research-first information architecture rather than creating a competing design system.
2. Added a focused human-surface i18n catalogue merged into the existing message system; migrated remaining Audit/Evidence/Research system labels.
3. Corrected Audit Trace capability mismatch: claim IDs now call verdict/lifecycle APIs while only real 64-hex chain heads call the evidence-chain endpoint.
4. Retained semantic operational/verdict color tokens, responsive dense-data primitives, reduced-motion behavior, command center, CLI Unicode display-width handling, and semantic generated reports.
5. Validation runs the repository build/type/lint/tests/performance/contracts plus real Chromium responsive/theme/keyboard/axe checks.

## Scientific and security integrity

No deterministic verdict rule, evidence hash rule, proof verification rule, falsifiability gate, authorization boundary, or persistence success criterion was intentionally changed by this finalization.

## Dependencies

No runtime dependency was added. Playwright and axe-core are installed ephemerally only inside the validation workflow.

## Migrations

No database/schema migration is introduced by this Human Experience Layer finalization.

## File changes from original main

- `M	.github/workflows/ux-refactor-source-export.yml`
- `M	HUMAN_SURFACE_INVENTORY.md`
- `A	PROJECT_FILE_MANIFEST.txt`
- `M	REFACTOR_MANIFEST.md`
- `M	UI_DEBT_REPORT.md`
- `M	VALIDATION_REPORT.md`
- `A	VALIDATION_RUN_ID.txt`
- `M	frontend/src/App.tsx`
- `M	frontend/src/__tests__/AuditTracePage.test.tsx`
- `M	frontend/src/__tests__/HonestyWallPage.test.tsx`
- `M	frontend/src/__tests__/VizPage.test.tsx`
- `M	frontend/src/components/EvidenceTimeline.tsx`
- `M	frontend/src/index.css`
- `A	frontend/src/lib/i18n/human_surfaces.ts`
- `M	frontend/src/lib/i18n/messages.ts`
- `M	frontend/src/pages/AuditTracePage.tsx`
- `M	frontend/src/pages/ResearchWorkbenchPage.tsx`
- `M	frontend/src/pages/V2ReceiptPage.tsx`
- `M	src/cli/render.ts`
- `M	src/governance/complexity_ledger.ts`

## Known limitations

- Automated accessibility testing cannot prove screen-reader announcement quality or every assistive-technology/browser combination; semantic/keyboard checks and axe complement, not replace, manual AT testing.
- CI lab performance is not production field telemetry.
- The current backend does not expose a reliable hypothesis-ID → evidence-chain headHash mapping; Audit Trace explicitly communicates this rather than fabricating a cross-link.
