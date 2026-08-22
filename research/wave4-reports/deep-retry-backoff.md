# Wave-4 Deep Dive: Retry / Backoff / Rate-Limit Handling Across 7 Agent Harnesses

Status: research only. Cloned repos are DATA — no code from them was executed. Every load-bearing claim carries `file:line` evidence from the clones at `C:/Users/RichardYuan/Desktop/new/.cache/repos/`. Line numbers are as-of clone snapshot (2026-08-22).

Scope: opencode (MIT), hermes-agent (MIT), pi-mono (MIT), aider (Apache-2.0), codex (Apache-2.0, Rust), gemini-cli (Apache-2.0), goose (Apache-2.0).

---

## 0. TL;DR

- **Header handling**: 3 of 7 (opencode, pi-mono, goose) parse `Retry-After` in seconds + HTTP-date form; only opencode additionally parses `retry-after-ms` (Anthropic-style). goose is the only one that hard-clamps absurd server hints (1h cap) and honors *past* HTTP-dates as "retry now (0ms)". pi-mono *throws* when the server asks for more than 60s instead of clamping.
- **Jitter**: nobody uses AWS "full/equal/decorrelated" by the book. Five distinct formulas exist: additive proportional (opencode ±25%), multiplicative symmetric (codex ×0.9–1.1, goose ×0.8–1.2, gemini ±30% symmetric), downward-only SDK-style (pi-mono ×(1−rand·0.25)), positive-only over a server minimum (gemini quota path +20%), additive-on-top-of-cap (hermes uniform[0, ratio·delay] added AFTER the cap).
- **Budget-429 vs transient-429**: FAR-Lab's existing rule (quota/budget 429 must NOT retry) is independently corroborated by pi-mono (`NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN`), opencode (FreeUsageLimit/GoUsageLimit separated out), aider ("insufficient credits" 402 → no retry), and gemini-cli (TerminalQuotaError vs RetryableQuotaError). This is the strongest cross-repo consensus in the whole study.
- **Recommended port**: adopt **goose's parse-and-clamp header layer** (numeric seconds + HTTP-date + past-date→0 + 1h sanity clamp, body-metadata extension optional), **opencode's additive proportional jitter** on top of a **pi-mono-style pure two-function core** (`parseRetryAfter` + `computeBackoff`), keep FAR-Lab's fail-closed classification and total-budget envelope unchanged.

---

## 1. opencode (TypeScript, Effect)

Files: `packages/opencode/src/session/retry.ts` (impl), `packages/opencode/test/session/retry.test.ts` (tests).

### 1.1 Constants — retry.ts:26-31

| Constant | Value | Evidence |
|---|---|---|
| initial delay | 2000 ms | `RETRY_INITIAL_DELAY = 2000` (retry.ts:26) |
| factor | 2 | `RETRY_BACKOFF_FACTOR = 2` (retry.ts:27) |
| jitter factor | 0.25 (additive proportional) | `RETRY_JITTER_FACTOR = 0.25` (retry.ts:28) |
| cap WITHOUT headers | 30 000 ms | `RETRY_MAX_DELAY_NO_HEADERS = 30_000` (retry.ts:29) |
| absolute cap | 2 147 483 647 ms (max 32-bit signed int for setTimeout) | `RETRY_MAX_DELAY` (retry.ts:30) |
| max retries | 5 | `RETRY_MAX_RETRIES = 5` (retry.ts:31) |

### 1.2 Retry-After handling — `delay()` retry.ts:47-78

Order of precedence:
1. `retry-after-ms` header: `Number.parseFloat`, if not NaN → return `cap(parsedMs)` (retry.ts:51-57). Milliseconds.
2. `retry-after` header: parse as float seconds → `cap(Math.ceil(seconds * 1000))` (retry.ts:59-65). If NaN, try `Date.parse(retryAfter) - Date.now()` (HTTP-date); only used if `> 0` — **a past date is ignored**, falling through to exponential (retry.ts:66-71).
3. No usable header but headers exist → exponential, capped only at the 32-bit absolute cap (NOT the 30s cap) (retry.ts:73).
4. No headers at all → exponential capped at 30 s (retry.ts:77).

Key asymmetry (test-verified): with ANY response headers present, an explicit server hint of 700 000 ms (11.6 min) is honored, but the headerless exponential never exceeds 30 s (retry.test.ts:84-95). Clamping is `Math.min(ms, 2^31-1)` via `cap()` (retry.ts:43-45) — this is a runtime-safety clamp (setTimeout range), not a politeness clamp.

### 1.3 Jitter — `exponential()` retry.ts:80-83

```ts
const base = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
return Math.ceil(base + base * RETRY_JITTER_FACTOR * random)
```
Additive proportional jitter: delay ∈ [base, base·1.25]. First attempt is NOT delayed extra — delay is computed per failed attempt, attempt is 1-based. `random` is injectable (default `Math.random`, signature retry.ts:47) making the function deterministically testable — their tests inject `random = 0` and `1` (retry.test.ts:38, 44-47).

### 1.4 Retryable classification — `retryable()` retry.ts:85-155

- Context-overflow errors: never retried (retry.ts:87).
- APIError retryable if ANY of: SDK `isRetryable` flag; `statusCode >= 500` (5xx retried even when SDK says non-retryable, retry.ts:92-94); message matches patterns; responseBody matches patterns (retry.ts:94-97).
- Pattern family (retry.ts:33-41), all case-insensitive regexes on message/body text:
  - `/429|500|502|503|504|524/i`
  - `rate limit / rate-limit / rate_limit / too many requests / rate increased too quickly`
  - `overloaded | service unavailable (3 spellings) | internal error | server error (3 spellings) | provider returned error (3 spellings)`
  - network: `terminated | fetch failed | failed to fetch | network error (3 spellings) | upstream connect | connection error/refused/lost | socket connection was closed | socket hang up | reset before headers | getaddrinfo | enotfound | eai_again | econnrefused | econnreset | etimedout`
  - timeout: `/^timeout$|\b(?:request|response|connection|network|stream|read) (?:timeout|timed out|time out)\b/i`
  - `try your request again | retry your request | resource exhausted (2 spellings)`
  - `\btry again (?:later|in\b)|\b(?:currently|temporarily) at capacity\b`
