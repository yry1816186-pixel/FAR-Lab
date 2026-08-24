# R2 Lane 07 — scientific-communication report

Branch `ws/r2/07-scientific-communication`, base `baseline/parallel-r2` (`47cc373`),
worktree `work/r2-07-scientific-communication`. Mission: trustworthy path from verified
research state to scientific communication — manuscript, citations, figures/tables,
reproducibility package — with zero fabrication.

## 1. Commits

| SHA | Subject |
|---|---|
| (this branch, appended by git log) | `feat(report): scientific-communication subsystem — citations, figures/tables, pandoc bridge, reproducibility packages` |
| (this branch) | `docs(concurrency): lane 07 report + handoff 07→03 CLI package format` |

## 2. What was built

New lane module `src/report/**` (six modules) + wiring in the owned pipeline paths:

- **`citations.ts`** — pandoc-semantics citation extraction (`[@k]`, `[@a;@b]`, `[-@k]`,
  code spans/fences ignored) + integrity check (resolved/unresolved/uncited) + .bib
  rendering. Pandoc citeproc only WARNS on unresolved keys (probed: renders `Doe2020?`),
  so every export path fails closed on unresolved citations BEFORE pandoc runs
  (`CitationIntegrityError`).
- **`tables.ts`** — three deterministic tables with per-column provenance
  (results-overview / corpus-overview / claim-binding), markdown + RFC-4180 CSV
  renderers. Conflicting experiment verdicts stay distinct entries (never averaged);
  null cells render as `—`/empty, never 0.
- **`figures.ts`** — zero-dep deterministic SVG: win-rate-per-ranked-hypothesis (null →
  visible `no data (not contested)` row) and corpus-by-content-depth (all four depth
  categories, zero counts included). Provenance (runId, generatedAt, value source)
  embedded in `<desc>`; XML-escaped; codepoint-aware truncation.
- **`pandoc.ts`** — optional pandoc bridge (FARLAB_PANDOC_PATH override → PATH): real
  citeproc conversion to docx / standalone JATS (NLM DTD v1.2 `<article>` + ref-list) /
  standalone html. Absent pandoc ⇒ formats honestly reported unavailable; conversion
  errors disclosed per-format, never faked.
- **`rocrate.ts`** — RO-Crate 1.1 metadata (structure verified against the spec pages:
  context URL, descriptor `about`→`./`, `conformsTo` PID; file entities with plain
  `sha256` — 1.1 context has no sha256 term (fetched and checked), 1.2-forward-compatible).
- **`package.ts`** — `buildReproducibilityPackage()`: on-disk export contract
  (paper.md + report.md as the STORED pipeline artifacts, hash-checked against the
  bundle; references.bib, figures/, tables/ re-projected deterministically with
  `now = bundle.createdAt`; bundle.json canonical; MANIFEST.json sha256 over every
  file; ro-crate-metadata.json; README with `far verify` + manifest-check command and
  bundle limitations verbatim). Byte-deterministic per bundle.
- **`paper-outline.ts` (owned)** — inline `[@key]` citations on abstract claim points
  and counter-evidence highlights (only when the claim's grounding source is in the
  reference list — never invented); NEW related-work block (one annotated line per
  cited source: year/venue/depth/identifier-resolution/retraction, scoped-disclosed as
  retrieved-corpus-only); BibTeX `note` carries retraction status; References section
  lists retraction warnings above the bib block.
- **`stages/export.ts` (owned)** — export stage now emits the two figures + six table
  artifacts (csv+md) into the artifact store, records a dedicated
  `pipeline/export-figures-tables` receipt (input/output hashes), and extends the
  ReproducibilityBundle with `figures`/`tables` ref arrays (additive, optional — old
  bundles parse).
- **`scripts/export-manuscript.mjs`** — thin dist entry:
  `node scripts/export-manuscript.mjs <run-id> [--out] [--formats] [--no-pandoc] [--json] [--data-dir]`.

Scientific-honesty properties carried end-to-end: retraction status renders in
related-work + references warning + BibTeX note + corpus CSV; unresolved citations are
a hard export failure; pandoc/JATS numbers all come from stored objects (standing
"uncalibrated decision aid" disclosures preserved).

## 3. Evidence (commands + exit codes + key output)

Setup: `git worktree add work/r2-07-scientific-communication -b ws/r2/07-scientific-communication baseline/parallel-r2`
→ HEAD = `47cc373` (matches `git rev-parse baseline/parallel-r2`). Baseline sanity:
`npm ci` (144 pkgs) → `npm run typecheck` exit 0 → `npm run build` exit 0.

Lane gates (final state): `npm run typecheck` exit 0; `npm run build` exit 0;
`node zcode-harness/scripts/secret-scan.mjs` `"status": "PASS"` exit 0;
`npm run lint` 0 errors (3 pre-existing unused-eslint-disable warnings, same as the
baseline record).

New tests (all green):
- `tests/report-communication.test.ts` — 16 (citation extraction incl. `[-@key]` +
  code-span immunity; integrity classes; CSV/markdown escaping; conflicting-verdict
  preservation with both CIs; retraction in corpus table; SVG determinism/escaping/
  zero-state disclosure; RO-Crate structure).
- `tests/report-pandoc.test.ts` — 6 (REAL local pandoc 3.8.3: docx `PK` magic,
  standalone JATS with resolved citation + ref-list, standalone html; fail-closed
  `CitationIntegrityError` before pandoc; honest skip marker when pandoc absent).
