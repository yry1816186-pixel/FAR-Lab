# R2 Lane Report — 05 multimodal-ingest

Round R2 (baseline `baseline/parallel-r2` = 47cc373). Lane owner contract:
`src/ingest/**` + `src/sources/{fulltext,text,snapshot}.ts`. This report covers
BOTH sessions of the lane on this lineage: the initial landing (fb2c2ed) and
the continuation (bd1944c), both on `build/hx-reconstruction`.

## 1. Commits (lane branch lineage)

| SHA | Subject | Scope |
|---|---|---|
| `fb2c2ed` | feat(ingest): multimodal scientific-understanding backend (SDM + parsers) | SDM-1 zod contract; JATS/TEI/LaTeXML/markdown/LaTeX/pdf-text-layer parsers; dataset dsdp-1; notebook/code scan; POST /api/v1/ingest; `far ingest` CLI; web thin collector; 105 tests incl. real-PDF E2E (jss_metafor.pdf, 48pp) |
| `bd1944c` | feat(ingest): fulltext SDM wiring + xlsx supplements + GET-by-ref + CJK fidelity | continuation — see §2 |

Lane docs: `.planning/handoffs/MULTIMODAL.md` (HCI contract, updated in bd1944c).
Supporting evidence (salvaged from the ignored `work/` dir): the three
`05-multimodal-ingest-support-*.md` files next to this report (audit baseline,
tooling research incl. license adjudication, benchmark).

## 2. What bd1944c added (each claim has a command in §3)

1. **Network fulltext → SDM wiring** — `FullTextFetch.sdm` on every `fetched`
   result (arxiv_html→LaTeXML, europepmc_jats→JATS, openalex_tei→GROBID TEI).
   Legacy `text` stays byte-identical; the tables the regex route always
   DROPPED are recovered in the SDM grid. Persistence on corpus documents is
   handed off (05→04, exact one-block patch proposed).
2. **LaTeXML real-page hardening (defect found by the wiring test)** — real
   arXiv pages start with `<!DOCTYPE html>` and carry script/style CDATA;
   `parseXml` rejected the doctype, so every REAL page would have produced a
   `failed` SDM while hand-written fixtures passed. Fixed by stripping
   doctype+script/style before element parsing (non-structural, same
   precedent as the regex extractor).
3. **XLSX supplement understanding (dsdp-1, zero new deps)** — minimal ZIP
   reader (EOCD/central-dir/local-header, store+deflate via node:zlib,
   zip-bomb caps, zip64/odd-methods refused by name) + SheetML cell model
   (shared/rich/inline strings, bool, error cells preserved as literals with
   a warning, cell gaps, row-number gaps, multi-sheet honesty). CLI reads
   bytes; API gains `kind:'bytes'` (base64). Dataset core extracted to
   `profileRows` so csv/tsv/xlsx profile identically (format enum +`xlsx`,
   `delimiter` now optional).
4. **GET /api/v1/ingest/:ref** — fetch-by-ref contract for HCI: full stored
   SDM (`kind:'sdm'`) or dataset profile (`kind:'dataset_profile'`), zod
   re-validated on read; 404 for non-ingest refs, 400 for malformed refs.
5. **CJK/mixed-language fidelity (three real defects, each test-locked)** —
   (a) pdf-text route normalized 图/表 captions to English labels, erasing the
   document's language → printed prefix kept verbatim; (b) panel markers
   didn't accept full-width punctuation boundaries (。，、；); (c) `\b` never
   holds adjacent to CJK, so mid-sentence 图 N / 表 N / 式 (N) cross-refs
   silently never matched → replaced with a Latin-alnum negative lookbehind
   (equivalent for Latin, correct for CJK). Plus: pdf-text forward references
   (mention before caption) get a second resolution pass against the final
   record pools.
6. **Stress + coverage honesty closures** — 150k-row CSV profile verified
   (types/stats), 200k row-cap fires honestly; mixed-language payload E2E
   (synthetic geometry — see §6 for the not-claimed part).

## 3. Evidence (commands + exit codes + key output; all run 2026-08-24)

