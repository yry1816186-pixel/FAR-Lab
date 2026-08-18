# FAR-Lab UI / Human Experience Debt Report

Baseline: `main@a6647be68c8012246ffb57de8752649657a847f2`  
Audit date: 2026-08-18

Severity: P0 blocks correctness/trust; P1 materially harms core workflow/accessibility; P2 consistency/efficiency; P3 polish/maintenance.

| Severity | Surface | Debt observed | Resolution | Status |
|---|---|---|---|---|
| P1 | Audit Trace / API affordance | Audit Trace passed a hypothesis/claim ID directly to `/api/v1/evidence/chain/:headHash`, although that endpoint requires an actual chain-head hash; the UI therefore implied a provenance relation the backend did not expose | Split identifier routing by real capability: claim/hypothesis IDs only query verdict + lifecycle; only a 64-hex chain head queries evidence chain. The UI explicitly explains that no reliable hypothesis→headHash mapping exists and never guesses one | Resolved |
| P1 | Audit Trace tests | Existing test asserted `/evidence/chain/hypo-1`, locking the incorrect capability mismatch in as expected behavior | Replaced that assertion with endpoint-boundary regression tests for claim IDs, real chain hashes, and honest empty results; no test was skipped or weakened | Resolved |
| P1 | Global navigation | Route IA lived inside a 400+ line AppShell, making route labels/search/title consumers prone to drift | Extracted `navigation.ts` SSOT; AppShell and document-title mapping consume it | Resolved |
| P1 | Expert navigation | 17 routes require repeated pointer navigation; no global fast path | Added Cmd/Ctrl+K command center backed only by real route SSOT; keyboard filtering/navigation/escape/focus restoration | Resolved |
| P1 | Responsive page headers | Shared PageHeader forced a single horizontal row and truncated title, making narrow action-heavy headers brittle | Header now stacks on phones, wraps actions, and removes destructive title truncation | Resolved |
| P1 | Dense data tables | Shared table header scrolled away; dense cells consumed excessive phone width | Sticky shared headers + responsive cell padding; overflow remains explicit rather than crushing columns | Resolved |
| P1 | Semantic color debt | Product TSX contained 56 direct red/green/amber/blue/gray palette references, splitting light/dark semantics across pages | Added semantic UI tokens and migrated product TSX to success/warning/info/destructive/muted semantics | Resolved |
| P1 | CLI / CJK | CLI table alignment used JavaScript `.length`, so CJK/full-width labels occupy the wrong terminal width | Added dependency-free `displayWidth()` and display-cell padding; regression test added | Resolved |
| P1 | Generated HTML report | Export lacked main landmark, table caption/scope semantics, responsive long-ID behavior and print-specific layout | Added semantic structure, table caption/scoped headers, wrapping, mobile and print CSS | Resolved |
| P2 | i18n / domain metadata | Audit Trace, Evidence Timeline decision/provenance metadata, Research dense-table labels, and lazy-route loading text bypassed the existing zh/en catalogue | Added a focused supplemental catalogue merged into the existing `messages` SSOT and wired those surfaces to `useT`; no parallel translation system was introduced | Resolved |
| P2 | Motion | Motion aliases existed only as Tailwind literals and were not described as cross-product variables | Added motion CSS tokens and Tailwind semantic duration aliases; reduced-motion override retained | Resolved |
| P2 | App gutters | Main container inherited large generic container padding on phone widths | Explicit responsive 16/24/32px gutters on shell/main | Resolved |
| P2 | Human-surface documentation | No repository-root inventory proving browser/CLI/export coverage | Added `HUMAN_SURFACE_INVENTORY.md` | Resolved |
| P2 | Design system documentation | Tokens existed in code but no consolidated product-facing rules artifact | Added `DESIGN_SYSTEM.md` | Resolved |
| P2 | Large components | Several domain-heavy pages/components remain 500–900+ lines (`IntegrityPage`, `AblationPage`, `ResearchWorkbenchPage`, `EvidenceTimeline`) | Cross-cutting IA/styles/state conventions were moved into shared primitives/SSOTs without mechanically fragmenting scientific logic. Further domain decomposition remains a maintainability opportunity, not a user-facing correctness blocker | Partially resolved |
| P2 | Browser regression infrastructure | Repository has Testing Library/Vitest but no committed Playwright/Cypress runtime dependency | Delivery validation runs Chromium + axe-core ephemerally in GitHub Actions across all routes, themes, responsive widths, and keyboard paths. A persistent screenshot-diff framework is intentionally not added as a runtime dependency | Resolved for delivery; persistent visual diff remains optional |
| P3 | Generated report theme | HTML report intentionally renders as a printable light document rather than mirroring app dark mode | Explicit `color-scheme: light` and print-first behavior retained | Intentional |

## Fake UI audit

The product is evaluated against a strict three-state rule: an affordance must be genuinely wired, explicitly unavailable with a reason, or removed. No new fake data, fake progress, inert navigation, unsupported mutation action, or fabricated evidence relation is introduced. The Audit Trace correction is the concrete example from this pass: the previous hypothesis-ID→chain-head implication was removed because the backend cannot prove that mapping.

## Scientific integrity guardrail

No change was made to deterministic verdict rules, evidence hashing, proof verification, scientific gate semantics, security boundaries, authorization policy, or persistence success criteria. This refactor is confined to presentation, navigation, rendering, API-affordance correctness, terminal display behavior, accessibility, localization, and validation infrastructure.
