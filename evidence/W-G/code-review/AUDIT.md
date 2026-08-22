# Wave-G WP2 · Adversarial Re-Audit of the Fix Batch

Auditor: independent Explore agent (2026-08-22), re-reviewed every fix claim against the actual
working tree (not the diff alone), including a collateral sweep (unused imports, broken exports,
behavior changes beyond intent, type-safety, error swallowing).

## Verdict: CONDITIONAL PASS → resolved to PASS

- 8 of 9 fix areas: PASS (persistence, orchestrator, artifacts, sources, pipeline stages,
  domain, eval, tests) — every sub-claim verified at file:line.
- 1 CONCERN → **auditor was RIGHT and this was the audit's value**: the json-repair parseString
  depth bound was claimed in the report but ABSENT from the tree. Root cause (process, not
  fabrication): during the MUT-1 mutation spot-check I reverted the injected mutation with
  `git checkout -- src/providers/json-repair.ts`, which ALSO wiped the still-uncommitted original
  fix in that file. Lesson recorded: mutation reverts must be forward-edits, never git-checkout
  of files carrying uncommitted fixes.
- Resolution: depth bound re-applied (signature + `depth > 20` guard + all 3 recursion sites,
  rg-verified) and re-validated: typecheck clean; the 74-case jsonrepair oracle suite and the
  WP2 regression battery pass (76/76 in the combined run).
- The auditor also correctly noted the test comment referenced the (then-missing) bound — now
  accurate again.
- Auditor's accepted-risk note on domain schema tightening (no data-migration for hypothetical
  pre-branded scorecard ids): verified non-issue — real stored runs in .far-run/far.db use
  newId-generated `sc_`/`trn_` ids (sampled 2026-08-22); only TEST fixtures carried placeholder
  strings, and those were fixed in the same batch.

## Residual (unchanged from REVIEW.md §4/§6)
Queued parallel-zone fixes (api.ts / cli / web) + backlog items (verify arxiv fallback, CJK
tokenization, mlr-bench presentation) remain recorded in REVIEW.md.