| Claim | Command | Result |
|---|---|---|
| Lane suite green (worktree) | `npx vitest run tests/ingest-*.test.ts tests/sources-fulltext.test.ts` | **13 files / 160 tests passed** (was 105 at fb2c2ed) |
| Staged tree = exactly what was committed | export via `git checkout-index -a -f` → `npx tsc -p tsconfig.json --noEmit` → same suite | **tsc exit 0; 160/160** (needs web/node_modules junction for pdfjs-dist — environment, not code) |
| Root typecheck + build (worktree incl. sibling code) | `npm run typecheck && npm run build` | both exit 0 |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | exit 0 (PASS) |
| CLI live: xlsx happy path | `node dist/cli/main.js ingest tests/fixtures/sample.xlsx` | **exit 0**; `sample.xlsx: dataset profile — 2 rows × 3 cols (xlsx)`, typed columns, `artifact: sha256:595add…` |
| CLI live: honest refusals | `… ingest tests/fixtures/sample.txt` / `sample.pdf` | **exit 2** both, reason strings name the format matrix / PDF-web-client reason |
| API bytes+xlsx E2E + GET round-trip | `tests/ingest-api.test.ts` | 11/11 (real sample.xlsx through base64 → 200 dataset_profile → GET-by-ref round-trip) |
| fulltext→SDM persistence contract | `tests/sources-fulltext.test.ts` "fulltext fetch SDM wiring" | 4/4: per-route zod-valid SDM, network origin+license, text unchanged while table grid recovered, content-addressed round-trip through a real artifact store |
| Real-paper E2E (from fb2c2ed, still green) | `tests/ingest-pdf-e2e.test.ts` | jss_metafor.pdf 48pp: 338 blocks / 11 figs / 8 tabs / xrefs; scanned-PDF honest failure |

## 4. Conflict notes (shared files)

- `src/server/api.ts`, `src/cli/main.ts`: edited while a sibling session had
  unstaged in-flight hunks (time-travel `inspect` command + api `state-at`
  route + observability). Committed via **anchor-surgery staging** (staged
  blob = HEAD + lane edits only, constructed from unique anchors, not hunk
  filtering — hunk filtering merges adjacent sibling hunks and was rejected).
  Verified split after commit: `git diff --cached` (pre-commit) = lane edits
  only; post-commit `git status` shows the sibling hunks still present and
  unstaged in exactly their original shape (api +23 / main +29−2 lines).
- `src/persistence/store.ts`: sibling-owned, never touched.
- No other lane's files modified. Route additions in api.ts are lane-05
  surface registered in lane-12's file (same precedent as fb2c2ed).

## 5. Handoffs

- **05→04 (OPEN)**: persist `res.fetch.sdm` in the evidence deepening loop +
  `fullTextSdmRef` on SourceDocument — exact patch in
  `.planning/concurrency/handoffs/r2-2026-08-24-05-04-fulltext-sdm-persistence.md`.
- **05→01 (OPEN)**: port `web/src/utils/ingest.ts` to API calls (server
  boundary authoritative; docx/pptx have NO server route — client must label
  or drop, not pretend parity) —
  `.planning/concurrency/handoffs/r2-2026-08-24-05-01-ingest-stopgap-port.md`.
- Received: none.

## 6. Deviations, blockers, unverified claims

- **Deviation from worktree protocol**: the lane did NOT branch a fresh
  `ws/r2/05-multimodal-ingest` worktree from `baseline/parallel-r2`. The
  lane's first session landed directly on `build/hx-reconstruction` (fb2c2ed)
  — a residue the R2 BASELINE truth table itself records ("in-flight
  src/ingest/** … port/fuse, do not reimplement"). The continuation stayed on
  that lineage: forking from the planning-only R2 tag would have produced a
  SECOND ingest engine without fb2c2ed's context, violating the
  no-duplicate-engine rule the worktree rule exists to protect. The
  Integrator fuses `build/hx-reconstruction` per the residue table.
- **BLOCKED-live** (2026-08-23 no-live-API directive): T4 VLM figure
  perception (schema reserved, `perception.status='not_extracted'` enforced);
  fulltext→SDM against REAL arXiv/EPMC/OpenAlex payloads (validated on
  fixtures shaped from the exact producer schemas incl. the real-page
  doctype/script findings; live corpus proof deferred with the credential).
- **Not claimed**: real mixed-language PDF E2E — the collector is a web-client
  pdfjs capability; the mixed-language proof is a synthetic-geometry
  payload through the full deterministic core (labeled as such in the test).
  Real scanned-PDF OCR: refused honestly (`no_text_layer`), OCR tier not
  adopted (no clean-license offline OCR; see support-research-tooling.md).
- License adjudication (read from repo LICENSE files, fb2c2ed session):
  Docling MIT (future sidecar candidate) / MinerU Apache-2.0+terms /
  **Marker GPL-3.0 REFUSED** / **PyMuPDF AGPL REFUSED**. zod-only core
  invariant intact (XLSX adds zero runtime deps).

## 7. Saturation statement

Remaining lane ideas are either BLOCKED-live (T4 VLM, live corpus), owned by
other lanes (retrieval ranking 04, upload UX 01, evidence persistence 04), or
below the material bar (more format collectors for their own sake). The lane
considers itself at **material improvement saturation** for the deterministic
tier on this lineage.
