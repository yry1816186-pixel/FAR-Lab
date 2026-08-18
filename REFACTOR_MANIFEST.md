# FAR-Lab Human Experience Refactor Manifest

## Baseline

- Repository: `yry1816186-pixel/FAR-Lab`
- Original target branch: `main`
- Original synchronized commit: `1e2c8b3c7c8706292f890138e88948ab7dcb80a3`
- Work branch: `ux-refactor/2026-08-18`
- Implementation commit: `b1c7ee95850ea3c43161c1e4d38810393bc9b5dd`
- Final packaging/validation commit: _populated after final validation cleanup_

## Architectural changes

1. Extracted browser information architecture into `frontend/src/components/layout/navigation.ts` as a route-label-icon-search SSOT.
2. Added `CommandCenter.tsx`, a keyboard-first navigation command center constrained to existing real routes.
3. Extended the design-token layer with semantic operational colors and CSS-level motion tokens; migrated product TSX away from raw Tailwind palette colors.
4. Strengthened shared responsive PageHeader and dense Table primitives.
5. Corrected CLI terminal table measurement for CJK/full-width/combining Unicode behavior without adding a dependency.
6. Strengthened generated HTML report semantics, responsive behavior and print output without modifying deterministic report facts.
7. Added repository-level Human Surface, UI debt, design-system, validation, replacement and file-manifest deliverables.

## Scientific/security integrity

Not changed:

- deterministic verdict computation;
- evidence/provenance hashing;
- proof verification rules;
- falsifiability/science gates;
- authorization/security boundaries;
- persistence success criteria;
- API scientific schemas.

## Dependencies

No runtime or development dependency was added for the refactor. Existing React/Radix/Tailwind/Testing Library infrastructure is reused.

## Migrations

No database/schema migration is required by this Human Experience Layer refactor.

## Known limitations

- Several domain-heavy pages/components remain large and can be decomposed further without changing UX behavior; the cross-cutting refactor deliberately avoids speculative rewrites of scientific domain logic.
- Some domain-specific literal strings remain outside the i18n catalogue; global/system additions in this change are localized.
- The repository does not commit a heavyweight browser E2E framework. Final browser screenshots are generated ephemerally during validation.