- 429 sub-classification: `FreeUsageLimitError` / `GoUsageLimitError` response bodies map to upsell *actions* but stay inside the retry machinery (retry.ts:99-145) — the `retry-after` header on GoUsageLimit is used for human-readable "resets in Xh Ym" text (retry.ts:116-128), not for the sleep.

### 1.5 Integration shape

Effect `Schedule.fromStepWithMetadata` policy: `policy({provider, parse, set})` (retry.ts:183-207). Pure decision functions (`delay`, `retryable`) are separate from the Effect schedule — the design worth porting: **classification and delay are pure and independently testable; the loop is a thin driver**. Retry status is surfaced via a `set()` callback (attempt, message, action, next-attempt-timestamp) so UI shows a countdown instead of a frozen screen (retry.ts:196-202).

### 1.6 Tests — retry.test.ts

- Delay sequence with `random=0`: `[2000, 4000, 8000, 16000, 30000, 30000, ...]` — proves the no-header 30s cap (retry.test.ts:36-40).
- Jitter math with `random=1`: attempt1=2500, attempt4=20000 (16000·1.25), attempt5=30000 (capped) (retry.test.ts:42-48).
- `retry-after-ms: 1500` beats exponential even at attempt 4 (retry.test.ts:50-53).
- HTTP-date honored within tolerance [19000, 20000] for a date now+20s (retry.test.ts:60-66).
- Invalid/malformed/past dates all fall back to exponential 2000 (retry.test.ts:68-82).
- Oversized `retry-after-ms: 999999999999` clamps to `RETRY_MAX_DELAY` (retry.test.ts:92-95).
- Policy stops after exactly 5 retries — `[1,2,3,4,5]` (retry.test.ts:127-148).
- Classification: 4xx-with-isRetryable=false not retried (312-322); 500/502/503 retried regardless of SDK flag (275-310); context overflow never (266-273); a large table of real-world provider error strings (202-227).

---

## 2. pi-mono (TypeScript) — TWO independent retry systems

Files: `packages/ai/src/utils/retry.ts` (turn-level classifier+loop), `packages/ai/src/utils/provider-retry.ts` (SDK-wrapping transport retry), tests `packages/ai/test/retry.test.ts`, `packages/ai/test/provider-retry.test.ts`.

### 2.1 System A: turn-level retry (retry.ts)

**Two-tier classification** (the "two-tier" lead is accurate):
- Tier 0 NON-retryable (checked FIRST, wins over tier 1): `NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN` (retry.ts:7-24) — `GoUsageLimitError | FreeUsageLimitError | Monthly usage limit reached | available balance | insufficient_quota | out of budget | quota exceeded | billing`.
- Tier 1 retryable: `RETRYABLE_PROVIDER_ERROR_PATTERN` (retry.ts:26-90) — status digits `429|500|502|503|504|524`, `overloaded`, `rate.?limit`, `too many requests`, `service.?unavailable`, `server.?error`, `internal.?error`, `provider.?returned.?error`, network codes (`network.?error`, `connection.?refused/lost`, `fetch failed`, `getaddrinfo`, `ENOTFOUND`, `EAI_AGAIN`, `upstream.?connect`, `reset before headers`, `socket hang up`…), stream endings (`ended without`, `stream ended before message_stop`, `http2 request did not get a response`), explicit server guidance (`you can retry your request`, `try your request again`, `please retry your request`), gRPC `ResourceExhausted`.
- `isRetryableAssistantError` (retry.ts:223-228): non-retryable pattern test first, then retryable pattern — message-based only, no status codes (statuses live in the strings).

**Policy**: `RetryPolicy {enabled, maxRetries, baseDelayMs}` (retry.ts:98-104); delay = `baseDelayMs * 2^(attempt-1)` (retry.ts:196) — **no jitter, no max cap** (comment documents the shape at retry.ts:92-97). Loop `retryAssistantCall` (retry.ts:163-212): abort never retried (177-180); abort during the backoff sleep normalized to an aborted message (201-209); callbacks `onRetryScheduled/onRetryAttemptStart/onRetryFinished` for UI/telemetry (retry.ts:107-119). Sleep is abort-signal-aware (retry.ts:127-143).

### 2.2 System B: SDK-wrapping provider retry (provider-retry.ts)

Explicitly mirrors the OpenAI/Anthropic SDK retry policy (comment at provider-retry.ts:22, 97-104: SDKs must be called with `maxRetries: 0` and wrapped here because their built-in retry timers ignore the request AbortSignal).

- Retryable: `x-should-retry` header if present (`true`/`false` short-circuit, provider-retry.ts:24-26); else `status === undefined` (network) → retryable; else `408 | 409 | 429 | >=500` (provider-retry.ts:29-35).
- Delay `getRetryDelayMs` (provider-retry.ts:51-67): `retry-after-ms` header → float ms; else `retry-after` → float seconds ×1000, and if NaN `Date.parse(retryAfter) - Date.now()` (HTTP-date); else exponential `min(0.5 * 2^retryIndex, 8) * 1000` with **downward-only jitter** `* (1 - Math.random() * 0.25)` (i.e. delay ∈ [75%, 100%] of base — the OpenAI-SDK style; never exceeds the computed base).
- **Server-delay guard**: `validateServerRetryDelayMs` (provider-retry.ts:37-49) **throws** when server-requested delay > `maxRetryDelayMs` (default `DEFAULT_MAX_RETRY_DELAY_MS = 60_000`, provider-retry.ts:1) — fail-fast instead of clamp or silent over-wait; `maxRetryDelayMs: 0` disables the limit (provider-retry.ts:102-104). Also `Math.max(0, ms)` on sleep (provider-retry.ts:91) guards negative HTTP-date deltas.
- Attempt cap exhaustion → rethrow the last error (provider-retry.ts:118).

### 2.3 Tests

