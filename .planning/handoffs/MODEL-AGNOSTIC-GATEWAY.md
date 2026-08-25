# MODEL-AGNOSTIC-GATEWAY — All Models Worldwide, All Wires (user directive 2026-08-26)

Lane owner: main session, branch `build/hx-reconstruction`. Landed 2026-08-26.
Directive: **the product supports every model on earth, every protocol, freely
configurable — remove every measure that pinned it to a national vendor set.**

## TLDR

The model plane is now vendor-neutral end to end. Three wire protocols
(OpenAI chat/completions, Anthropic Messages, Google Gemini generateContent),
an any-endpoint env route (`universal`), a worldwide preset catalog in the UI,
and zero provider bans in the router. Verified live against the real Zhipu
platform on BOTH wires it exposes (real tokens, real model output, no stubs).

## What changed (contract-level)

### 1. Wire protocols: `openai | anthropic | gemini`
- `src/domain/model-config.ts` — `ProviderWireProtocol` zod enum + reasoning
  dialect `thinking_config` (Gemini `generationConfig.thinkingConfig.thinkingBudget`,
  gear→budget from the existing single-owner map). Wire↔dialect compatibility is
  validated per style against a required-wire table.
- `src/providers/http.ts` — gemini branch in the shared transport runner: URL
  `{base}/v1beta/models/{model}:generateContent`, `x-goog-api-key` header,
  system messages → `systemInstruction`, contents[] role mapping,
  `responseMimeType:'application/json'` (JSON mode), `parseGeminiUsage`
  (promptTokenCount/candidatesTokenCount/totalTokenCount/thoughtsTokenCount→
  prompt/completion/total/reasoningTokens), finishReason STOP/MAX_TOKENS →
  stop/length (W7-F2 truncation discipline applies), `modelVersion` → receipt.
  Structured output on gemini/anthropic wires = JSON mode + prompt contract
  (jsonSchema projection stripped; the caller's zod parse stays the authority —
  same policy zai has had since D-058).
- `src/providers/custom.ts` — non-openai wires strip `jsonSchema` (was
  anthropic-only).
- Reasoning style unions unified to `ReasoningStyle`/`ReasoningGear` imports
  across `ports.ts`, `pipeline/llm.ts`, `agent/loop.ts`,
  `server/conversation-agent.ts` (single source of truth; was 5 hardcoded
  triple-enums).

### 2. Bans removed (behavior contract change, tests updated accordingly)
- `src/model-plane/routing.ts` — `BANNED_ROUTE_RE` (/deepseek/i) deleted.
  Default mode admits ANY provider. **Competition mode unchanged**: Qwen-family
  base on Bailian routes only (official rule; AGENTS.md mandate). Vendor bonus
  scoring (`family==='qwen'`) generalized to capability matching
  (`/coder|code/i`, `/long/i` on the model key).
- `src/providers/index.ts` — open registry: `LIVE_PROVIDER_NAMES =
  ['zai','dashscope','deepseek','universal']`; `kind` is now only
  `'live'|'test'` (no `'archived'`). `deepseek.ts` unbanned (strict-FC beta
  route intact).
- Git history keeps the 2026-08-22 ban provenance; the 2026-08-26 user
  directive supersedes it at the PRODUCT level. (Project-internal usage of the
  debug credential remains the glm flash key per the standing directive.)

### 3. Universal env route (any endpoint on earth, no code changes)
`src/providers/universal.ts` — `FARLAB_MODEL_PROVIDER=universal` +
`FARLAB_UNIVERSAL_{WIRE,BASE_URL,MODEL,API_KEY}`. Fail-closed lists EVERY
missing var. UI builtin-routes panel edits it like any builtin (modelId
override + pricing + default switch; `builtin-overrides.ts` schema now has all
four keys).

### 4. Worldwide preset catalog
`src/providers/catalog.ts` — 19 one-click templates (OpenAI, Anthropic, Google
Gemini, xAI, OpenRouter, Groq, Mistral, Together, Perplexity, Cohere,
Fireworks, Cerebras, DeepSeek, Moonshot, Zhipu, DashScope, Ollama, vLLM,
LM Studio). Canonical official baseUrls only; **no model-id lists** (discovery
button lists what the endpoint actually serves); Azure deliberately absent
(different auth scheme — a template that can't authenticate would be fake).
API: `GET /api/v1/model-configs/templates`. Web settings form renders the
catalog as prefill buttons (title shows note/keyUrl); falls back to a 3-entry
trio if the endpoint is unreachable.

### 5. Discovery
`src/providers/discovery.ts` — gemini wire: `GET {base}/v1beta/models`,
`x-goog-api-key`, `{models:[{name:'models/<id>',displayName}]}` parsed with
`models/` prefix stripped; api.ts discovery endpoint accepts wire
`'gemini'`.

## Evidence

- `tests/model-agnostic-gateway.test.ts` (12 tests): gemini request shape/
  headers/body/usage/truncation/malformed-200, thinkingConfig mapping,
  universal 3-wire routing + fail-closed env naming, catalog integrity,
  wire↔dialect zod matrix, gemini discovery parse. All green.
- Updated behavior tests: `tests/providers.test.ts` (registry open set),
  `tests/model-plane.test.ts` (default vendor-neutral + competition gate kept),
  `tests/builtin-routes.test.ts` (deepseek live/editable).
- Full suite: **1756 passed / 3 skipped / 0 failed** (vitest run, 2026-08-26).
- Backend `tsc --noEmit` EXIT=0; web `tsc --noEmit` EXIT=0; web vite build EXIT=0;
  targeted eslint on all touched files EXIT=0.
- LIVE smoke (`node scripts/live-smoke-model-gateway.mjs`, real calls, real
  key from env only):
  - openai wire `https://open.bigmodel.cn/api/paas/v4` · glm-4.7-flash ·
    ok · 55.9s · tokens 309/1443 · correctiveReasks=1 · real hypothesis text.
  - anthropic wire `https://open.bigmodel.cn/api/anthropic` · glm-4.7-flash ·
    ok · 20.2s · tokens 100/295 · reasks=0.
  - First anthropic attempt hit a 60s self-imposed budget (timeout classified
    correctly); 150s budget passed. Latency of that model at that hour was the
    cause, not the wire.
- gemini/other vendors live-verified: **UNVERIFIED-live** (no credentials) —
  deterministic offline coverage above is the evidence tier; catalog baseUrls
  are official canonical roots.

## Notes for next lanes

- Receipts for gemini calls echo `structuredOutput:'json_object'` (JSON mode) —
  capability registry entries for gemini models should use
  `structuredOutput:'json_object'`, not json_schema_strict.
- The router's competition gate is the ONLY policy restriction left; it is
  official-rule-mandated and must survive future refactors (tests lock it).
- `FARLAB_UNIVERSAL_*` env chain is read at provider construction; changing it
  mid-run affects the next provider resolution, consistent with the mcfg layer.
