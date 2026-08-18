# FAR-Lab Human Experience Refactor Manifest

## Baseline

- Repository: `yry1816186-pixel/FAR-Lab`
- Target branch: `main`
- Original refactor baseline: `a6647be68c8012246ffb57de8752649657a847f2`
- Final production Receipt closure commit: `82cc84d809e605b06770be530dc09367836f2631`
- Final documentation commits follow that source commit on `main`.

## Product architecture and information architecture

1. Preserved one route/navigation SSOT and a research-first product IA rather than creating a second navigation system.
2. App shell, desktop/mobile navigation, page titles and Cmd/Ctrl+K consume the same route model.
3. Kept all 17 real product routes while grouping lower-frequency trust/evaluation capabilities instead of flattening every page into the primary sidebar.
4. Added contextual product language around Research, Evidence/Provenance, Integrity, Audit, Receipt and Report without inventing backend objects or relations.
5. Corrected Audit Trace identifier semantics: claim/hypothesis IDs use verdict/lifecycle capabilities; only real 64-hex chain-head hashes query evidence-chain APIs.

## Production truth and scientific semantics

1. Removed the built-in demo/reference V2 Receipt from the production `/v2-receipt` data flow.
2. The Receipt workspace now depends on persisted receipts, backend-supported `runId`/`claimId` lookup, envelope verification responses, manifest data, latest verification data and explicit re-verification.
3. Unknown/unavailable/partial/failed/inconclusive states are not promoted to verified/pass/confirmed by presentation.
4. No deterministic verdict rule, evidence hash rule, proof verification rule, falsifiability gate, authorization boundary, persistence success criterion or scientific algorithm was intentionally changed by the Human Experience refactor.
5. The backend's lack of a reliable hypothesis-ID → evidence-chain headHash mapping is represented as unavailable rather than inferred.

## Design system and shared interaction changes

- Reused the existing CSS/Tailwind/theme architecture and normalized semantic status tokens rather than introducing a second design system.
- Migrated product TSX away from direct palette semantics toward success/warning/info/destructive/muted/evidence/provenance roles.
- Normalized responsive page headers, app gutters, sticky dense-table headers, long ID/hash wrapping and explicit horizontal overflow where appropriate.
- Kept reduced-motion behavior and light/dark/system theme support.
- Extended existing zh/en i18n and `<html lang>` behavior rather than adding a parallel translation layer.
- Retained keyboard skip/focus behavior, mobile Escape/focus restoration and command-center keyboard navigation.

## Web surface changes

- Research: retained real run/planning/evaluation flow and honest long-running state semantics.
- Overview: operational/recent-data product surface rather than a marketing landing page.
- Evidence / Visualization: evidence/provenance interpretation and accessible data representation.
- Integrity: explicit integrity outcomes and proof detail rather than success-only presentation.
- Audit: corrected identifier/API boundary and honest unavailable relation state.
- Receipt: production-only real data paths; fixture-led page state removed.
- Report: semantic HTML, print behavior, captioned/scoped data tables and long-identifier handling.
- Planning, Versions, Events, Wizard, Court, Arena, Leaderboard, Honesty, Ablation, About and remaining routes were included in the shared shell/i18n/responsive/a11y audit rather than left as disconnected demo pages.

## CLI

- CLI remains a first-class Human Surface with scriptable exit/stdout/stderr behavior, `NO_COLOR`, TTY-aware rendering and structured modes where supported.
- `src/cli/render.ts` uses terminal display-cell width for CJK/full-width alignment instead of JavaScript `.length`.
- No fake numeric progress is introduced when total work is unknown; the UX gate explicitly enforces this.
- Existing deterministic/demo/reference commands are treated as offline self-test/evaluation tooling, not as proof of a production research result.

## Generated artifacts

Retained and audited human-readable outputs include Markdown/HTML/LaTeX reports, research export bundles, citations, `.far-proof` bundles, receipts, planning/stage receipts, campaign reports and V2 verification/manifest output. Human-readable report semantics were improved without changing scientific facts.

## Validation and testing changes

- Existing build/type/lint, frontend, root, Python, UX/CLI, performance and OpenAPI gates were executed in the hosted validation pass.
- The hosted pass exposed one V2 Receipt frontend defect and one stale complexity-ledger defect instead of hiding them.
- V2 Receipt production tests were rewritten around real persisted/upload verification behavior and explicitly reject calls to the legacy demo endpoint.
- Complexity budgets were reconciled to actual module counts; a targeted post-fix governance test run passed 5/5.
- Chromium evidence exists across all 17 routes plus responsive/theme variants, but the historical browser automation terminated on a timing-sensitive command-center step and was not rerun after the final Receipt closure.
- `VALIDATION_REPORT.md` is authoritative for what actually passed, failed, or remains unexecuted. Overall status is **NOT COMPLETED** until the complete matrix passes on the final `main` SHA.

## Cleanup / Git

- The temporary `ux-refactor/2026-08-18` branch was merged/removed.
- Remote branch inventory is reduced to `main` only.
- Temporary UX packaging/visual-QA/finalizer workflows created for delivery were removed; only permanent repository workflows remain.
- No synthetic desktop wrapper or one-off demo page was added.

## Dependencies and migrations

- No runtime dependency was added by the final Receipt closure.
- Playwright/axe were used ephemerally for delivery QA evidence; no second browser application stack was introduced.
- No database/schema migration was introduced by this Human Experience Layer refactor.

## Remaining limitations

- **Validation blocker:** the exact final `main` dependency graph could not be installed in the available ChatGPT container because external package-registry resolution is disabled, and a new hosted Actions execution could not be reliably triggered/discovered through the available GitHub App path. Therefore full current-main frontend/root/browser validation is not claimed.
- Automated accessibility testing cannot prove every screen-reader/browser/AT interaction; axe/semantic/keyboard checks complement manual assistive-technology QA.
- CI/lab performance is not field telemetry.
- The backend still does not expose a reliable hypothesis-ID → evidence-chain headHash mapping; the product explicitly communicates that limitation rather than fabricating a link.