- `retry.test.ts`: classification matches explicit guidance / socket-drop wording / buffer exhaustion / premature stream ends (16-69); quota/billing never retried (71-77); loop: no retry on abort (103), no retry when disabled (166), bounded retries then final error (125), success mid-loop stops (136), abort-during-sleep returns aborted message + `onRetryFinished(false)` (208).
- `provider-retry.test.ts`: retries retryable statuses (16); honors `x-should-retry: false` (32); **rejects provider-requested delay above the cap** (40); cap disable via `maxRetryDelayMs: 0` (49); abort during provider-requested delay (65).

---

## 3. hermes-agent (Python)

Files: `agent/retry_utils.py` (pure utilities), `agent/conversation_loop.py` (the ~5000-line turn loop), `agent/turn_retry_state.py` (one-shot recovery guards), `agent/agent_init.py` (retry count config), `tests/test_retry_utils.py`.

### 3.1 `parse_retry_after_seconds` — retry_utils.py:38-87

Accepts raw value (numeric string / HTTP-date / number) OR a headers mapping (case-insensitive double-get, retry_utils.py:52-64). Numeric → `max(0.0, float)` (negative clamped to 0). HTTP-date via `email.utils.parsedate_to_datetime` (retry_utils.py:80); tz-naive treated as UTC (85-86); past date → 0.0 (87). Absent/unparseable → None.

### 3.2 `jittered_backoff` — retry_utils.py:90-128

```
delay = min(base_delay * 2^(attempt-1), max_delay)          # capped base
jitter = rng.uniform(0, jitter_ratio * delay)               # 0.5 default
return delay + jitter
```
Defaults: base 5.0 s, max 120 s, ratio 0.5. **The jitter is added AFTER the cap**, so the total can reach `max_delay * 1.5` — deliberate ("decorrelates concurrent retries", retry_utils.py:109-110) but note it breaks the "max_delay is a maximum" invariant. Decorrelation is strengthened with a thread-safe monotonic counter seeding `random.Random(time_ns ^ counter * 0x9E3779B9)` (retry_utils.py:18-19, 112-126) so concurrent sessions don't share RNG state — this is the "decorrelated jitter" the phase-1 lead referenced (it is NOT AWS decorrelated jitter; it's capped-exponential + additive uniform).

### 3.3 The real loop — conversation_loop.py

- `max_retries = agent._api_max_retries` (conversation_loop.py:2805); default 3, config `api_max_retries`, min 1 (agent_init.py:2062-2067).
- Rate-limit wait (conversation_loop.py:6470-6488): if rate-limited, read `retry-after` header with a **plain `float()` parse only — no HTTP-date support in this path** (the full parser exists in retry_utils but is used by auth/billing/tools paths: hermes_cli/auth.py:963-972, tools/microsoft_graph_client.py:361-391); cap `min(float(raw), 600)` with an evidence comment: Anthropic Tier-1 input buckets reset ~171 s, a 120 s cap caused re-trips; 600 s covers realistic windows while rejecting pathological values (conversation_loop.py:6466-6471). Else `jittered_backoff(retry_count, base_delay=2.0, max_delay=60.0)`.
- Adaptive provider-specific tier: `adaptive_rate_limit_backoff` (retry_utils.py:162-191) — for a NARROW Z.AI Coding Plan overload shape only (429 + `api.z.ai/api/coding/paas/v4` + `glm-5.2` + code 1305/"temporarily overloaded", retry_utils.py:142-159): first 3 retries on the normal schedule, then a fixed long table **(30, 60, 90, 120) s** (retry_utils.py:27) with jitter_ratio 0.2. The retry ceiling must be extended to `short + len(long) + 1 = 8` for the table to be reachable — they document that with the default ceiling of 3 the whole long tier was dead code (retry_utils.py:194-208).
- Invalid-API-response path uses `jittered_backoff(retry_count, base_delay=5.0, max_delay=120.0)` (conversation_loop.py:3412).
- Per-attempt recovery bookkeeping is a `TurnRetryState` dataclass of one-shot booleans: per-provider OAuth refresh guards (codex/anthropic/nous/copilot/vertex), format-recovery guards (thinking-signature stripping, encrypted-content, llama.cpp grammar fallback…) (turn_retry_state.py:1-60). **This is the verified truth behind the "per-provider retry table" lead: there is no per-provider delay table; there are per-provider one-shot recovery branches plus one narrow per-provider delay override (Z.AI).**

### 3.4 Tests

`tests/test_retry_utils.py` exists (found via rg); not read in detail — the inline docstrings at retry_utils.py:194-208 encode the dead-code regression story.

---

## 4. aider (Python, litellm)

Files: `aider/models.py`, `aider/coders/base_coder.py`, `aider/exceptions.py`.

### 4.1 The loop (two copies)

`simple_send_with_retries` (models.py:1036-1083) and `send_with_retries` in base_coder.py (loop at base_coder.py:1452-1490):
- `retry_delay = 0.125` (models.py:1045, base_coder.py:1451)
- On each caught litellm exception: `retry_delay *= 2`; if `retry_delay > RETRY_TIMEOUT` (= 60, models.py:26) → stop (models.py:1071-1076, base_coder.py:1469-1473); else `time.sleep(retry_delay)` and continue.
- **No jitter. No Retry-After parsing. No attempt cap** — the only termination conditions are the classification verdict and delay>60s (sequence 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64→stop: 8 retries max by arithmetic, but enforced via the delay, not a counter).
- `ContextWindowExceededError` → `exhausted`, never retried (base_coder.py:1463-1465).

### 4.2 Classification — exceptions.py

`LiteLLMExceptions` builds a per-exception-class table `ExInfo(name, retry: bool, description)` from a curated `EXCEPTIONS` list; any litellm `*Error` class missing from aider's list raises at load time (exceptions.py:66-78) — a completeness tripwire. Special cases: `APIConnectionError` with "OpenrouterException"+`'choices'` → retryable (exceptions.py:92-101); `APIError` with "insufficient credits" + `"code":402` → **not retryable** (exceptions.py:104-112). So budget/quota walls are again separated from transient errors.

