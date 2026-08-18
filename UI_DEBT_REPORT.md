# FAR-Lab UI / Human Experience Debt Report

Baseline: `main@a6647be68c8012246ffb57de8752649657a847f2`  
Audit date: 2026-08-18

Severity: P0 blocks correctness/trust; P1 materially harms core workflow/accessibility; P2 consistency/efficiency; P3 polish/maintenance.

| Severity | Surface | Debt observed | Resolution | Status |
|---|---|---|---|---|
| P1 | Global navigation | Route IA lived inside a 400+ line AppShell, making route labels/search/title consumers prone to drift | Extracted `navigation.ts` SSOT; AppShell and document-title mapping consume it | Resolved |
| P1 | Expert navigation | 17 routes require repeated pointer navigation; no global fast path | Added Cmd/Ctrl+K command center backed only by real route SSOT; keyboard filtering/navigation/escape/focus restoration | Resolved |
| P1 | Responsive page headers | Shared PageHeader forced a single horizontal row and truncated title, making narrow action-heavy headers brittle | Header now stacks on phones, wraps actions, and removes destructive title truncation | Resolved |
| P1 | Dense data tables | Shared table header scrolled away; dense cells consumed excessive phone width | Sticky shared headers + responsive cell padding; overflow remains explicit rather than crushing columns | Resolved |
| P1 | Semantic color debt | Product TSX contained 56 direct red/green/amber/blue/gray palette references, splitting light/dark semantics across pages | Added semantic UI tokens and migrated product TSX to success/warning/info/destructive/muted semantics | Resolved |
| P1 | CLI / CJK | CLI table alignment used JavaScript `.length`, so CJK/full-width labels occupy the wrong terminal width | Added dependency-free `displayWidth()` and display-cell padding; regression test added | Resolved |
| P1 | Generated HTML report | Export lacked main landmark, table caption/scope semantics, responsive long-ID behavior and print-specific layout | Added semantic structure, table caption/scoped headers, wrapping, mobile and print CSS | Resolved |
| P2 | i18n | 404 and language-toggle accessible name bypassed catalogue | Added zh/en catalogue entries and localized 404/action name | Resolved |
| P2 | Motion | Motion aliases existed only as Tailwind literals and were not described as cross-product variables | Added motion CSS tokens and Tailwind semantic duration aliases; reduced-motion override retained | Resolved |
| P2 | App gutters | Main container inherited large generic container padding on phone widths | Explicit responsive 16/24/32px gutters on shell/main | Resolved |
| P2 | Human-surface documentation | No repository-root inventory proving browser/CLI/export coverage | Added `HUMAN_SURFACE_INVENTORY.md` | Resolved |
| P2 | Design system documentation | Tokens existed in code but no consolidated product-facing rules artifact | Added `DESIGN_SYSTEM.md` | Resolved |
| P2 | Large components | Several pages/components remain 500–900+ lines (`IntegrityPage`, `AblationPage`, `ResearchWorkbenchPage`, `EvidenceTimeline`) | Kept scientific/domain logic intact in this pass; cross-cutting styling/IA moved outward, but deeper domain decomposition remains a maintainability opportunity | Partially resolved |
| P2 | i18n legacy strings | A small number of domain-heavy surfaces (notably Audit Trace and Evidence Timeline metadata) still contain literal bilingual/English labels | Preserved where changing catalogue surface would be high-risk without domain-copy review; global/system strings fixed | Known limitation |
| P2 | Browser E2E/visual regression | Repository has Testing Library/Vitest but no Playwright/Cypress dependency | Final visual QA is run ephemerally in CI without adding a runtime dependency; repository still has no committed screenshot regression framework | Known limitation |
| P3 | Generated report theme | HTML report intentionally renders as a printable light document rather than mirroring app dark mode | Explicit `color-scheme: light` and print-first behavior retained | Intentional |

## Fake UI audit

The existing project already had strong anti-theater constraints and real API wiring. No new fake data, fake progress, inert navigation, or unsupported mutation action was introduced. The command center performs navigation only. Existing unavailable states remain explicit rather than being converted into simulated success.

## Scientific integrity guardrail

No change was made to deterministic verdict rules, evidence hashing, proof verification, scientific gate semantics, security boundaries, or persistence success criteria. The refactor is presentation/navigation/rendering-layer only, plus terminal display-width behavior.
