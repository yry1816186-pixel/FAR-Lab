# FAR-Lab Human Surface Inventory

Baseline branch: `main`  
Baseline commit: `a6647be68c8012246ffb57de8752649657a847f2`  
Inventory date: 2026-08-18

This inventory treats the Human Experience Layer as every surface a person can see, read, operate, wait on, interpret, export, or consume. It is intentionally broader than `frontend/`.

## 1. Browser application

The browser app has 17 named product routes plus the canonical `/` redirect and a not-found surface.

| Route | Surface | Primary user task | Data / capability source | Final disposition |
|---|---|---|---|---|
| `/research` | Research Workbench | Ask, plan, run, inspect, evaluate | Research API/client | Primary workflow; normalized |
| `/planning` | Planning | Inspect deterministic planning gates | Planning API | Primary workflow; retained |
| `/versions` | Version Diff | Compare revisions and changes | Version/comparison API | Primary workflow; retained |
| `/events` | Live Events | Observe real execution events | SSE/event stream | Primary workflow; no fake progress |
| `/report` | Report | Inspect/export generated report | Report API/renderers | Primary output workflow |
| `/overview` | Overview | Inspect service/recent status | health + receipts | Real operational overview; no hard-coded KPI contract |
| `/wizard` | Verification Wizard | Guided real verification/export flow | verification/export APIs | Verification workflow |
| `/v2-receipt` | V2 Receipt | List/upload/verify/re-verify receipts and follow shared run links | persisted V2 receipts + verification APIs | Production-only data flow; legacy demo receipt endpoint is not consumed by the page |
| `/viz` | Evidence Chain | Inspect evidence graph | evidence API | Evidence/provenance analysis |
| `/integrity` | Integrity | Recompute proof/root and export receipt | integrity API + Web Crypto | Trust/integrity workflow |
| `/court` | Court | Inspect/run reliability court | court API | Evaluation capability |
| `/arena` | Arena | Inspect/run adversarial comparison | arena API | Evaluation capability |
| `/leaderboard` | Leaderboard | Inspect benchmark breadth/integrity | benchmark API | Evaluation capability |
| `/honesty` | Honesty Wall | Inspect negative/limitation evidence | evidence/verdict data | Trust/limitations capability |
| `/ablation` | Ablation | Inspect sensitivity/ablation results | ablation data/API | Evaluation capability |
| `/audit` | Audit Trace | Trace verdict → evidence → lifecycle using only proven identifier relations | audit APIs | Audit capability; hypothesis IDs are not guessed as chain-head hashes |
| `/about` | About | Understand product/version principles | local product metadata | Informational surface |
| `*` | Not Found | Recover from invalid URL | router | Localized explicit recovery surface |

### Browser shared surfaces

- App shell and two-level information architecture.
- Desktop primary navigation and trust/verification disclosure.
- Mobile navigation drawer with focus management and Escape close.
- Cmd/Ctrl+K command center; navigation only, backed by the route SSOT rather than placeholder commands.
- Light/dark/system theme handling and cold-start theme preload.
- English/Chinese i18n and `<html lang>` synchronization.
- Route-level lazy loading and route recovery boundary.
- Loading, empty, retry/error and unavailable states across data-dependent pages.
- Dialogs, alerts, badges, buttons, inputs, tables, tabs/disclosure where semantically appropriate.
- Evidence timeline, integrity proof views, ablation charts, evidence graph and benchmark views.
- Responsive layouts from phone through desktop; dense tables preserve explicit overflow or progressive disclosure rather than crushing columns.
- Keyboard focus, skip link, route focus restoration, reduced-motion handling.

### Receipt production-data boundary

`/v2-receipt` consumes only real persisted/shared/upload verification paths in its production UI:

- persisted receipt list and pagination;
- `runId` → receipt lookup using the backend-supported `claimId` filter;
- receipt detail and manifest members;
- latest stored verification dimensions;
- envelope upload verification response;
- explicit re-verification mutation.

The legacy `/api/v2/receipts/demo` fixture endpoint may remain available to deterministic test/self-test code, but it is not a production Web data source, loading prerequisite, provenance claim, or success state.

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
- CJK/full-width terminal table alignment via display-cell width rather than JavaScript string length.

The historical `far demo` command remains a deterministic/offline self-test capability in the CLI registry; it is not evidence that a production research run succeeded and is not used by the Web product as a formal result source.

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

The HTML report renderer uses semantic `<main>`, captioned/scoped verdict tables, long-identifier wrapping, responsive padding, and print rules without changing report facts or verdict semantics.

## 4. API errors and operational feedback

Scanned `src/api/routes/**`, frontend API adapters, development/bootstrap scripts, and health/readiness surfaces. Scientific/evidence mutations are not converted into optimistic success. Unknown/unavailable/partial/failed states must remain distinct from verified/pass states.

## 5. Desktop / native OS surfaces

No Electron/Tauri/native desktop application layer was found in the tracked project. FAR-Lab uses browser and terminal surfaces. No synthetic desktop wrapper was added.

## 6. Tests as human-surface contracts

Scanned browser route tests, accessibility baseline tests, i18n tests, API client tests, CLI render/cancellation tests, report renderer tests, performance budget gates, cross-platform CI, and release smoke checks. New Receipt tests enforce the production/fixture boundary in addition to existing command-center navigation, terminal-width, Audit identifier-boundary, and report-semantics regressions.

## 7. Final validation state

The inventory reflects final source structure, but overall Definition-of-Done validation is still **NOT COMPLETED** because the complete build/frontend/root/browser matrix has not been rerun against the current `main` after the final Receipt closure. Exact executed evidence is recorded in `VALIDATION_REPORT.md`.