---

## 5. codex (Rust)

Files: `codex-rs/core/src/responses_retry.rs`, `codex-rs/core/src/util.rs`, `codex-rs/codex-client/src/retry.rs`, `codex-rs/codex-api/src/api_bridge.rs`, `codex-rs/codex-api/src/sse/responses.rs`, `codex-rs/protocol/src/error.rs`, defaults `codex-rs/model-provider-info/src/lib.rs`, tests `codex-rs/core/src/responses_retry_tests.rs`, `codex-rs/core/tests/suite/retry_after.rs`.

### 5.1 Defaults

`DEFAULT_STREAM_MAX_RETRIES = 5`, `DEFAULT_REQUEST_MAX_RETRIES = 4` (model-provider-info/src/lib.rs:28-29); user-configurable with hard caps of 100 (lib.rs:32-35). Stream connection failures (feature-gated) use 5 s initial doubling to a 60 s cap (responses_retry.rs:17-18, 62-83).

### 5.2 Backoff functions (two layers, same jitter)

- Core stream layer: `backoff(attempt)` = `INITIAL_DELAY_MS(200) * 2^(attempt-1) * uniform[0.9, 1.1]` (util.rs:6-7, 86-91). No politeness cap; bounded by max_retries.
- HTTP transport layer: `RetryPolicy {max_attempts, base_delay, retry_on{retry_429, retry_5xx, retry_transport}}` (codex-client/src/retry.rs:6-26); `backoff(base, attempt)` = `base * 2^(attempt-1) * uniform[0.9, 1.1]` with saturating arithmetic (retry.rs:39-48); `run_with_retry` loops `0..=max_attempts` and ends with `TransportError::RetryLimit` (retry.rs:74-105). Retry classification is explicit booleans per class: 429 only if `retry_429`, 5xx only if `retry_5xx`, Timeout/Connection/Network only if `retry_transport` (retry.rs:17-27).

### 5.3 Server-provided delay — message regex, not header

`CodexErr.retry_delay: Option<Duration>` (protocol/src/error.rs:72, accessor 406-411). It is populated in `map_api_error` from `ApiError::Retryable { delay }` (api_bridge.rs:26-31), and that delay comes from **parsing the SSE error MESSAGE** — `try_parse_retry_after` matches only `code == "rate_limit_exceeded"` and regex-extracts "Please try again in `<value><unit>`" where unit ∈ {s, second(s), ms} (sse/responses.rs:654-677). Tests prove the three real shapes: "28ms" → 28 ms, "1.898s" → 1.898 s, "35 seconds" → 35 s (sse/responses.rs:1862-1903). No HTTP `Retry-After` header parsing in this path. The stream retry then prefers the server delay over computed backoff: `err.retry_delay().unwrap_or_else(|| backoff(retry_count))` (responses_retry.rs:105).

### 5.4 Integration extras worth noting

- Exhausted stream retries may trigger a transport FALLBACK (WebSocket → HTTPS) and reset the retry counter (responses_retry.rs:85-100).
- First websocket-retry notification is hidden in release builds to reduce noise (responses_retry.rs:108-122) — retry UX as product behavior.

### 5.5 Tests

- `tests/suite/retry_after.rs`: full end-to-end with wiremock + a tracing subscriber that captures `codex.retry` telemetry events; asserts observed delays in windows **180-220 ms** (first) and **360-440 ms** (second) — i.e. 200 ms and 400 ms each ×[0.9,1.1] (retry_after.rs:35-39). This is the reference design for asserting jittered delays without flakiness: assert a RANGE, not a value.
- `responses_retry_tests.rs`: retry logging context test (line 8-9).
- `sse/responses.rs` inline tests: the three message forms above.

---

## 6. gemini-cli (TypeScript)

Files: `packages/core/src/utils/retry.ts` (main), `packages/core/src/utils/googleQuotaErrors.ts`, `packages/core/src/core/geminiChat.ts` (nudging), tests `packages/core/src/utils/retry.test.ts`.

### 6.1 Constants — retry.ts:20, 42-47

`DEFAULT_MAX_ATTEMPTS = 10`; `initialDelayMs = 5000`, `maxDelayMs = 30000`.

### 6.2 `retryWithBackoff` — retry.ts:258-529

- Loop `while attempt < maxAttempts` with `attempt++` up front (306-310); aborts checked before call, after call, and inside sleep (262-264, 300-309, 337-340).
- Generic path delay: symmetric jitter `currentDelay + currentDelay * 0.3 * (Math.random()*2 - 1)` floored at 0 → delay ∈ [0.7×, 1.3×] (retry.ts:494-495, 518-519); then `currentDelay = min(maxDelayMs, currentDelay * 2)` (500, 524).
- **Quota path** (the interesting part): `classifyGoogleError` maps to `TerminalQuotaError` (daily/hard) vs `RetryableQuotaError` (per-minute) (googleQuotaErrors.ts:22-70; `retryDelayMs = retryDelaySeconds * 1000`, lines 42 and 68 — source is google.rpc.RetryInfo in the error details, parsed in `googleErrors.ts`, not re-verified here). For `RetryableQuotaError` with a server delay: `currentDelay = max(currentDelay, retryDelayMs)` then **positive-only jitter up to +20%** — never retry before the server minimum (retry.ts:472-488).
- `TerminalQuotaError` is terminal BUT with reason `MODEL_CAPACITY_EXHAUSTED` it degrades to silent retries: unattended → standard maxAttempts; interactive → 3 silent retries (1 s, 3 s) then the `onPersistent429` callback may switch to a fallback model and RESET the attempt counter (retry.ts:346-420). This is retry-driven model fallback, not just delay.
- Classification `isRetryableError` (retry.ts:170-209): network codes list `ECONNRESET, ETIMEDOUT, EPIPE, ENOTFOUND, EAI_AGAIN, ECONNREFUSED, ERR_SSL_WRONG_VERSION_NUMBER, EPROTO, UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT, UND_ERR_CONNECT_TIMEOUT, ERR_STREAM_PREMATURE_CLOSE` (49-62) + SSL `BAD_RECORD_MAC` suffix regex (70) with cause-chain traversal up to depth 5 (84-120); ApiError: 400 explicitly never, 429/499/5xx yes (192-206); `'fetch failed'`/`'incomplete json segment'` only when `retryFetchErrors` is opted in (180-189).
- **Retry Nudging** (geminiChat.ts:901-921): on retry of an `InvalidStreamError`, appends a type-specific system-instruction nudge (`THINKING_ONLY_RESPONSE` vs `NO_RESPONSE_TEXT`). Orthogonal to delay policy — error-type-specific re-prompting, directly comparable to FAR-Lab's `appendCorrection` re-asks in http.ts:282-288.