- `tests/report-package.test.ts` — 7 (real Store + real export stage integration:
  stored-artifact byte identity, MANIFEST re-hash, bundle.json deep-equal, RO-Crate
  hash alignment, citation resolution, README verify instructions, bundle
  figures/tables refs resolve; byte-determinism across two builds; failure paths —
  no-bundle / unknown-run / deleted-artifact / unknown-format; partial study
  (question-only) honest emptiness).

Full suite: `npm test` → **1454 passed / 4 failed** (4 skipped). The 4 failures
(`tests/file-ingest.test.ts` suite-level, `tests/citation-entries.test.ts` ×3,
`tests/storage-hardening.test.ts` RU-7.3) are **pre-existing at the pristine baseline** —
proven by `git stash push -u` (all lane changes removed) → same 4 tests fail identically
→ `git stash pop` restored. They live in lanes 05/04/13 ownership; not touched here
(rule: never fix another lane's files).

Real-path proof (dist build, real SQLite store, real artifact store, real pandoc):
1. Driver seeded a realistic study (question, 3 sources with REAL content-addressed
   snapshots + one retracted, 3 claims with taint labels, 2 hypotheses, scorecards,
   counter-evidence relation, corpus snapshot) → real `exportStage.execute` →
   `{"kind":"done", ...}` with report+paper+figures+tables artifacts.
2. `node scripts/export-manuscript.mjs run_f86tpdhtg68z9z39bc91bph1f1 --out ...` →
   exit 0: `13 files · paper included · citations: 3 cited inline, 0 unresolved, 0
   uncited · pandoc v3.8.3: produced [docx, jats, html]`.
3. `far verify bnd_tv7rk591rs63kfn0tpjcbc65qn` → **`verdict: verified (11/11 checks
   passed)`** (the bundle-verifier's own fail-closed checks confirm the fixture is
   complete: source snapshots, corpus ref, taint labels).
4. Artifact inspection: package tree (paper.md/docx/jats.xml/html, report.md,
   references.bib, figures/*.svg, tables/*.csv+md, bundle.json, MANIFEST.json,
   ro-crate-metadata.json, README.md); docx `PK\x03\x04` magic; JATS `<!DOCTYPE article
   ... JATS (Z39.96) ... v1.2>` + `<article>` + `ref-list`, no unresolved-key markers
   (the only `?` chars are the question title); html standalone with paper title;
   related-work lines with `identifier resolved=true/false` + `⚠️ retracted`; retracted
   BibTeX `note = {STATUS: RETRACTED — do not cite as ordinary support}`.
5. MANIFEST re-hash (README one-liner) → `MANIFEST OK` exit 0.
6. Script determinism: two `--no-pandoc` builds → `diff -r` empty (byte-identical trees).
   (Pandoc binary outputs may embed tool timestamps; the deterministic core is the
   md/bib/figures/tables/bundle/MANIFEST/RO-Crate set — package.ts pins every timestamp
   to `bundle.createdAt`.)
7. CLI compatibility: `node dist/cli/main.js research export <id> --format report|bundle`
   both still write correct files (exit 0).

## 4. Conflict notes (shared files touched)

- `src/domain/paper-outline.ts` — additive optional schema fields (`retractionStatus`,
  `relatedWork`, `citationKey` ×2). Semantic edit inside lane-07's projection schema;
  handoff note to lane 12 per the stewardship rule (see Deviations).
- `src/domain/provenance.ts` — additive optional `bundle.figures` / `bundle.tables`.
  Same stewardship note. Both changes are backward-compatible (old objects parse;
  `GET /runs/:id/paper` path unchanged — `paperOutlineRef` semantics untouched).
- `src/pipeline/stages/export.ts` — owned file; bundle payload gains two arrays,
  receipt set gains one deterministic-receipt record; `finalArtifactHashes` order
  unchanged ([0]=report, [1]=paper) so lanes 12/03 consumers are unaffected.
- No other lane's files were modified.

## 5. Handoffs

- **Given — 07 → 03** (`handoffs/r2-2026-08-25-07-to-03-cli-package-format.md`): wire
  `far research export --format package` to `src/report/package.ts` (reference impl:
  `scripts/export-manuscript.mjs`). Status: open.
- **Given — 07 → 12 (note, no file request)**: domain schema additions listed above;
  optionally serve figures/tables/package via `GET /runs/:id/*` later (engine refs are
  already in the bundle).
- **Given — 07 → 01 (optional)**: web may render the SVG figures / tables from
  `bundle.figures/tables` refs once an API surface exists.
- **Received:** none.

## 6. Deviations

1. **Branch name**: goal-pack prompt said `ws/r2-scientific-communication/main`;
   BASELINE.md/INTEGRATION_RULES mandate `ws/r2/<nn>-<slug>` (all sibling lanes follow)
   → used `ws/r2/07-scientific-communication`.
2. **`scripts/export-manuscript.mjs`**: `scripts/**` is lane-12's shared area, but the
   ownership table names `scripts/export-public.mjs` as lane-07's — this script is the
   same category (public/export tooling, thin dist entry, no runtime semantics).
   Noted for the Integrator.
3. **Domain edits**: the two additive schema changes in §4 — semantic ownership is
   lane-07's (BP-3 projection + bundle contract), structural stewardship stays 12's.
4. **PDF format**: NOT offered — pandoc PDF requires a LaTeX engine, none installed
   (checked: latexmk/xelatex absent). Honest omission, not a BLOCKED-live item (no API
   involved); docx/jats/html cover the publication-ready path.

## 7. Unverified / out of scope

- Full-pipeline end-to-end (`far research start` → … → export) with a scripted provider:
  orchestrator semantics are lanes 06/08/10; this lane's real-path proof covers the
  export stage + package + verify path against a realistic store (the pipeline's own
  suite covers stage orchestration).
- Web rendering of the new artifacts (lane 01, optional handoff above).
