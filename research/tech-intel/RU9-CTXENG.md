# RU-9 CTXENG — Research Packet (2026-08-24, SEARCH_SATURATED)

Provider facts primary-sourced: zai/bigmodel implicit cache (content-sim,
cached_tokens, ~50% bill; anthropic-wire coverage UNVERIFIED); dashscope
implicit (20%) + EXPLICIT cache_control ephemeral (write 125%/read 10%,
4 markers, min 1024 tok, TTL 5min; anthropic-compat reports
cache_read_input_tokens); GLM-5.3 effort ∈ {low,high,max} — NO medium;
OpenAI reasoning_tokens inside completion_tokens at output rate.

## Verdicts
- B7.7 reasoning plane: **ADOPT** — transport mapping EXISTS (http.ts
  reasoningBodyFields, receipts record gear) but no stage sets req.reasoning;
  usage parsing DROPS cached/cache_creation/cache_read/reasoning tokens.
- C4.3 KV-cache layout: **ADOPT** — both providers verified; unrecorded cache
  tokens understate USD-ceiling accounting by up to 80-90% on hits.
- B6.4 prompt regression: **EXTRACT + build native** — offline STRUCTURE
  regression (requestHash determinism, rule presence, budgets, diff report vs
  snapshot from persisted step_outputs) fully buildable; GEPA/DSPy optimization
  needs live LLM (BLOCKED, post-deadline); promptfoo = design reference.
- B1.6 context compiler: **ADAPT minimal** — deterministic section budgets +
  TF-IDF diverse exemplar selection only; full JIT/subagent-handoff deferred.

## GOs (all offline-testable, ranked)
1. cache-aware layout + token-kind accounting: usage parse cached_tokens/
   cache_creation/cache_read/anthropic variants + reasoning_tokens into
   receipts; stable-prefix→variable-tail render discipline (rerank windows
   vary ONLY the tail). Files: providers/http.ts, stages/retrieve.ts,
   tests/cache-layout.test.ts.
2. stage→reasoning-gear table (zod, per-provider clamps — GLM-5.3 medium→high)
   wired via invokeStructured req.reasoning; accounting via GO1 tokens.
3. native prompt-regression gate: re-render prompts from persisted
   step_outputs; assert byte-determinism (requestHash), UNTRUSTED_DATA_RULE
   presence, char/token budgets; diff report vs snapshot.
4. minimal compiler: section priority/caps + TF-IDF exemplar diversity
   (reuses A4.4 dispersion).

## UNVERIFIED: bigmodel anthropic-wire cache support/billing (defensive
capture only); Anthropic-native multipliers (cited via Alibaba's verified
anthropic-compat docs); GEPA repo license (moot — Python+live).