### 6.3 Tests — retry.test.ts

- Jitter bounds: all observed delays within [70, 130] for initialDelay 100, and two runs must differ (279-333).
- Server delay honored: `RetryableQuotaError` with 12.345 s → observed sleep ∈ [12345, 12345×1.2] (623-650).
- 499 retried (161); 400 never (203, 237); network-code retries incl. nested cause (372-589); fallback callback on TerminalQuotaError fires once with 1 call (591-621); abort paths (669-740).

---

## 7. goose (Rust)

Files: `crates/goose-provider-types/src/retry.rs` (policy + trait), `crates/goose-providers/src/http_status.rs` (header parsing + status mapping).

### 7.1 Constants — retry.rs:8-11

`DEFAULT_MAX_RETRIES = 3`, `DEFAULT_INITIAL_RETRY_INTERVAL_MS = 1000`, `DEFAULT_BACKOFF_MULTIPLIER = 2.0`, `DEFAULT_MAX_RETRY_INTERVAL_MS = 30_000`.

### 7.2 Delay — `delay_for_attempt` retry.rs:65-81

attempt 0 → 0 ms; `base = initial * mult^(attempt-1)`; `capped = min(base, max_interval)`; jitter multiplicative uniform `[0.8, 1.2]`: `0.8 + rand*0.4` (76-78). Jitter applied AFTER the cap but is symmetric around 1.0, so the result stays within ±20% of the cap — unlike hermes, the max invariant is only softly violated (max reachable = 1.2 × cap).

### 7.3 Retry-After parsing — http_status.rs

- **Hard sanity cap** `MAX_RETRY_AFTER_SECS = 3600.0` (1 hour) with the exact abuse rationale: "a malformed 429 with `retry_after_seconds: 1e30` (or a far-future HTTP-date) should degrade to 'no retry hint' rather than freeze the agent or panic when converting to Duration" (http_status.rs:32-37).
- Precedence: body `error.metadata.retry_after_seconds` (OpenRouter float seconds) > `Retry-After` header (http_status.rs:43-59).
- `duration_from_finite_secs`: rejects NaN/negative/non-finite, clamps to 1 h (64-70).
- Header parse per RFC 7231: integer seconds, or HTTP-date in all three forms (IMF-fixdate, RFC 850, asctime) (79-108). **Past date → `Duration::ZERO` ("retry now") deliberately honored** — clock skew + latency commonly produce past dates, and dropping to exponential backoff would add delay against an explicit server hint (comment 72-78, test 426-436).
- Status mapping (http_status.rs:270-300): 400 → RequestFailed unless context-length-exceeded; 429 → `RateLimitExceeded { retry_delay }` filled afterwards in `handle_status` (345-352); 5xx → ServerError; others → RequestFailed.

### 7.4 Classification — `should_retry` retry.rs:100-109

RateLimitExceeded / ServerError / NetworkError → always; RequestFailed (4xx) → retried by DEFAULT unless `transient_only` config or a **permanent-failure marker** — Anthropic immutable `thinking`-block 400s whose identical payload is rebuilt each retry can never succeed (markers at retry.rs:88-92, tests 274-299). Everything else (auth, invalid request types) → never. Auth gets ONE separate credential-refresh retry independent of max_retries (204-223). `GOOSE_PROVIDER_SKIP_BACKOFF` env skips sleeps (test hook, 242-252).

### 7.5 Integration

Trait method `Provider::retry_config()` gives per-provider override of the whole config (retry.rs:156-179, 183-186); blanket impl wraps any provider op (`with_retry`), and server-provided `RateLimitExceeded.retry_delay` takes precedence over computed backoff (135-141, 234-240).

### 7.6 Tests

Inline in retry.rs (263-346): classification matrix incl. permanent thinking-block 400 never retried; http_status.rs tests (391-490): body-over-header precedence, negative/NaN rejected, past date = 0, future date window (~45 s asserted in [30,60]), RFC 850 + asctime forms, absurd `1e30` clamped to 1 h without panic.

---

## 8. Cross-repo comparison

| Concern | opencode | pi-mono (provider-retry) | hermes | aider | codex | gemini-cli | goose |
|---|---|---|---|---|---|---|---|
| Initial delay | 2 s | 0.5 s | 2 s (RL) / 5 s (invalid) | 0.125 s | 200 ms | 5 s | 1 s |
| Factor | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| Jitter | +[0,25%] | −[0,25%] (SDK) | +[0,50%] after cap | none | ×[0.9,1.1] | ±30% sym / +[0,20%] quota | ×[0.8,1.2] |
| Max delay (no server hint) | 30 s | 8 s | 60 s (RL) / 120 s | 60 s (stops) | none (attempt-capped) | 30 s | 30 s |
| Max attempts | 5 | policy (SDK-like 2) | 3 (cfg) | implicit ~8 | 4 req / 5 stream | 10 | 3 |
| retry-after-ms header | YES | YES | no | no | no | no | no (body float secs) |
| retry-after seconds | YES | YES | float-only in main loop | no | no (message regex) | no (RetryInfo proto) | YES |
| retry-after HTTP-date | YES (future only) | YES (Δ, may go negative→max(0)) | YES (util; NOT in main RL loop) | no | no | no | YES (all 3 forms; past→0) |
| Absurd server value | clamp 2^31−1 | THROW >60 s | min(x,600) | n/a | n/a | n/a | clamp 3600 s |
| Past HTTP-date | ignored → backoff | negative → 0 (sleep floor) | → 0 s | n/a | n/a | n/a | → 0 s "retry now" |
| Budget/quota 429 NOT retried | separated (upsell) | YES (tier-0 pattern) | classifier verdict | YES (402 credits) | QuotaExceeded enum | TerminalQuotaError | via markers only |
| Network error retried | yes (pattern) | yes (status undefined) | yes | yes (APIConnection) | yes (retry_transport) | yes (codes+cause chain) | yes (NetworkError) |
| Test injectability | `random` param | injectable clock? no; short delays | pure functions | none | range-window e2e | vi fake timers + range | inline unit tests |

