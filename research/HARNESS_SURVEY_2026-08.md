# Agent-Harness Survey: Six External Projects (2026-08-22)

**TYPE:** Decision research — harness-layer architecture absorption for FAR-Lab.
**METHOD:** 6 parallel research agents (web + repo source via zread) + 1 local architecture survey; cross-compared by main agent; two spot-checks (leaked-source repo structure verified directly; Codex platform blog blocked 403, agent-sourced only).
**EVIDENCE CEILING:** No external project was executed, cloned or integrated. Per-project claims are source-reading + official-docs level; star counts and freshness are approximate. Design patterns, not code, were transferred.

---

## 1. Local baseline (what FAR-Lab actually has)

Verdict on "severely broken": **partially true, not globally true.**

Present and solid (KEEP): SSE event stream with cursor resume (`src/server/api.ts:315`), per-stage checkpoints + resume semantics (`src/persistence/store.ts:214`, `src/app/orchestrator.ts:237`), append-only event audit + provenance receipts per model call, ModelProvider port abstraction, bounded in-stage concurrency, 644/644 tests green.

Missing (the real gap — this IS the harness layer):

| Gap | Severity | Evidence |
|---|---|---|
| Agent loop (LLM→tools→feed-back) | fatal | `orchestrator.ts:234` is a fixed `for(stage of STAGE_ORDER)`; `pipeline/llm.ts:28` is one-shot call-return |
| Tool system (registry/schema/dispatch) | severe | no ToolRegistry anywhere; tool behavior hardcoded inside stages |
| Context management (compaction/budget/memory) | severe | only display-layer truncation (`evidence.ts:308`) |
| Extension mechanism (hooks/plugins/MCP) | medium | only compile-time ports (`shared/ports.ts`) |
| Telemetry export / permission tiers | medium | local SQLite only; ad-hoc `BindingApproval` only |

Consequence: the product cannot do iterative hypothesis refinement ("evidence insufficient → re-search"), dynamic branching, or multi-turn tool-using reasoning. It is a script pipeline, not a research agent.

## 2. Six projects, one-page each

### 2.1 "Dancing Harness" → UNRESOLVED identity
No project by that name exists (GitHub/npm/CN+EN variants). Best-fit proxy: **HKUDS/OpenHarness** (Python, MIT, ~15.5k★, created 2026-04, stalled ~2.5 months). Worth stealing regardless of identity: PermissionChecker evaluation order (hardcoded deny → tool lists → glob paths → command fnmatch → mode), 3-layer compaction (1725-line `services/compact/`), session JSON snapshots with atomic writes. Zero direct TS reuse.

### 2.2 OpenAI Codex (openai/codex, Rust, Apache-2.0)
"Recently open-sourced harness" = 2026-08-19 "Codex as a platform": `codex exec`, TS/Python SDK (`sdk/`), and **app-server** (JSON-RPC over stdio/UDS/WS) as the three integration faces.
- **SQ/EQ typed protocol**: client enqueues `Submission(Op)`, agent emits `Event(EventMsg)`, both `#[non_exhaustive]`, request-id + W3C traceparent + parent/root_turn_id causality (`codex-rs/protocol/src/protocol.rs`). Core never touches sockets.
- **Rollout persistence**: append-only JSONL + zstd + reverse scanner + SQLite index with 49 numbered migrations; UUIDv7 thread ids (`codex-rs/rollout/`).
- Compaction written as a handoff summary for a successor LLM (progress/decisions/remaining work), triggered by token budget (`core/src/compact*.rs`).
- Permissions: approval tiers × platform sandboxes (Seatbelt/bwrap+Landlock/RestrictedToken) × execpolicy WASM rule engine.
- Multi-agent: typed Spawn/Message/Followup/Result communication, depth+concurrency caps, persistent agent graph.
- External code contributions effectively closed. Blog URL 403 on spot-check (agent-sourced, UNVERIFIED by me).

