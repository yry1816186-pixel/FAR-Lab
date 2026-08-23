# RU-6 SCISOFT — Research Packet (2026-08-24, SEARCH_SATURATED)

Agent-produced, main-Agent adjudicated. Status: SOURCE_VERIFIED (primary-source
level for all decision-changing facts; see UNVERIFIED list).

## Verdict table
| Lead | Key primary-source facts | Verdict |
|---|---|---|
| Crossref retraction monitoring | update-to field + update-type:retraction filter, source publisher/retraction-watch; RW CSV on gitlab.com/crossref/retraction-watch-data (weekdaily), PMID fallback; RetractionNature taxonomy (Retraction/Correction/EoC/Reinstatement) | **ADOPT** — corpus-trust gate |
| PRISMA/EQUATOR | no API/ontology; PRISMA2020 is an R/Shiny diagram tool; machine-readable checklist waits for PRISMA 2026 | **EXTRACT** (self-built JSON count schema, pipeline-derived counts only) |
| OSF Registries API | v2 draft_registrations POST exists; project-direct registration deprecated 2026-11; embargo ≤4y | **DEFER** (user token + 1.5d slack) |
| PROSPERO/CT.gov | CT.gov API v2 complete keyless; PROSPERO no API; both clinical-domain (≈0 ML-corpus coverage) | **DEFER** |
| scite vs COCI | per-citation classification only via scite (1.4B statements) — enterprise-only, proprietary; COCI is CC0 metadata-only | **REJECT** (internal 11-relation blind judging already covers the capability) |
| statcheck/GRIM/SPRITE | statcheck v1.5.0 GPL-3 (regex APA stats → recompute p); GRIM/GRIMMER in scrutiny (Allard 2018), SPRITE in rsprite2; all deterministic arithmetic | **ADAPT** (clean-room TS; statcheck-class p-recompute deferred — needs incomplete beta) |
| CiTO/SPAR | CiTO v2.8: 41 cito:cites subproperties incl. supports/confirms/contradicts/refutes/citesAsEvidence; stable IRIs | **ADOPT** (static mapping) |
| Croissant/Datasheets | spec 1.0 JSON-LD; OpenML native (400k+ datasets) | **DEFER** (no trigger — sources still OpenML-only) |
| DAGitty/E-value | dagitty R GPL-2; EValue = closed-form E=RR+sqrt(RR(RR-1)) (VanderWeele-Ding 2017), pure arithmetic | **EXTRACT** (E-value first; DAG part deferred) |
| webR/NMA | webR v0.6.0 self-hostable offline; metafor WASM binary availability UNVERIFIED | **DEFER** (post-competition) |

## GO list (gain/cost-ranked; deadline 2026-09-05)
1. **Retraction/correction corpus-trust gate**: crossref adapter reads resolved
   works' update-to/relation; verify.ts flags retraction/correction/EoC;
   GRADE-lite downgrade rule; claims stage forced demotion. (~0.5d)
2. **CiTO relation mapping**: static 11→CiTO IRI table (unmapped → cito:cites +
   extension note); CiTO IRIs ride SWAN JSON-LD relations; bundle verify gains
   the every-relation-has-CiTO check. (~0.5d)
3. **PRISMA-2020 flow-count self-report**: counts derived from real pipeline
   stage states (never hand-entered) + 27-item checklist JSON snapshot into the
   bundle. (~1d)
4. **GRIM/GRIMMER + E-value deterministic forensics**: pure TS, zero deps; runs
   on verbatim statistics extracted at claims stage; results into certainty
   metadata. (~1-1.5d)

## DEFER triggers
OSF (user token + slack → plan-bundle deposit, DOI/timestamp into PROV-O);
webR/metafor (verify WASM binary in r-wasm repo first); Croissant (source
expansion beyond OpenML); statcheck p-recompute (incomplete-beta function
port); DAGitty adjustment sets (post-competition).

## UNVERIFIED
RW CSV license (CC-BY 4.0 footer vs legacy CC0 statement — check GitLab LICENSE
before bulk redistribution; API-field consumption unaffected); scrutiny/EValue
CRAN licenses (clean-room unaffected); webR npm license; metafor WASM binary;
scite enterprise pricing; OSF POST payload details end-to-end; PRISMA 2026
format (CASRAI secondary); Croissant spec license (secondary, Apache-2.0).

Sources: crossref.org/documentation/retrieve-metadata/retraction-watch ·
gitlab.com/crossref/retraction-watch-data · cran.r-project.org/package=statcheck
(PMC7540394) · sparontologies.github.io/cito/current/cito.html ·
github.com/prisma-flowdiagram/PRISMA2020 · help.osf.io/article/744 ·
clinicaltrials.gov/data-api/api · scite.ai/pricing · opencitations.net ·
docs.mlcommons.org/croissant/docs/croissant-spec-1-0.html ·
cran.r-project.org/package=dagitty · github.com/cran/EValue ·
opensource.posit.co/blog/2026-06-18_webr-0-6-0 (full list in packet log).