Strongest consensus points (multi-repo independent convergence):
1. Quota/budget walls must be classified separately from transient rate limits (pi-mono, aider, gemini-cli, opencode, codex-enum; FAR-Lab already does this at http.ts:423-434 and openalex.ts:120-133).
2. Jitter belongs in every exponential backoff (6/7 add it; aider and pi-mono system A are the exceptions).
3. Pure-function delay/classification separated from the loop driver (opencode `delay/random`, hermes `jittered_backoff`, goose `delay_for_attempt`) is what makes the behavior testable.

---

## 9. PORT DESIGN DRAFT for FAR-Lab

### 9.1 Landing zone (verified current state)

- `src/providers/http.ts`: `MAX_TRANSPORT_RETRIES = 2`, `TRANSPORT_BACKOFF_MS = [1_000, 3_000]` fixed table (http.ts:43-44); retry decision by failure kind at http.ts:683-693 — `rate_limited | timeout | transient-5xx` only; sleep picks the table index (692); no header parsing, no jitter; total budget 120 s inclusive (http.ts:41, 602-610); 429 quota-wall detection `QUOTA_ERROR_CODES {'1113','insufficient_quota'}` + message regex (http.ts:55-57, 423-434); abort/timeout classified retryable, other network-level failures NOT retried (http.ts:444-458).
- `src/sources/openalex.ts`: single 429 retry with fixed 3 000 ms backoff (openalex.ts:9-10, 123-136); budget-exhaustion 429 (`/insufficient budget|resets at/i`) deliberately NOT retried (openalex.ts:120-133).
- Blocker for header use in the retrieval plane: `FetchResponseLike`/`HttpGetResult` do not expose headers (`src/sources/http.ts:7-11, 33-39`) — the OpenAlex comment already states "Retry-After is not exposed by the fetch contract" (openalex.ts:9).
- Constraints: zod-only runtime deps, TS strict, Node 22, no new deps — everything below is a hand-written pure module (~120 lines) plus contract widening.

### 9.2 New module: `src/shared/retry-policy.ts` (pure, dependency-free)

Two exported pure functions + one classification helper. Every repo whose delay logic is unit-testable does it this way (opencode retry.ts:47/80, goose retry.rs:65, hermes retry_utils.py:90); FAR-Lab should keep the loop drivers (http.ts / openalex.ts) as-is and only swap the delay computation.

**`parseRetryAfter(headers, now = Date.now()): number | null`** — adopts **goose's parse layer** with opencode's two-header extension:

