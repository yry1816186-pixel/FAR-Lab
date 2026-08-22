# RankGPT Source Detail (Wave-6 scout, deep-read)

- Source: `C:\Users\RichardYuan\Desktop\new\.cache\repos\RankGPT` (upstream `sunnweiwei/RankGPT`, Apache-2.0). Snapshot: `.extracted` marker present (no nested git history); README news latest entry 2023.12.10 (EMNLP 2023 Outstanding Paper, arXiv:2304.09542).
- Files read in full: `rank_gpt.py` (286 lines, entire inference core), `run_evaluation.py`, `trec_eval.py`, `pointwise.py`, `specialization.py`, `rank_loss.py`, `InstructDistill/instruction_distill.py`, `InstructDistill/pairwise_ranking.py`, `README.md`, `NovelEval/README.md`. Upstream code treated as data; nothing executed.
- All line numbers verified against the local snapshot in this session.

## Master table (mechanism | file:line | what | port value | cost | moot-given-strict-FC?)

| Mechanism | file:line | What | Port value for FAR-Lab | Cost | Moot given strict-FC? |
|---|---|---|---|---|---|
| Sliding window | rank_gpt.py:234-244 | Bottom-up windows, w=20/s=10 over top-100; top window ranked last; overlap w-s=10 stitches via positional inheritance | **High** — the scaling mechanism for pools > 24 | k calls: ceil((n-w)/s)+1 (9 for n=100,w=20,s=10) | No — orthogonal to output transport |
| Window defaults | rank_gpt.py:234; run_evaluation.py:89-90,122-123 | rank_start=0, rank_end=100, window_size=20, step=10; BM25 k=100 | Medium — reference point; our analogue w=24/s=12 | — | No |
| Window edge case | rank_gpt.py:238-239 | If window_size > n: start_pos = n-w < rank_start → **loop never runs, silent no-rerank** | High — port must handle n<=w with a single full-window call | 0 | No — our variant must not inherit this silent skip |
| Per-window renumbering | rank_gpt.py:162-164,170-171 | Identifiers [1..n] restart per window, not global | Medium — keep if we add windows | 0 | No |
| Pre-shuffle | — (verified absent) | No shuffle/seed anywhere in inference path (`rg shuffle\|random\|seed` → only specialization.py:125, a training DataLoader) | None — pre-shuffle is a FAR-Lab original, not a RankGPT port; conflicts with window chaining which relies on current-order presentation | — | — |
| Permutation probability / PDL | rank_gpt.py — absent; training-only in rank_loss.py:9-212 | No inference-time probability machinery; permutation is ordinal-only | None for inference | — | Yes (n/a) |
| Distillation labels | specialization.py:145; instruction_distill.py:201 | y_true[i]=1/(i+1) position-derived grades; GPT-3.5 permutations supervise cross-encoder | Low — precedent for our graded relevance as ordinal, not calibrated | — | Partly — our graded labels are richer; treat as ordinal |
| Pointwise logprob trick | pointwise.py:33-84 | Yes/No answer-token logprob → rel = -1/logprob (Yes) / +1/logprob (No); top-5 logprob fallback; else -1e6 | Low — separate pointwise mode, not listwise | 1 call per passage | Yes for our listwise path |
| Token budget | rank_gpt.py:159,169 | None beyond per-passage 300-word cut (`' '.join(content.split()[:300])`); no tokenizer arithmetic anywhere | None to port — any budget arithmetic we build is net-new | — | — |
| Over-budget fallback | rank_gpt.py:29-31 + 209-223 | `'ERROR::reduce_length'` sentinel never checked → digit-stripped to empty → all ids appended in input order = **silent identity no-op** | Negative — do not replicate; we need explicit budget + fail-visible | 0 | No — our strict-FC throws instead; keep that |
| Retry policy | rank_gpt.py:23-32 | Infinite while-True retry, 0.1 s sleep, timeout=30 | Negative — port bounded retry instead | — | — |
| Output transport | rank_gpt.py:151-152,190-198 | Free text `[2] > [1] > [10]`; parser strips non-digits to spaces | None | — | **Yes** — structured validated permutation strictly stronger |
| Output repair chain | rank_gpt.py:210-216 | dedupe keep-first → drop out-of-range → append omitted at window bottom in input order | Medium — "fail-open partial acceptance" tier between our throw and upstream identity | 0 | Partly — schema already enforces completeness; partial-accept tier is still a design option |
| Rank/score semantics | rank_gpt.py:219-222 | After permutation, `rank`/`score` fields overwritten with **positional** values from cut_range[j] — metadata follows position, not document; no calibrated score produced | Medium — confirms permutations are ordinal-only; our graded relevance must not be presented as calibrated | 0 | No — semantic contract worth copying |
| Prompt format (ping-pong) | rank_gpt.py:143-148,151-152,170-171 | Multi-turn: system + user intro + assistant ack + per-passage user turn `[k] content` + synthetic assistant ack `Received passage [k].` + post prompt repeating query | Low — 2023 gpt-3.5 identifier-anchoring hack | 2 extra turns per passage | **Yes** — single-message structured output needs none of it |
| Candidate fields | rank_gpt.py:112-120,163-171 | Only `content`: `'Title: {t} Content: {x}'` joined at retrieval, whitespace-normalized, 300-word cut; no year/venue/score metadata | Low — our title+year+venue+450-char abstract+purposes is already richer | — | — |
| temperature | rank_gpt.py:186 | temperature=0 for determinism | Medium — verify our rerank call matches | 0 | No |
| nDCG eval | trec_eval.py:9-43,142-158 | pytrec_eval; benchmark k_values=(1,5,10) (trec_eval.py:156); runfile `{qid} Q0 {docid} {rank} {score} rank` (rank_gpt.py:247-255) | Medium — standard harness if we ever need IR-style eval | 0 | — |
| Ensemble/calibration | — (verified absent) | No ensembles, no aggregation across permutations, single pass | None | — | — |

