# FAR-Lab Human Surface Inventory

Baseline branch: `main`  
Baseline commit: `1e2c8b3c7c8706292f890138e88948ab7dcb80a3`  
Inventory date: 2026-08-18

This inventory treats the Human Experience Layer as every surface a person can see, read, operate, wait on, interpret, export, or consume. It is intentionally broader than `frontend/`.

## 1. Browser application

The browser app has 17 named product routes plus the canonical `/` redirect and a not-found surface.

| Route | Surface | Primary user task | Data / capability source | Refactor disposition |
|---|---|---|---|---|
| `/research` | Research Workbench | Ask, plan, run, inspect, evaluate | Research API/client | Primary workflow; retained and visually normalized |
| `/planning` | Planning | Inspect deterministic planning gates | Planning API | Primary workflow; retained |
| `/versions` | Version Diff | Compare revisions and changes | Version/comparison API | Primary workflow; retained |
| `/events` | Live Events | Observe real execution events | SSE/event stream | Primary workflow; retained; no fake progress |
| `/report` | Report | Inspect/export generated report | Report API/renderers | Primary workflow; retained |
| `/overview` | Overview | Inspect service/recent status | health + receipts | Secondary trust tool |
| `/wizard` | Verification Wizard | Guided real verification/export flow | verification/export APIs | Secondary trust tool |
| `/v2-receipt` | V2 Receipt | Upload/verify/re-verify receipts | V2 receipts API | Secondary trust tool |
| `/viz` | Evidence Chain | Inspect evidence graph | evidence API | Secondary trust tool |
| `/integrity` | Integrity | Recompute proof/root and export receipt | integrity API + Web Crypto | Secondary trust tool |
| `/court` | Court | Inspect/run reliability court | court API | Secondary trust tool |
| `/arena` | Arena | Inspect/run adversarial comparison | arena API | Secondary trust tool |
| `/leaderboard` | Leaderboard | Inspect benchmark breadth/integrity | benchmark API | Secondary trust tool |
| `/honesty` | Honesty Wall | Inspect negative/limitation evidence | evidence/verdict data | Secondary trust tool |
| `/ablation` | Ablation | Inspect sensitivity/ablation results | ablation data/API | Secondary trust tool |
| `/audit` | Audit Trace | Trace verdict → evidence → lifecycle | audit APIs | Secondary trust tool |
| `/about` | About | Understand product/version principles | local product metadata | Secondary informational surface |
| `*` | Not Found | Recover from invalid URL | router | Refactored into localized explicit error surface |

### Browser shared surfaces

- App shell and two-level information architecture.
- Desktop primary navigation and trust/verification disclosure.
- Mobile navigation drawer with focus management and Escape close.
- Cmd/Ctrl+K command center; **navigation only**, backed exclusively by the route SSOT.
- Light/dark/system theme handling and cold-start theme preload.
- English/Chinese i18n and `<html lang>` synchronization.
- Route-level lazy loading and route recovery boundary.
- Loading skeletons/spinners, empty states, retry/error states across data-dependent pages.
- Dialogs, alerts, badges, buttons, inputs, cards, tables, tabs.
- Evidence timeline, integrity proof views, ablation charts, evidence graph and benchmark views.
- Responsive layout from phone through desktop; horizontal overflow retained where dense tables require it rather than crushing columns.
- Keyboard focus, skip link, route focus restoration, reduced-motion handling.

## 2. CLI / terminal

`src/cli/far.ts` registers 38 top-level commands. The CLI is treated as a first-class product surface; stdout/stderr and exit-code behavior remain scriptable.

`version`, `doctor`, `hardware`, `status`, `api`, `demo`, `ask`, `stream`, `repl`, `replay`, `court`, `arena`, `init`, `keygen`, `sign`, `verify-sig`, `snapshot-verify`, `verify`, `verify-golden`, `bench`, `export`, `rubric`, `fec`, `fsm`, `planning`, `governance`, `audit-seed-cherry`, `audit-multiseed`, `c-astro`, `c-astro-loop`, `ground`, `check-resource`, `campaign`, `research`, `lifecycle`, `backup`, `schedule`, `real-paper`.

Shared terminal surfaces scanned:

- Global and per-command help / usage.
- Option parsing and validation.
- ANSI / `NO_COLOR` behavior.
- TTY versus non-TTY behavior.
- Spinner/progress rendering.
- Status badges and aligned tables.
- Structured / JSON output paths used by commands that support machine-readable output.
- SIGINT/two-phase cancellation.
- Long-running research/campaign feedback.
- stderr/stdout separation and exit status in dispatcher/tests.
- CJK/full-width terminal table alignment (refactored in `src/cli/render.ts`).

## 3. Human-readable generated artifacts

Scanned and retained:

- `src/report/markdown_renderer.ts` — Markdown and self-contained HTML research reports.
- `src/report/latex_renderer.ts` — compilable LaTeX research reports.
- `src/report/generator.ts` and report sections — deterministic report assembly.
- `src/research/export_bundle.ts` — research export bundle.
- `src/research/citation_export.ts` — citations.
- `src/far_proof/exporter.ts` — `.far-proof` evidence bundle.
- CLI receipt/citation/proof export commands.
- planning/startup/stage receipts.
- campaign report generator.
- V2 receipt manifest/verification output.

The HTML report renderer was refactored for semantic `<main>`, captioned/scoped verdict tables, long-identifier wrapping, responsive padding, and print rules without changing report facts or verdict semantics.

## 4. API errors and operational feedback

Scanned `src/api/routes/**` (20 route modules), frontend API adapters, development/bootstrap scripts, and health/readiness surfaces. The UI continues to display server failures honestly; no mutation is converted into optimistic success where scientific/evidence writes are involved.

## 5. Desktop / native OS surfaces

No Electron/Tauri/native desktop application layer was found in the tracked project. FAR-Lab uses browser and terminal surfaces. No synthetic desktop wrapper was added.

## 6. Tests as human-surface contracts

Scanned browser route tests, accessibility baseline tests, i18n tests, API client tests, CLI render/cancellation tests, report renderer tests, performance budget gates, cross-platform CI, and release smoke checks. New behavior is covered by command-center navigation, terminal-width, and report-semantics regression assertions.
