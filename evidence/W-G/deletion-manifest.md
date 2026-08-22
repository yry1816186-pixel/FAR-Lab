# Wave-G WP1 · Deletion Manifest & Full-Repo File Classification

Date: 2026-08-22 · Branch: build/ev2-closeout · Decision record: D-063
Method: per-file classification (core/test/docs/evidence-keep/deletable) + triple reference check
(`rg` whole-repo basename scan incl. `.control/`, `evidence/`, `research/`, README; README/evidence-index
reference check; control-plane reference check), cross-verified by an independent Explore subagent sweep
(exhaustive over `eval/results/` + `spikes/`) with main-agent adjudication of every candidate.

## 1. Classification summary (513 tracked files at manifest time)

| Category | Scope | Count (approx) | Action |
|---|---|---|---|
| Core source | `src/**` (domain, pipeline stages, sources, providers, persistence, app, server, cli, shared), `web/src/**`, `eval/*.mjs`, `zcode-harness/**`, `scripts/*.mjs`, configs | 236 | KEEP (dead-code-within-src is WP2's scope, not file deletion) |
| Tests | `tests/**` (24 files), `web/TESTING.md` | 25 | KEEP |
| Canonical docs | `README.md`, `AGENTS.md`, `project-spec/**` (19), `START_HERE.md`, `HANDOFF_PROMPT.md` (referenced by `_COMMON-BASELINE.md` recovery order), `FINAL_BUILD_PROMPT.md`, `FAR-Lab_DEVELOPMENT_MISSION.md` (supreme directive), `BUNDLE_MANIFEST.json` (runtime manifest), `final_delivery.md` (formal delivery report, referenced by README/FINAL_BUILD_PROMPT/wave-p1 prompt) | 30 | KEEP |
| Evidence & decision fact system | `evidence/**` (all waves), `.control/**`, `research/**` (SCOUTs, wave reports, registries, WAVE-PROMPTS, reference baseline + models-dev catalog referenced by README/providers/fetcher) | 222 | KEEP (constitution §2: this IS the project's fact system) |
| Probe/receipt pairs in `spikes/` | probe script + output receipt pairs documenting recorded decisions (route probes cited by BLOCKERS/D-059/D-061/D-062; relation-precision receipts cited by CP-W3-1; sqlite-spike cited by W0 report; source-spike results cited by W0 report line 5; ndcg oracle trio: pytrec.py generates the consumed `ndcg-oracle-pytrec.jsonl`, compare.mjs consumes it; `trectools.py` = artifact of the registry-recorded "evaluated-first-then-rejected" oracle decision) | 26 | KEEP (receipt-pair convention — generator script stays with its cited output) |
| Active workflow inputs | `eval/claim-pair-gold-pending.jsonl` (consumed by gen/annotate-pair-gold.mjs), `eval/counter-evidence-regression.json` (self-declared future regression guard: "Run against any improved labeling after live routes return", D-057) | 2 | KEEP (future value, not orphans) |
| Deletable | see §2 | 2 tracked + 4 untracked/ignored + 1 empty dir | DELETE (this manifest is the pre-deletion record) |

## 2. Deletions executed after this manifest

| # | Path | Size | Class | Reference check | Rationale |
|---|---|---|---|---|---|
| 1 | `eval/results/judge-variance-live-R1.json` | ~1KB | untracked failed-attempt shell | rg: none (D-062 records the attempt class) | `mode=live`, `tasksMeasured: 0`, all repeats died `deepseek: HTTP 402 Insufficient Balance` (judgeRoute was still deepseek). Zero measurement content; attempt class already recorded in D-062. |
| 2 | `eval/results/judge-variance-live-R3.json` | ~1KB | untracked failed-attempt shell | rg: none | Same as #1. |
| 3 | `spikes/_tmp-run-probe.mjs` | ~100B | untracked tmp one-liner | rg: none | 3-line temp wrapper (`_tmp` prefix) from the interrupted session. |
| 4 | `eval/results/metrics-ev1.stderr.log` | 169B | ignored (`*.log`) stray | rg: none | stderr capture stray beside the cited `metrics-ev1.json`/`-stdout.txt` (both referenced by evidence/W-EV1). |
| 5 | `spikes/output/strict-fc-args-sample.json` | 13.2KB | tracked, zero-ref intermediate | rg `strict-fc-args-sample` (matches both singular+plural), `args-sample` broader: zero hits outside the two files themselves | Superseded intermediate captures from strict-FC debugging; the load-bearing strict-FC receipts (`strict-fc-shape-probe.json`, `strict-fc-null-probe.json`, `strict-fc-corrupted-args.json`) remain and are referenced by the strict-FC evidence chain (D-026/D-029/D-030). |
| 6 | `spikes/output/strict-fc-args-samples.json` | 920B | tracked, zero-ref intermediate | same as #5 | Same as #5. |
| 7 | `artifacts/` (empty directory) | 0 | untracked empty dir | rg `'artifacts'` in src/eval/scripts: all hits resolve to `<dataDir>/artifacts` (inside `.far-run/`), never repo-root `artifacts/` | Stray empty dir; no code path writes to repo-root `artifacts/`. |

Git history is NOT rewritten (red line): all tracked deletions remain recoverable from history; this
manifest + D-063 are the audit record.

## 3. Adjudication log — candidates REJECTED for deletion (kept, with reasons)

Independent-sweep candidates that failed the future-value/reference test for deletion:

1. `eval/results/rediscovery-v1-degraded-runs.jsonl` — `-runs.jsonl` raw-run companion of the REFERENCED
   `rediscovery-v1-degraded.jsonl` (judged records). Companion-pair convention (same shape as
   `rediscovery.jsonl` + `-runs.jsonl`); deleting the raw half weakens reproducibility of the cited half.
2. `spikes/arxiv-variant-relevance.mjs` — generator of `spikes/output/arxiv-variant-relevance.json`, which
   IS cited by `evidence/W6/fusion-f1-f5.md` + `research/WAVE6-SCOUT.md`. Receipt pair.
3. `spikes/probe-bigmodel-protocols.mjs` — protocol-variant probe (openai-compat vs anthropic vs bearer)
   backing the D-061/D-062 route conclusions; deliberately committed in D-062.
4. `spikes/strict-fc-null-probe.mjs` — generator of referenced `strict-fc-null-probe.json`. Receipt pair.
5. `spikes/zai-endpoint-probe.mjs` + `spikes/output/zai-zai-endpoint-probe.json` — probe pair; the output is
   cited verbatim in D-062 ("receipt spikes/output/zai-zai-endpoint-probe.json"). (The independent sweep
   missed the DECISIONS citation; corrected on main-agent re-check.)
6. `spikes/source-spike/results/{arxiv,crossref,openalex}-latest.json` — explicitly referenced by
   `evidence/W0/source-spike-report.md:5` (brace-expansion reference the sweep's basename matching missed).
7. `eval/counter-evidence-regression.json` — self-declared future regression guard (D-057); its consumer
   arrives when live routes return (pooled live queue). Future value = keep.
8. `spikes/ndcg-oracle-trectools.py` — artifact of the registry-recorded "trectools evaluated as oracle
   first, rejected (external dependency)" decision (research/TECH_CANDIDATES.md:174); deleting erases the
   evaluation trace.
9. All root docs (START_HERE / HANDOFF_PROMPT / FINAL_BUILD_PROMPT / MISSION / BUNDLE_MANIFEST /
   final_delivery) — each referenced (recovery order, constitution §1, README, wave-p1 prompt).

## 4. Hygiene actions in the same batch

- `secret-scan.mjs`: was FAILED (7 HIGH) on documented synthetic redaction-test vectors quoted verbatim in
  `evidence/W-H4/fusion-f1-f3-f4.md` + `research/wave4-reports/deep-secret-redaction.md`. Root-cause fix:
  exact-substring allowlist (`ALLOWED_SYNTHETIC_SUBSTRINGS`, byte-exact matches only — no regex weakening),
  PEM entry built by concatenation so the scanner never self-flags. **Real defect fixed in the same pass**:
  the `openai-style-key` pattern did not match `sk-proj-…`/`sk-ant-api03-…` (real OpenAI/Anthropic key
  prefixes) — pattern widened; verified by canary files (sk-proj-style + plain-sk-style canaries both HIGH;
  AWS pattern proven by the pre-fix AKIAIOSFODNN7EXAMPLE hit). Post-fix: `PASS`, exit 0, 0 HIGH
  (40 MEDIUM informational test-fixture assignments — non-blocking by design).
- `.gitignore`: added `.ruff_cache/` explicitly (was only self-ignored by ruff's internal `.gitignore`).
- `path-hygiene.mjs`: PASS (exit 0) before and after.

## 5. Post-deletion gate

Recorded in D-063 after execution: typecheck 0 / eslint 0 / vitest green (count at run time) / build 0 /
secret-scan PASS / path-hygiene PASS. Any red ⇒ deletion reverted, manifest updated.