## 1. Sliding-window algorithm (rank_gpt.py:234-244, complete)

```python
def sliding_windows(item=None, rank_start=0, rank_end=100, window_size=20, step=10, ...):
    item = copy.deepcopy(item)
    end_pos = rank_end
    start_pos = rank_end - window_size
    while start_pos >= rank_start:
        start_pos = max(start_pos, rank_start)
        item = permutation_pipeline(item, start_pos, end_pos, ...)
        end_pos = end_pos - step
        start_pos = start_pos - step
    return item
```

- Defaults w=20/s=10/rank 0-100 (rank_gpt.py:234), used verbatim in benchmarks (run_evaluation.py:89-90, 122-123; README:108). 100 is the candidate count (`run_retriever(..., k=100)`, run_evaluation.py:81), never a window size.
- Direction bottom-up: first call permutes the last window `[80,100)`; each iteration shifts both ends up by step; final call is `[0,20)` — the top window is ranked **last**, with maximal context of already-promoted items. Trace: `[80,100)→[70,90)→…→[10,30)→[0,20)` = 9 LLM calls; formula ceil((n-w)/s)+1.
- Stitching via overlap w-s=10: the top of window k's output sits inside window k+1's input; a doc can cascade from index 99 to 0 across the chain. Windows are strictly sequential, sharing state through the deep-copied mutated `item` (copy at :236; hits outside [rank_start, rank_end) never touched).
- No global consistency enforcement: each call is an independent permutation of its slice; the only cross-window contract is positional inheritance; repair is per-window (:212-216).
- Edge cases: `start_pos = max(start_pos, rank_start)` (:240) makes the top window ≤ w (never larger). But if w > n, `start_pos = n - w < rank_start` → loop body never executes → **no rerank at all, silently** (:238-239). A port must special-case n ≤ w into one full-window call.

## 2. Pre-shuffle: verified negative