### 2.3 Claude Code leaked source (xorespesp/claude-code — sourcemap reconstruction, verified live)
~2006 TS files; structure spot-checked: `src/QueryEngine.ts`, `Tool.ts`, `query.ts`, `skills/`, `hooks/` all present.
- **Stateless query loop**: `query()` pure-ish, Config/Deps/State separated; QueryEngine holds session state (`QueryEngine.ts`, `query.ts` L181-217).
- **Tool interface**: single generic `Tool.ts` (Zod input/output schema + call/render); registry passes feature-flag → permission → MCP-merge pipeline; large results spill to disk and return a file path (Bash 30k chars, MCP 100k).
- **3-layer compaction**: microcompact (zero-API-cost trimming of old tool results) → session-memory compaction (pre-extracted summary, no LLM call) → full compact via dedicated sub-agent; 200k window reserves 20k for compact output (p99.99-derived).
- **Sub-agent context economics**: Explore/Plan agents set `omitClaudeMd` (measured 5–15 Gtok/week savings at 34M generations); fork mode shares prompt prefix for cache hits; permission inheritance explicit.
- Prompt budget table per source (system/CLAUDE.md/messages/agents/skills/compact buffer); conditional skills activate on `paths` frontmatter match; 7 permission modes; streaming tool execution (tool runs while output still streaming).
- **Legal note: this is proprietary reconstructed code. Study the designs; never copy code into FAR-Lab. Repo carries takedown risk.**

### 2.4 OpenCode (sst/opencode → anomalyco/opencode; Bun+TS, Effect 4 beta, MIT verified)
Never rewritten in Go (that is the unrelated `opencode-ai/opencode` Go project). ~199k★, very active.
- **Event-first**: LLM stream events are persisted as append-only session events, then projected to SSE consumers — UI is a projection, DB is the truth (`core/src/session/runner/`, `publish-llm-event.ts`).
- Tool `Def{parameters: Effect Schema, execute(args, ctx)}`; wrap layer does validation and **feeds the validation-error message back to the model**; ctx has built-in `ask()` permission; output truncation + OTel spans.
- Provider layering: models.dev catalog + user config + plugin-injected providers; OpenAICompatibleChat plugs into any gateway.
- Permissions: deny>ask>allow, fail-closed, agent→global→default chain, every decision carries source (messageID/callID).
- Compaction with overflow recovery (retry round once, guard against infinite compact loops); sanitized export/share.
- Deep Effect+Bun coupling → copy patterns, do not vendor.

### 2.5 PiAgent → pi (badlogic/pi-mono → earendil-works/pi; TS, MIT, ~95k★)
Minimal kernel philosophy; now the engine of OpenClaw.
- `agentLoop(prompts, context, config, queue, streamFn)` ≈ two primitives (LLM call + tool execute loop); `AgentTool{name, TypeBox schema, execute, onUpdate, executionMode}`; tools must throw (loop converts to isError for the model).
- **Two-stage context pipeline**: `transformContext` (prune/inject — app-controlled projection) then `convertToLlm` (filter UI-only messages). Compaction is a hook, not a built-in policy.
- **AgentMessage declaration merging**: app-specific state legally lives in the session record but is invisible to the LLM — record vs model-view separation.
- `beforeToolCall/afterToolCall` hooks can block/rewrite/`terminate:true`; extension lifecycle bus (`nextStartup…turnEnd`, `turnEnd` may rewrite messages → self-extension); steering/followUp queues for mid-run intervention.
- Deliberately NO built-in sub-agents ("not a user-space feature"); SQLite backend split out; RPC mode (stdin/stdout JSON) for embedding.
- pi proves a 95k★ product runs on a tiny protocol kernel + all behavior external. `pi-ai`/`pi-agent-core` are the only npm-consumable TS packages among the six — candidate for dependency evaluation (see §4).

### 2.6 "Open Cloud" → OpenClaw (openclaw/openclaw; TS monorepo, MIT)
Disambiguated over OpenCloud (file-sync, irrelevant) and openclaude (inactive fork).
- Gateway (local control plane: sessions/tools/events/channels) + Node (remote execution extension); embedded agent runner (attempt loop, compaction, transcript) with reusable core extracted to `packages/agent-core/`.
- **Exec approval bound to exact context**: precise cmd/cwd/env + filesystem snapshot + TTL approval state machine; tool policy + Docker sandbox modes + fs-policy drift detection.
- **Ingress persistence queue**: inbound messages land in a durable queue before drain — crash-safe channel ingestion.
- Session = append-only event log; dual SQLite (global state-db + per-agent db); skills with 6 priority tiers + manifest; plugin SDK in-process (declared trusted computing base); honest security-boundary docs (what is UX vs what is a real boundary).
- Same stack family as FAR-Lab (Node/TS/SQLite/event log).

## 3. Convergent mechanisms (independent agreement = strongest evidence)

All/most of the six independently converge on:

