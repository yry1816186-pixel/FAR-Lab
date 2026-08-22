# Wave-6 Scout · markrussinovich/refchecker (main-agent read)

MIT (LICENSE verified; expansion-scan probe 200). Read by main agent. Reference-validation
product using the SAME keyless scholarly stack as FAR-Lab (Crossref/S2/OpenAlex/arXiv/DBLP/ACL).
Focus: wrong-paper detection + verification flow — direct leverage on verify-quality.

## Mechanisms (file:line → src/refchecker/…)

| # | mechanism | source | what it does | value for FAR-Lab | cost | risk | FAR-Lab mapping |
|---|---|---|---|---|---|---|---|
| 1 | multi-signal wrong-paper-match detector | checkers/enhanced_hybrid_checker.py:687-870 (`_is_wrong_paper_match`) | Rejects a resolved match as WRONG PAPER when: zero surname overlap AND (year-gap≥5 OR short generic cited title ≤3 tokens OR year-gap≥2+venue mismatch); or short title + ≥3× length ratio + venue mismatch (:839-868). Identifier-anchored matches (DOI/arXiv/PMID) are exempt (:714-748) | Direct upgrade path for verify.ts's titleJaccard-only gate (currently a title-similar-but-different-paper resolve passes) — eliminates a real false-resolve class | small (deterministic TS port of 4 rules) | over-rejection risk → keep conservative defaults, surface as verification detail not silent reject | partial (title Jaccard 0.6 only; no author/year/venue signals) |
| 2 | surname normalization + overlap set | enhanced_hybrid_checker.py:779-813 | Diacritic-normalized surnames (drop ≤3-char initials), set intersection as author-overlap signal | Deterministic, no deps | small | none | missing |
| 3 | conservative venue compatibility | enhanced_hybrid_checker.py:872-913 | exact/substring/NLM-abbreviation venue match; missing venue = compatible (never reject on absent data) | Reusable conservative-compat pattern | small | abbreviation table is theirs (skip; substring+exact enough for v1) | n.a. today |
| 4 | verifier cascade with authoritative anchoring | enhanced_hybrid_checker.py:439-567 (`_try_api`), arXiv+SS parallel (:963-1033), non-arXiv parallel (:1081-1206) | DOI-anchored refs try DOI APIs first; results merged; local-DB misses are authoritative-negative | We already resolve DOI→crossref, arXiv→arxiv; their cascade adds S2 merge — S2AG evidence-gated (deferred, keep) | — | — | have (simpler, honest) |
| 5 | arXiv fielded boolean title search | checkers/arxiv_citation.py:162-202 (`all:term AND …`, max_results=5) | Works for SPECIFIC-paper lookup (5-8 title terms) | Confirms our arxiv.ts:168 syntax is right; our zero-result problem is long-phrase AND-intersection, not syntax | — | — | have |
| 6 | title match scoring + author cross-check on title matches | arxiv_citation.py:537-653 (`_calculate_match_score`, `_compare_info_match`) | Score for title-search matches incl. author compare | Same family as #1 | small | — | missing |
| 7 | retraction detection | backend/retraction.py, checkers/… | Retraction status surfaces | Out of scope this wave (no keyless retraction API in our stack; note as future registry B item) | — | API/keyed | missing (deferred) |

## Verdict

**Fuse #1+#2 (+ #3 substring variant) into `src/pipeline/stages/verify.ts`**: after a resolved
match, run the deterministic wrong-paper guard — identifier-anchored resolves exempt; otherwise
title-Jaccard stays AND new checks: zero-surname-overlap with year-gap≥5 / short-generic-title /
year-gap≥2+venue-mismatch downgrade `resolved:true` to a visible `wrongPaperSuspect` style detail
(keep resolved but flag; do NOT silently flip verification — conservative direction per their own
"when in doubt, don't reject"). This hardens the verify-rate quality axis (north-star owner W6)
deterministically — unit-testable offline today, live effect measured when routes return.
