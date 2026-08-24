# FAR-Lab Model & Inference Plane — Architecture

Lane: model-plane (2026-08-24). Mission: 统一、可靠、可观测、可扩展、符合赛事要求的
Model & Inference Plane。Agent Runtime 是消费者；本平面只做模型基础设施，不碰
Agent Loop / UI / 科学算法所有权。

## 1. Layer map (what exists where — single ownership)

```
┌─ CONSUMERS ─────────────────────────────────────────────────────┐
│ pipeline stages (callStructured) · agent kernel · research      │
│ actions · experiment executors · benchmark harness              │
└──────────────────────────────────────────────────────────────────┘
        │ invokeStructured (src/pipeline/llm.ts)  ← unified entry:
        │   budget gate · exfil tripwire · concurrency cap (6) ·
        │   stage reasoning gear · receipt persistence
┌─ MODEL PLANE (this lane) ─────────── src/model-plane/ ──────────┐
│ plane.ts      facade: task-class call → route → receipt stamp   │
│ routing.ts    deterministic router (policy/budget/override)     │
│ capabilities.ts  capability registry + Qwen/Bailian catalog     │
│ prompts.ts    prompt asset registry (id/version/fingerprint)    │
│ benchmark.ts  7-suite model-comparison harness                  │
└──────────────────────────────────────────────────────────────────┘
        │ ModelProvider.structuredCall (src/shared/ports.ts)
┌─ PROVIDER LAYER (pre-existing) ────── src/providers/ ───────────┐
│ http.ts   transport core: retry(2)+Retry-After+jittered backoff │
│           30s cap · 3 corrective re-asks · 120s total budget ·  │
│           failure classification · redaction · receipts(+params)│
│           + response_format json_schema strict (NEW)            │
│ fallback.ts   explicit failover chain + cooldown                │
│ dashscope.ts  Bailian adapter (competition route) — registry-   │
│               driven structured-output negotiation (NEW)       │
│ zai.ts / custom.ts / test-stub.ts adapters                      │
└──────────────────────────────────────────────────────────────────┘
        │ receipts → store → usage-ledger / spend-limit (USD hard cap)
```

Ownership boundaries preserved: plane does NOT re-implement retry/failover (provider
layer owns them); plane does NOT own run lifecycle; receipts stay the single authority
for usage/cost (BP-4 no-invented-prices rule — registry priceRef is reference metadata
only, never feeds costUsd).

## 2. Capability registry (capabilities.ts)

- `ModelCapabilities` schema: text/vision/audio/toolCalling/embedding/rerank,
  structuredOutput tier (json_schema_strict | json_object | prompt_contract), reasoning,
  contextTokens (+basis doc|billing-tier), streaming, batch, latencyClass, priceRef
  (currency-honest, reference-only), region, rateLimits (only when published),
  knownLimitations, interfaceNotes (e.g. "必须走多模态接口"), sourceRefs (url+date).
- Curated catalog (2026-08-24, help.aliyun.com/zh/model-studio): qwen3.8-max,
  qwen3.7-plus(+snapshot alias), qwen3.7-flash, qwen3.7-max, qwen3.8-27b,
  qwen3.8-2.4t-a95b, qwen3.6-max-preview, qwen-plus(alias), qwen-turbo, qwen3-coder,
  qwen-long, qwen3-vl-plus/flash, qwen3.5-omni-plus, text-embedding-v4,
  qwen3.7-text-embedding, qwen3-rerank (gte-rerank = historical), glm-4.6 (dev route).
- Honesty: unknown model → undefined → "capabilities unverified" (routing rejects for
  capability-gated task classes; never guessed). Catalog parsed through zod at module
  load — typo fails fast.
- `negotiateStructuredOutput(caps, projectedSchema)`: server-enforced json_schema only
  for verified models WITH a projectable strict schema; degrades to json_object.

## 3. Dynamic routing (routing.ts + plane.ts)

- 11 task classes: cheap_extraction, high_quality_reasoning, vision, structured_output,
  long_context, review, ranking, coding, embedding, rerank, conversation.
- `routeCall(taskClass, candidates, policy, budget)` is a PURE function:
  hard gates (deepseek ban everywhere; competition mode = qwen-family via
  dashscope/custom-bailian only; capability gates for vision/embedding/rerank/
  structured/long-context) → soft gates (context-overflow at >75% verified window;
  over-remaining-budget on USD reference prices only) → deterministic score
  (latency-class preference per task + family bonuses; ties by name asc).
- Overridable: policy.overrides[taskClass] wins among ACCEPTED routes (never bypasses
  hard gates — override is preference, not escape hatch).