`rg -i "shuffle|random|seed"` over all Python: single hit `specialization.py:125` (training DataLoader). No random import in rank_gpt.py (imports only copy/tqdm/time/json, :1-4). Candidates are always presented in current rank order (BM25 initially, then previous window's output). Upstream position-bias mitigation is implicit only: per-passage identifier anchoring via ping-pong turns (:170-171) and re-evaluating the same items at different positions across overlapping windows. If FAR-Lab adds pre-shuffle, it is net-new relative to this source and should be labeled and evaluated as such; note it conflicts with window chaining (chaining depends on presenting the promoted order).

## 3. Permutation probability (PDL): absent at inference

No softmax-permutation computation in any inference file. The paper's permutation-probability machinery materializes only as training losses for InstructDistill/specialization: RankLoss family (rank_loss.py:9-212: softmax_ce, pointwise_rmse/bce, list_net, rank_net, lambda_loss with NDCG weighting schemes) over y_true[i]=1/(i+1) positional grades (specialization.py:145, instruction_distill.py:201), supervised by 100K pre-computed ChatGPT permutations (README:17). Listwise inference output is ordinal-only.

## 4. Token budget: verified absent

No tiktoken, no token counting, no prompt arithmetic anywhere. Budget control = (a) per-passage 300-word cut (rank_gpt.py:159,169; comment :168 says Japanese must cut by character), (b) window size as implicit context controller (README:75), (c) the accidental `'ERROR::reduce_length'` sentinel (:29-31) which is never checked by `permutation_pipeline` → `clean_response` strips it to empty → :216 appends all original ids → silent identity (window skipped without any signal). Infinite retry loop (:23-32, timeout=30 at :25) on all other exceptions. Nothing here is worth porting; our strict-FC throw + explicit pre-call budget arithmetic is strictly better.

## 5. Candidate formatting

- Only `content` enters the prompt: `'Title: {title} Content: {text}'` or raw `contents`, whitespace-collapsed at retrieval time (rank_gpt.py:112-120); the `'Title: Content: '` empty-title artifact is stripped at prompt time (:166).
- Multi-turn construction (:155-174): prefix (system "You are RankGPT…", user "I will provide you with {num} passages…", assistant "Okay, please provide the passages.") → per passage a user turn `[k] {content}` + synthetic assistant ack `Received passage [k].` → post prompt (:151-152) repeating the query, demanding `[] > []` descending, "Only response the ranking results, do not say any word or explain."
- Identifiers 1-based, renumbered per window (:162-164). Ordering = current rank order. temperature=0 (:186).
- Completion-model path `convert_messages_to_prompt` (:90-101) drops assistant turns and hardcodes "the 20 passages" regardless of num (upstream wart, unused in main path).

## 6. Ranking consistency and evaluation

- Consistency across windows is positional inheritance only (section 1); no global repair, no second pass.
- `receive_permutation` (:209-223): clean_response digit-stripping (:190-198) → to 0-based ints (:211) → dedupe keep-first (:212, :201-206) → drop out-of-range (:214-215) → append omitted members at window bottom in input order (:216) → rewrite hits (:217-218) and overwrite `rank`/`score` with positional values (:219-222). Scores remain monotonically descending with new order, so the TREC runfile score-sort reproduces the permutation, but scores are bookkeeping, not relevance.
- Eval: pytrec_eval wrapper (trec_eval.py:9-43), benchmark ks (1,5,10) (:156); runfile writer rank_gpt.py:247-255; batch variant `EvalFunction.receive_responses` (trec_eval.py:99-114).

## 7. Ensemble/calibration: verified absent

No ensemble of multiple permutations, no vote/aggregation, single pass per window, temperature=0. Pointwise Yes/No-logprob calibration exists only in the separate pointwise mode (pointwise.py:33-84, incl. -1e6 for unparsable), plus query-generation perplexity scoring (:87-105) — both per-passage, not listwise.

## 8. Verdict for FAR-Lab D-015 (single window, pool 24, strict-FC)

Our baseline: `src/pipeline/stages/retrieve.ts` — `RERANK_POOL = 24` (retrieve.ts:19), one call, strict permutation validation (every index exactly once, retrieve.ts:216-227), fail-closed to RRF.

**Port:** (1) sliding window bottom-up with step < window for pools > 24 — at our scale a two/three-window scheme (w=24/s=12: 2 calls for n≤36, 3 for n≤48) captures most value; process bottom window first, top last; per-window renumbering; must handle n ≤ w explicitly (upstream silently no-ops). (2) Ordinal-only score semantics (:219-222) — graded relevance labels stay ordinal unless separately validated. (3) temperature=0 parity check. Optional: a partial-acceptance tier (accept valid prefix, demote omitted to bottom, :216) between our throw and upstream identity — keep it logged, upstream's silence is a defect.

**Moot given strict structured output:** free-text `[] > []` transport and the whole digit-strip/dedupe/range-filter repair chain; ping-pong ack turns; any token-budget handling (upstream has none).

**FAR-Lab originals (no RankGPT precedent, evaluate on own evidence):** pre-shuffle (absent upstream, in tension with window chaining); per-item graded relevance in the permutation output (closest analogue is training-only 1/(i+1) labels).