1. **Typed agent loop with explicit protocol** (Codex Op/Event; Claude Code QueryEngine+query(); OpenCode runner; pi agentLoop; OpenHarness run_query; OpenClaw attempt loop). Non-negotiable foundation.
2. **Append-only event/session log as source of truth; UI is a projection** (Codex rollout, OpenCode, OpenClaw, OpenHarness snapshots; Claude Code session written before loop start). FAR-Lab already has the right primitive — extend it, don't replace it.
3. **Tool = typed schema + registry + validation errors fed back to the model** (Claude Code Zod Tool.ts; OpenCode Def+wrap; pi AgentTool; Codex ToolSpec; OpenHarness Pydantic). Plus result-size discipline (truncate or spill-to-file).
4. **Layered compaction by cost** (zero-cost trim → cached/pre-extracted summary → full LLM summary; budget-triggered; summary framed as handoff-to-successor). Claude Code / OpenHarness / Codex / OpenCode / OpenClaw all have variants.
5. **Deny>ask>allow fail-closed permissions bound to exact action context**, with TTL and source traceability (OpenClaw, OpenCode, Codex, OpenHarness tiers, Claude Code modes).
6. **Sub-agents with context isolation + cost economics + depth/concurrency caps** (Claude Code omitClaudeMd+fork-cache; Codex agent graph; OpenCode task tool). Counterpoint: pi omits sub-agents by philosophy.
7. **Extension bus (lifecycle hooks) + skills + MCP** as the universal mechanism for behavior beyond the kernel (all six).

## 4. Decisions (evidence-research vocabulary)

| Verdict | Target | Reason |
|---|---|---|
| **REJECT** | VENDOR/FORK any of the six wholesale | Codex=Rust; OpenHarness=Python+stalled; OpenCode=Effect/Bun-coupled; OpenClaw=full product; pi=monorepo w/ TUI stack; leaked Claude Code=legally unusable code |
| **REJECT** | Copying leaked Claude Code code into the repo | Proprietary reconstructed source; legal + takedown risk. Design study only |
| **KEEP** | Existing 13-stage pipeline as the linear backbone | 644 green tests, checkpoint/resume, provenance receipts all work; pipeline is not the defect |
| **BUILD** | FAR-Lab's own minimal agent kernel (~300–500 LOC): loop + typed Tool interface (zod) + beforeToolCall/afterToolCall hooks + compaction policy slot + steering queue | Receipts, append-only events, checkpoints and leases are FAR-Lab invariants an external kernel would not honor; pi proves the kernel can be tiny |
| **ADOPT (design)** | Codex SQ/EQ Op/Event protocol shape; Claude Code 3-layer compaction + per-source token budget table + result spill-to-disk; OpenCode event-first-persist-then-project + validation-error-feedback + deny>ask>allow; OpenClaw ingress queue + TTL approval + honest security docs; pi transformContext/convertToLlm separation + declaration-merging records; OpenHarness permission evaluation order | Convergent, battle-tested, stack-neutral |
| **EXTRACT→evaluate** | `pi-ai` / `pi-agent-core` as npm dependencies | Only TS-reusable candidates; must pass oss-due-diligence first; initial lean: reference implementation, not dependency — provider layer already works and receipts must wrap every call |
| **DEFER** | Telemetry export, MCP server mode | Real but not the core-loop blocker |

## 5. Phased absorption plan (gates: architecture-convergence + verification per phase)

- **H1 Kernel + tool protocol** (new files; do NOT touch `orchestrator.ts`/`store.ts` — sibling session B3 is mid-edit on them): `agent/loop.ts`, `agent/tool.ts` (zod schema + execute + isError feedback), Op/Event types, event-first persistence through existing store. First consumer: iterative hypothesis-refinement stage (re-search on insufficient evidence).
- **H2 Context management**: token budget table per source; microcompact (trim old tool results) → pre-extracted summary → full handoff compact; measured against real long runs.
- **H3 Sub-agents**: parallel pro/contra evidence agents with isolated context + depth/concurrency caps; results land as append-only events (audit-friendly).
- **H4 Extension bus**: lifecycle hooks; skills as markdown+manifest; MCP client. Pipeline stages optionally re-expressed as kernel extensions (pi model) — only after H1-H3 prove out.
- **H5 Permissions + telemetry**: deny>ask>allow tiers for tools (esp. experiment execution — extends existing BindingApproval), TTL approval; cost/token aggregation per run.

## 6. Uncertainties (do not silently promote to facts)

- "Dancing Harness" identity unresolved; OpenHarness is a proxy, not confirmed target.
- Codex platform blog not personally verified (403); star counts everywhere approximate.
- OpenHarness freshness (2.5-month stall); pi sub-200-line loop claim not counted by us.
- No external project was executed or benchmarked; "best mechanism" judgments are design-level, not measured on FAR-Lab workloads.
