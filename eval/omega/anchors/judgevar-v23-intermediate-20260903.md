# judge-variance v2.3 intermediate (2026-09-03, qwen3.7-max, passes 7 votes 9, pre-medoid)

Verbatim from the measurement run (background task log, 2026-09-03 22:5x). The
v2.4 verdict run overwrote eval/results/judge-variance-live-R3.json, so this file
preserves the intermediate that isolated the residual flip to crispr.

```
[judge-variance] arg-plasmid-transfer #1: F1=0.000 (agent 9 claims, borderline 9)
[judge-variance] arg-plasmid-transfer #2: F1=0.000 (agent 9 claims, borderline 12)
[judge-variance] arg-plasmid-transfer #3: F1=0.000 (agent 9 claims, borderline 4)
[judge-variance] crc-ici-failure #1: F1=0.625 (agent 8 claims, borderline 10)
[judge-variance] crc-ici-failure #2: F1=0.625 (agent 8 claims, borderline 10)
[judge-variance] crc-ici-failure #3: F1=0.625 (agent 8 claims, borderline 10)
[judge-variance] egfr-tki-resistance #1: F1=0.125 (agent 8 claims, borderline 2)
[judge-variance] egfr-tki-resistance #2: F1=0.125 (agent 8 claims, borderline 2)
[judge-variance] egfr-tki-resistance #3: F1=0.125 (agent 8 claims, borderline 2)
[judge-variance] antibiotic-cdiff #1: F1=0.000 (agent 6 claims, borderline 7)
[judge-variance] antibiotic-cdiff #2: F1=0.000 (agent 6 claims, borderline 7)
[judge-variance] antibiotic-cdiff #3: F1=0.000 (agent 6 claims, borderline 7)
[judge-variance] crispr-offtarget #1: F1=0.267 (agent 5 claims, borderline 5)
[judge-variance] crispr-offtarget #2: F1=0.267 (agent 5 claims, borderline 5)
[judge-variance] crispr-offtarget #3: F1=0.000 (agent 5 claims, borderline 5)
summary: worstTaskSwing 0.267, allUnderTarget015 false
```

Preceding same-route baseline (first R3 run, v2.2 params passes 5 votes 5, task
ba27wmamb log .control/omega-judgevar-max.log): arg 0/0/0, crc 0.625/0.556/0.429
(swing 0.196), egfr 0.125×3, cdiff 0/0/0, crispr 0/0.2/0 (swing 0.2) — worst 0.2.

Diagnostic that isolated the crispr root cause (.control/tmp-crispr-diag.mjs,
3× judgeRediscovery over the SAME frozen text): decomposition content stable
(same 5 claims ×3), votes consistent (9-0 / 9-0 / majority 6-3) — the flip lived
in WHICH equal-count pass medianPass selected, i.e. a content lottery, not in
decomposition sampling or vote noise.