- Input: a minimal `{ get(name: string): string | null }` view (works for both `Headers` and plain records — keeps providers/http.ts's `Response.headers` and a widened sources FetchResponseLike compatible without new types at the seam).
- Precedence (opencode order, retry.ts:51-71): `retry-after-ms` → float ms; else `retry-after` → float seconds ×1000; else `Date.parse` HTTP-date delta (accepts IMF-fixdate which is what JS `Date.parse` handles; goose additionally parses RFC-850/asctime at http_status.rs:94-108 — SKIP those two obsolete forms; `Date.parse` coverage is sufficient and keeps zero deps).
- Edge rules (each from a verified defect in some repo):
  - missing/unparseable/NaN → `null` (caller falls back to computed backoff). opencode test 68-76.
  - negative or past-date delta → **0** ("retry now"), goose http_status.rs:72-88 — do NOT silently drop an explicit server hint the way opencode does (a past hint means the window already reset).
  - absurd values → clamp to **`RETRY_AFTER_ABSOLUTE_CAP_MS = 3_600_000`** (goose's 1 h, http_status.rs:32-37). Rationale over opencode's 2^31 clamp: the 32-bit clamp is a runtime-safety bound, not a policy bound — honoring a corrupt 12-day hint stalls the pipeline; 1 h is beyond any legitimate LLM/OpenAlex rate window while staying inside FAR-Lab's own timeout handling (the 120 s total budget in http.ts will still cut the wait — see 9.4).
  - non-finite (`Infinity`, `NaN`) → `null` (goose duration_from_finite_secs http_status.rs:64-70).
- NOT adopted: pi-mono's throw-above-60 s (provider-retry.ts:37-49). FAR-Lab's W1 discipline is fail-closed with an honest message, but throwing on a *server hint* conflates "server said something absurd" with "request failed"; clamping + proceeding keeps the failure classification owned by classifyHttpStatus. NOT adopted: goose's body `error.metadata.retry_after_seconds` precedence (http_status.rs:43-59) — no current FAR-Lab provider sends it; add only if a live adapter is observed to (YAGNI, recorded as extension point).

**`computeBackoff(attempt, retryAfterMs, random = Math.random()): number`**

- `attempt` is 1-based (index of the failure being slept off), matching opencode retry.ts:47 and hermes retry_utils.py:96.
- Base: `INITIAL_MS = 1_000` (keeps FAR-Lab's current first-retry latency), `FACTOR = 2`, `MAX_BACKOFF_MS = 30_000` (opencode's no-header cap, retry.ts:29; also gemini 30 s and goose 30 s — the modal cap across repos).
- Jitter: **opencode's additive proportional** — `ceil(base * (1 + JITTER_RATIO * random))` with `JITTER_RATIO = 0.25` (retry.ts:80-83). Why over the alternatives: (a) it never reduces the delay below the computed base, so it cannot cause under-waiting a rate window (unlike pi-mono's downward-only or codex/goose symmetric); (b) it is a single multiplication on the already-capped base so the cap stays a true maximum (unlike hermes's post-cap addition, retry_utils.py:117-128, where 120 s cap can become 180 s); (c) injectable `random` gives exact deterministic tests (opencode proves this at retry.test.ts:38-47).
- Server-hint combination rule: if `retryAfterMs !== null`, `delay = clamp(retryAfterMs, 0, ABSOLUTE_CAP)` **plus** the same proportional jitter `[0, +25%]` (gemini-cli's quota rule of never going BELOW the server minimum, retry.ts:476-479, but with our uniform jitter formula). If the clamped server hint exceeds the remaining total budget, the caller's budget check (unchanged) fails visibly — this is the FAR-Lab-native answer to "server says wait longer than cap": we do not throw and we do not blindly sleep past budget; we surface `timeout` with the server's requested wait in the message.

**`isTransient429(bodyText, code?): 'transient' | 'budget'`** — not strictly needed in shared form: http.ts already owns `QUOTA_ERROR_CODES`/`QUOTA_MESSAGE_RE` (55-57) and openalex.ts owns its budget regex (132). Keep classification where it lives (one invariant, one owner); the shared module owns only *time*. Optionally export a shared `BUDGET_429_RE` later if a third call site appears.

### 9.3 Consumption — minimal diffs

**`src/providers/http.ts`** (keeps its loop, classification, budget envelope untouched):
- Read headers on non-200: `parseRetryAfter({ get: (n) => res.headers.get(n) })` next to `classifyHttpStatus` (after http.ts:622-626).
- Replace line 692's fixed table lookup:
  ```ts
  const hint = parseRetryAfter(headerView);
  await sleep(computeBackoff(transportRetries + 1, hint, deps.random));
  ```
  with `random?: () => number` added to `TransportDeps` (http.ts:529-534) exactly like `fetchImpl`/`sleep` — the existing seam pattern.
- `TRANSPORT_BACKOFF_MS` table (44) is deleted; `MAX_TRANSPORT_RETRIES = 2` stays. Sequences become 1000→2000 (no hint) — strictly more conservative than today's 1000→3000 only when jitter rolls low, and hint-aware when the server speaks.
- Budget-429 rule is untouched: classification happens before any delay computation (http.ts:423-434), so '1113'/'insufficient_quota' never reaches `computeBackoff`.

**`src/sources/http.ts` + `src/sources/openalex.ts`**:
- Widen `FetchResponseLike` with `headers?: { get(name: string): string | null }` (optional — existing fakes keep compiling; `HttpGetResult` gains `retryAfterMs: number | null` computed inside `httpGet`, so every current and future adapter gets the hint for free without each parsing headers).
- In `getWith429Retry` (openalex.ts:123-136): sleep `computeBackoff(1, first.retryAfterMs)` instead of the fixed 3 000; keep exactly ONE retry (evidence comment at 117-122 still holds: budget-429 short-circuits before the sleep at line 132, unchanged).
- Cross-cutting rule preserved: the budget-429 non-retry decision (openalex.ts:132) must stay text-based BEFORE any delay computation — a server `Retry-After` on a budget-429 response must not resurrect the retry. This ordering is the port's most important invariant (mirrors pi-mono tier-0-first at retry.ts:223-228).

### 9.4 Edge cases explicitly resolved

| Case | Behavior | Precedent |
|---|---|---|
| `retry-after: 30` (seconds) | 30 000 ms + [0,25%] jitter | opencode retry.ts:59-65 |
| `retry-after-ms: 1500` | 1 500 ms + jitter | opencode retry.ts:51-57 |
| `retry-after: <HTTP-date now+20s>` | ~20 000 ms + jitter | opencode retry.ts:66-71, test 60-66 |
| past HTTP-date / negative | 0 (retry immediately) | goose http_status.rs:79-88 |
| `retry-after: banana` / NaN / Infinity | null → computed exponential | opencode test 68-76; goose 64-70 |
| `retry-after-ms: 999999999999` | clamp to 3 600 000 ms | goose http_status.rs:32-37,68 |
| server hint > remaining 120 s budget | budget check fires first → honest `timeout` failure naming the server-requested wait | FAR-Lab http.ts:602-610 (existing behavior, now informative) |
| attempt cap exhausted (2 retries) | unchanged: fail with "(retry budget of 2 exhausted)" | FAR-Lab http.ts:684-690 |
| budget-429 (Z.ai 1113 / OpenAlex "Insufficient budget") | never delayed, never retried | FAR-Lab http.ts:423-434, openalex.ts:120-133; corroborated pi-mono retry.ts:7-24, aider exceptions.py:104-112 |
| first attempt | never pre-delayed (delay computed only after a failure) | all 7 repos |

### 9.5 Test plan (deterministic, no real sleeping)

All on the pure functions + the existing injected seams; the repos' own test designs are the reference (opencode injects `random`; codex asserts jitter windows 180-220 ms at retry_after.rs:35-39; gemini asserts range [0.7×,1.3×] at retry.test.ts:279-333).

`parseRetryAfter` (pure, `now` injectable for dates):
1. seconds "30" → 30000; "0" → 0; "1.5" → 1500 (fractional seconds — opencode uses float parse, retry.ts:61).
2. `retry-after-ms` "1500" → 1500; **precedence**: both headers present → ms header wins.
3. HTTP-date `new Date(now + 20_000).toUTCString()` with `now` injected → in [19000, 20000] (tolerance for ceil).
4. past date (`now - 5000`) → **0** (not null — this is the deliberate divergence from opencode; a regression here re-introduces the under-wait bug goose documents).
5. "not-a-number", "", missing header, `NaN`, `Infinity` → null.
6. negative numeric ("-5") → 0.
7. "999999999999" → 3_600_000 (clamp); "7200" (2 h, legitimate-looking) → 3_600_000.
8. header-name case-insensitivity via the `get` view is the caller's duty — test the record-backed view with both `Retry-After` and `retry-after` keys.

`computeBackoff` (pure, `random` injectable):
1. Sequence with `random=0`, no hint: attempts 1..6 → [1000, 2000, 4000, 8000, 16000, 30000] then 30000 (cap; opencode test 36-40 shape).
2. `random=1` → exactly base×1.25 each attempt, capped at 30000 (proves jitter never exceeds cap — the hermes post-cap bug class, retry_utils.py:117-128).
3. `random=0.999…` never yields below base (no under-wait; pi-mono downward jitter would).
4. Hint 1500, attempts 1-3, `random=0` → 1500 each (hint wins over exponential, opencode test 50-53).
5. Hint 0 → delay 0 (retry immediately, still counts an attempt).
6. Hint 45_000 (above 30 s cap, below absolute cap) → 45_000: the server hint overrides the politeness cap up to the absolute cap, mirroring opencode's headers-present asymmetry (retry.ts:73) without its 2^31 excess.
7. Non-integer inputs rejected by types (attempt ≥ 1, finite) — assert via type-level tests or runtime guard returning base.

Integration (existing seams, fake clocks — no new deps):
8. http.ts: inject `sleep` (existing `TransportDeps.sleep`, http.ts:531) + `random` + a `fetchImpl` that returns 429 twice then 200 with `retry-after: 1` → assert sleep called with 1000±jitter then ~1000, then success; assert attempts bounded at 3 total calls.
9. http.ts: 429 + code 1113 → ZERO sleeps, immediate fail-closed (budget-429 regression guard, the FAR-Lab rule).
10. http.ts: server hint 90 s with 120 s budget, fetch hangs → total-budget timeout message includes the requested wait (honest failure, no fabricated wait).
11. openalex.ts: fake fetch returning 429 + `retry-after: 2` then 200 → exactly 2 calls, sleep ≈ 2000; body "Insufficient budget ... Resets at midnight UTC" → 1 call, 0 sleeps.
12. Jitter-window integration (codex style): 50 iterations of computeBackoff(1, null) with real `Math.random` all within [1000, 1250] — catches any future formula change that breaks the invariant.

### 9.5.1 What is deliberately NOT ported

- Hermetic per-provider delay tables (hermes Z.AI 30/60/90/120, retry_utils.py:27): no FAR-Lab provider has shown that failure shape; revisit with live evidence.
- Model-fallback-on-persistent-429 (gemini retry.ts:397-418) and transport fallback (codex responses_retry.rs:85-100): separate capability, out of scope for a delay module.
- Message-regex delay extraction (codex sse/responses.rs:654-677): FAR-Lab providers are OpenAI-compatible with real headers.
- Retry-status UI callbacks (opencode `set`, pi-mono callbacks): FAR-Lab receipts already carry latency/usage; add only if the pipeline surfaces waits to the operator.

---

## 10. Per-repo one-line algorithm specs

- **opencode**: `ceil(2000·2^(a−1)·(1+0.25·rand))` capped 30 s headerless / 2^31−1 with headers; `retry-after-ms` > `retry-after` (secs | future-HTTP-date) > exponential; 5 retries; regex-family message classification + 5xx-always; ContextOverflow never.
- **pi-mono A**: `base·2^(a−1)`, no jitter, no cap; tier-0 quota/billing patterns beat tier-1 transient patterns; aborts terminal; callback-instrumented loop.
- **pi-mono B**: SDK mirror — 408/409/429/5xx/network + `x-should-retry`; `retry-after-ms` > `retry-after`(s|date) > `min(0.5·2^i,8)s·(1−0.25·rand)`; server delay > 60 s → THROW.
- **hermes-agent**: `min(2·2^(a−1),60) + U[0, 0.5·delay]` (jitter after cap) for rate limits, `min(5·2^(a−1),120)+jitter` for invalid responses; `Retry-After` float-only capped 600 s in the main loop; Z.AI-overload narrow-shape escalates 30/60/90/120 s after 3 short tries; default 3 retries.
- **aider**: `0.125·2^n` seconds, sleep-and-double until > 60 s stops; no jitter, no headers; litellm exception table decides; 402-insufficient-credits and context-window errors never retried.
- **codex**: stream `200ms·2^(a−1)·U[0.9,1.1]` (no cap, 4/5 retries) preferring server delay parsed from the SSE message "try again in Ns/ms" regex; transport layer same jitter on configurable base with explicit retry_429/retry_5xx/retry_transport flags.
- **gemini-cli**: `clamp(cur·(1+0.3·(2·rand−1)), ≥0)`, cur = 5000 doubling to 30 000, 10 attempts; quota path `max(cur, serverRetryMs)` + up-to-+20% jitter (never below server minimum); 429/499/5xx + network-code list with cause-chain walk; TerminalQuotaError → 3 silent retries then fallback-model callback; on-retry system-prompt nudging for invalid streams.
- **goose**: attempt0 = 0; `min(1000·2^(a−1), 30 000)·U[0.8,1.2]`, 3 retries; `RateLimitExceeded.retry_delay` from body-metadata-float-seconds > `Retry-After` (int secs | HTTP-date all 3 forms, past→0), clamped 1 h; RateLimit/Server/Network always retried, 4xx retried unless transient_only or permanent-markers (Anthropic thinking blocks); one separate auth-refresh retry.

---

## 11. Risk register for the port

1. **Header exposure in the retrieval plane** is a contract change (`FetchResponseLike`, http.ts:7-11): every existing fake fetch in tests must keep compiling — the `headers?` field must be optional and `HttpGetResult.retryAfterMs` computed defensively (null when the fake provides none).
2. **Jitter vs existing latency budgets**: today's fixed [1000, 3000] becomes [1000, 1250] + [2000, 2500]; with the 120 s total budget and 2 retries this is strictly faster — but any test asserting exact 3000 ms sleeps will break and must move to window assertions (codex range-window pattern).
3. **Server-hint-over-poleness-cap** (45 s hint honored against a 30 s cap) is a semantic choice; if a FAR-Lab operator later wants hard 30 s waits, the absolute cap and the politeness cap must be re-read together — keep them as two named constants with the goose/opencode citations in comments so the intent survives.