- Observable: RoutingDecision lists EVERY candidate with accept/reject reason +
  score; stamped onto receipt.routing by plane.ts; optional onDecision sink.
- plane.providerFor(taskClass) = drop-in ModelProvider for invokeStructured-style
  consumers (adoption seam; pipeline adoption documented in MODEL.md).

## 4. Reliability (pre-existing, verified — not rebuilt)

retry/backoff/Retry-After precedence/jitter cap 30s (transport×2), corrective re-asks
(×3, truncation-aware), total budget 120s, failure classification 6 kinds, credential
redaction, explicit failover chain with cooldown + LiteLLM-verified semantics,
workspace USD spend gate (fail-closed quota_exceeded), per-run token budget,
process-wide concurrency cap 6 (FARLAB_MODEL_CONCURRENCY). Streaming: deliberately NOT
in the structured plane (non-streaming by design; thinking+structured-on-bailian
recorded as known-limitation instead of half-support).

## 5. Structured output (defense in depth)

Layer 1: capability-negotiated transport — json_schema strict (server-enforced,
qwen3.7-plus/3.7-max/3.8-max) | strict-tools (deepseek beta, archived) | json_object |
anthropic prompt_contract. Layer 2: extractJsonText (fence strip). Layer 3: repairJson
(content-preserving). Layer 4: validateStructured tolerance chain (envelope unwrap,
null-strip, path-aware enum fold). Layer 5: corrective re-asks. Layer 6: truncation
discipline (finish_reason=length forbids engine completion). Semantic validation =
caller zod schema + per-suite deterministic scorers (benchmark).

## 6. Prompt assets (prompts.ts)

id+version+fingerprint(canonicalSha256)+provenance; same-id-same-version-different-text
throws (edits require version bump); materializePrompt strict bidirectional {{var}}
checking; planePrompts owns the canonical untrusted-data-rule (text owner stays
src/shared/untrusted.ts — registry references, never forks); regressionSnapshotEntries
emits eval/prompt-snapshot.json-compatible entries for the offline regression gate.
Stage SYSTEM_PROMPT migration path in MODEL.md §6.

## 7. Cost / tokens / latency

Receipts remain the ONLY authority: usage (prompt/completion/total + cached/creation/
read/reasoning token kinds), latencyMs, transportRetries, correctiveReasks →
usage-ledger aggregates (per-run + workspace) → spend-limit USD hard cap (fail-closed).
NEW: receipt.params (temperature/maxTokens actually sent/structuredOutput mode/
reasoning) + receipt.routing make every call's cost drivers fully attributable;
benchmark records retry overhead + latency per case (routing savings measurable via
plane decisions vs fixed-route baseline).

## 8. Reproducibility (per-call trace)

Receipt now carries: provider, modelId, modelVersion (server echo), params, routing
(taskClass/route/selectedVia), usage (all token kinds), latencyMs, requestHash
(payload+prompts), outputHash, finishReason, transportRetries, correctiveReasks,
reasoningGear, executionMode, at (recorder), codeRevision/environmentFingerprint
(bundle). Claim discipline: providers do not guarantee deterministic outputs —
FAR-Lab claims CALL-LEVEL traceability (same request bytes + knobs + route), never
bit-identical re-generation.

## 9. Benchmark (benchmark.ts)

7 suites × deterministic fixtures × deterministic scorers (no LLM self-judging):
structured-output (5), long-context needle 30%/80% (2), scientific-reasoning gold-keyed
(4), retrieval-synthesis id-Jaccard (2), vision (2, skipped visibly without verified
vision capability), tool-selection exact (4), ranking normalized Kendall-tau (2).
compareModels ranks per suite (score desc, name asc ties; skips listed with reason).
Harness mechanics verified OFFLINE via test-stub (tests/model-plane-benchmark.test.ts);
live model comparisons = real execution only, currently BLOCKED-live.

## 10. Competition compliance (canonical route)

Rule (re-verified 2026-08-24, research doc §A): 基座=Qwen 系列，经百炼调用（或官方
推荐工具 QoderWork/Qoder/秒悟），提供调用凭证或截图；PDF ≤20 页；截止 2026-09-05.
Plane implementation: dashscope adapter + registry qwen catalog + routing policy
'competition' (rejects non-qwen / non-bailian with visible reasons) + receipts as the
exportable 凭证 backbone. Credential blocker B-QWEN-LIVE-ROUTE stays OPEN — zero fake
success; verification path: fill DASHSCOPE_API_KEY in .far-run/secrets.env →
qwen-route-probe (see BLOCKERS.json). New MaaS endpoint form documented (§B1 research
doc): set FARLAB_DASHSCOPE_BASE_URL to the console-assigned workspace endpoint at
credential time.
