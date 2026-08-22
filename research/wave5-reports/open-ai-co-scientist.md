# Wave-5 Report — llnl/open-ai-co-scientist (LLNL co-scientist implementation)

License: MIT (verified, LLNL 2025). Source: `.cache/repos/open-ai-co-scientist` (~69 files;
one symlink `local-deploy/refresh.sh` failed to extract on Windows — cosmetic). Core =
`app/agents.py` (510 lines) + `app/models.py` + `app/run_store.py` + `app/tools/arxiv_search.py`;
Gradio UI; OpenRouter backends. Report by main agent (subagent rate-limited); refs read-verified.
Registry-C constraint applies (full co-scientist mechanism stays rejected; sub-mechanisms only).

## Verdict up front: DEMO-GRADE — below FAR-Lab discipline on every surface; shape reference only

This is the weakest of the co-scientist implementations examined (vs Kaimen). Concrete
evidence of the grade:

1. **Lenient defaults mask failures** — reflection parse failure silently returns
   `novelty="MEDIUM"` / `feasibility="MEDIUM"` defaults (`app/agents.py:92-97, 118-133`):
   the exact anti-pattern FAR-Lab's fail-closed constitution forbids. Kaimen instead
   validates at the tool boundary.
2. **Static hard-coded meta-review** — `MetaReviewAgent.summarize_and_feedback` returns
   literal template strings as "suggested next steps" ("Refine top hypotheses based on
   review comments.", …) regardless of state (`app/agents.py:396-401`); critiques are
   three canned `if novelty == "LOW"` sentences (`:388-393`). No LLM in the meta step.
3. **Reflection = HIGH/MEDIUM/LOW novelty+feasibility + comment + references**
   (`app/agents.py:66-88`) — far shallower than Kaimen's verdict-enum + 0-1 dims +
   assumption plausibility + verbatim-excerpt evidence.
4. **Proximity graph = pairwise `similarity_score` matrix → visjs nodes/edges**
   (`app/agents.py:353-380`) — deterministic and product-visible (similarity graph UI),
   but no clustering/dedup is actually consumed by the loop.
5. **Elo update** plain k-factor (`app/agents.py:168-186`) after `run_pairwise_debate`;
   debate = generate both defenses then score (:138-166). Weaker than Robin BT/ILSR
   (already ported to FAR-Lab).

## Sub-mechanisms with any value

| dim | mechanism | file:line | verdict |
|---|---|---|---|
| H (product) | proximity similarity graph rendered as interactive visjs nodes/edges in the UI | agents.py:353-380 + app.py UI | 记档 only — FAR-Lab web workbench could eventually surface a claim/hypothesis similarity graph, but that is presentation-level and not part of Wave-5 fusion (P1 territory) |
| C6 | arxiv tool wrapper with category filter + sort options | tools/arxiv_search.py:1-45 | 已有（FAR-Lab arxiv adapter 已覆盖） |
| J1 | timestamped per-run result files (results/) | run_store.py | 已有（FAR-Lab receipts/artifacts 更强） |

## Rejection notes (do not revisit)

- Generation/reflection/ranking/evolution cycle: shallow implementations of an already-
  rejected mechanism; nothing here exceeds Kaimen's version of the same sub-mechanisms.
- Lenient JSON-parse-with-defaults: REJECT as a pattern (masks failure; FAR-Lab strict-FC
  + tolerance chain is strictly better).
- OpenRouter free-model demo defaults: 不适用.

**Bottom line**: examined, nothing ported. Recorded so a future wave does not re-read this
repo expecting hidden depth — Kaimen Co-Scientist.md is the reference for co-scientist
sub-mechanisms.
