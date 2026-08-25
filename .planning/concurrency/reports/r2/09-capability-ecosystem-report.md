# R2 Lane 09 — Capability Ecosystem Report

Branch: `ws/r2/09-capability-ecosystem` (from `baseline/parallel-r2` = `47cc373`).
Worktree: `work/r2-09-capability-ecosystem`.

## 1. Commits

| SHA | Subject |
|---|---|
| `e412397` | feat(capabilities): unified session capability assembly + identity plane + MCP receipts |
| `b0d21e0` | feat(capabilities): counter-evidence-discipline domain pack via real plugin-import path |
| (this commit) | docs(concurrency): lane 09 report + handoff 09→08 |

## 2. What this lane built and why (problem → solution)

Inspection at the baseline found the capability plane had good PRIMITIVES
(`ToolRegistry`, stdio+HTTP MCP clients, skills loader, hook-rule compiler,
plugin host) but:

1. **Two disconnected, hard-coded assemblies.** `refine.ts` assembled its own
   registry/permissions/skills/hooks inline; `conversation-agent.ts` (lane 08's
   resident agent — the product's primary surface) built a second inline
   registry connected to **zero** integrations. A researcher who enables an MCP
   server or skill in settings got no effect on any conversation.
2. **No identity/provenance plane.** Tools had no version, source or
   availability state; the model-facing catalog was `{name, description, args}`
   and could not tell the model WHY a capability was absent.
3. **No discovery.** Nothing let the agent enumerate the capability plane;
   composition relied on hard-coded prompt knowledge of tool names.
4. **No per-call provenance for external tool calls** (MCP calls left no
   receipts; retrieval and model calls did).

Delivered:

- **`src/agent/capabilities/assembly.ts` — `assembleSessionCapabilities`**:
  the ONE authoritative session composition (builtin tools + stored
  integrations → registry, permission engine, hook bus, skill injection,
  capability records, `close()`). Least-privilege admission: an ENABLED MCP
  server joins only when its researcher-declared `riskClass` is in the
  capability policy; refused servers are visible with the policy reason, never
  spawned. Lifecycle is session-scoped: each session rebuilds from current
  store truth, which is how enable/disable/update/removal take effect without
  in-place registry mutation (kernel registries stay append-only).
- **`src/agent/capabilities/catalog.ts` — identity + discovery.**
  `ToolCapabilityRecord` (id/kind/source/version/riskClass/trust/serverHints/
  availability) and the `list_capabilities` tool the assembly registers: the
  model now SEES available tools with identity attributes AND unavailable
  capabilities with honest reasons (refused/failed/disabled), plus injected
  skills and the admission policy. Selection/composition moves from prompt
  memory to metadata.
- **Identity plane on `AgentTool`** (`version`, `source`, `annotations`) and an
  enriched `catalog()` — model-facing entries now carry riskClass/trust/
  version/source.
- **MCP layer hardening**: spec tool `annotations` parsed on both transports
  (UNTRUSTED display-only metadata — proven by test: a server declaring
  `readOnlyHint: true` with integration riskClass `execute` is still
  policy-refused); `serverInfo {name, version}` captured from the initialize
  handshake and stamped as tool version/provenance; **per-call `tool_exec`
  receipts** (canonical input/output hashes + duration; payloads never
  archived).
- **`refine.ts` migrated** onto the assembly — behavior-preserving (all 6
  existing e2e tests green unchanged, incl. the admission-refusal message
  contract) and now the reference consumer.
- **Domain pack `counter-evidence-discipline`**
  (`skills/packs/counter-evidence-discipline/far-plugin.json`): deep scientific
  semantics — five counter-evidence query families, verdict rubric, absence-of-
  evidence discipline, specificity traps + destructive-ops approval hook rule +
  counter-review composer command. Ships through the REAL plugin-import path
  (manifest validation, staged-disabled, researcher activation).

### Research decisions (bounded, decision-relevant)

- MCP spec tool annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`/
  `openWorldHint`) verified against the current official spec + MCP blog:
  they are explicitly untrustworthy server hints → adopted as metadata only,
  never as admission authority. Spec revision current at 2026-07-28; our
  pinned `2025-06-18` handshake remains a valid negotiated revision.
- **Kept the zero-dependency MCP clients** (vs adopting
  `@modelcontextprotocol/sdk`): the in-repo clients already pass pagination,
  session IDs, SSE-shaped bodies, timeouts and list_changed; the SDK adds a
  supply-chain + dependency-policy surface (lane-15 sign-off) for no capability
  this workspace needs. Documented here as the KEEP decision.

### Deliberate deferrals (with reasons)

- **Output schemas for tools**: `ToolResult.data` stays `unknown`. No consumer
  would validate outputs today (the model reads the payload; receipts hash
  it) — an output-schema engine would be dead surface. Revisit when a consumer
  needs machine-checked tool outputs.
- **Dead surface noted, not deleted**: `command`-kind integrations (domain +
  plugin expansion) have **no runtime consumer** anywhere (verified by grep:
  only schema + import expansion). Removal is a domain change (lane 12
  stewardship + 15 governance); recorded here for the Integrator rather than
  unilaterally deleted.
- **MCP HTTP GET-SSE stream** (server-push `tools/list_changed` on HTTP
  transport): documented limitation of `mcp-http.ts`, unchanged.

## 3. Evidence (commands + exit codes + key output)

All from the lane worktree on 2026-08-25 (Windows, Node per repo toolchain):

| Gate | Command | Result |
|---|---|---|
| Baseline sanity (pre-edit) | `npm ci` (root/web/tui) + `npm run typecheck && npm run build` | exit 0, `GATE_OK` |
| Typecheck (final) | `npm run typecheck` | exit 0 |
| Build (final) | `npm run build` | exit 0 |
| Lint (lane files) | `npx eslint src/agent/ src/plugins/` | clean |
| Capability-plane suites | `npx vitest run tests/agent-refine.test.ts tests/agent-mcp.test.ts tests/mcp-manager.test.ts tests/mcp-http.test.ts tests/agent-skills.test.ts tests/hooks-compose.test.ts tests/plugins.test.ts tests/tool-integration.test.ts` | **8 files / 52 tests passed**, exit 0 |
| New proof suite | `npx vitest run tests/capability-assembly.test.ts` | **8/8 passed**, exit 0 (~4.4s) |
| Full suite | `npm test` | **1448 passed / 4 skipped / 2 failed** (1454 total, 147s). Both failures investigated and OUTSIDE this lane's delta (see below) |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | PASS (exit 0) |

### Full-suite failure triage (both pre-existing, not lane-introduced)

1. `tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection` —
   `expected 95209 to be 3600`. Reproduced at the R2 BASE commit itself
   (`baseline/parallel-r2` = `47cc373`, fresh worktree: 2 failed in the same
   file). Persistence/clock surface; this lane's diff touches none of it
   (`git diff baseline/parallel-r2..HEAD --stat`: only `src/agent/*`,
   `src/plugins` untouched, `skills/packs/**`, one new test file).
   Inherited baseline failure — for the Integrator/lane 13, not fixable here
   without crossing ownership.
2. `tests/agent-mcp.test.ts > times out a hanging request...` —
   `initialize timed out after 150ms`. Green in isolation (twice: capability
   suite run and the 2-file rerun) and the timeout machinery is untouched by
   this lane; the 150ms initialize budget is too tight under full-suite
   parallel load on this machine. Flaky-under-load, pre-existing budget.

Proof-suite coverage (all through the REAL child-process MCP server →
authoritative assembly → authoritative `runAgentLoop`):

1. discovery → real use: `list_capabilities` exposes the MCP tool with
   `version: 3.2.1` (handshake `serverInfo`), `source`, `riskClass`, `trust`,
   `serverHints`; the call round-trips a real subprocess and lands a
   `tool_exec` receipt with 64-hex input/output hashes; transcript entry is
   `untrusted: true`.
2. oversized MCP result (12KB > 6000-char budget) spills to the artifact
   store; the ref resolves to the full payload.
3. server death mid-session: first call OK, second call fails honestly
   (`server exited`), session still completes; the NEXT assembly reconnects
   (registry rebuilt, statuses connected).
4. lying `readOnlyHint: true` on an execute-class server: refused by
   admission policy before any spawn — server self-declaration never widens
   admission.
5. researcher hook rule (`block` on `capfix_*`) denies the call with
   `hook:`-prefixed reason end-to-end through the loop's permission path.
6. broken server (nonexistent executable): per-server `failed` status with
   error; healthy servers and the session unaffected.
7. model-facing `catalog()` carries the identity plane
   (riskClass/trust/version/source) for both builtin and MCP tools.
8. domain pack: real `importPlugin` → staged-disabled → activation → assembly:
   skill relevance-injected into the prompt, destructive-class rule live
   (strictest-wins ask → fail-closed deny headless).

No live-API testing occurred (no real model keys, no external network); the
model side is the repo's deterministic test-stub provider and MCP servers are
local child processes — per the no-live-API policy nothing here is
`BLOCKED-live`.

## 4. Conflict notes (shared files)

- `src/agent/tool.ts`, `mcp.ts`, `mcp-http.ts`, `mcp-manager.ts` — lane-09
  files; `AgentAction`/loop protocol unchanged, so lane 08's loop/compaction
  keep compiling against the enriched (superset) `catalog()` shape; verified by
  full-suite run.
- `src/agent/capabilities/refine.ts` — lane-09 file; migrate kept the
  admission-refusal message contract (`admission policy: <capability> …
  riskClass '<x>'`) that `tests/agent-refine.test.ts` asserts.
- No edits outside the ownership table. In particular **no edits** to
  `src/server/conversation-agent.ts` (08), `src/agent/loop.ts` (08),
  `src/cli/**` (03), `src/domain/**` (12).

## 5. Handoffs

- **Given (OPEN)**: `r2-2026-08-25-from-09-to-08-conversation-capability-assembly.md`
  — wire the resident conversation agent through
  `assembleSessionCapabilities` (exact integration patch included). This is the
  remaining product-level gap: the resident agent still runs its inline
  read-only registry; integrations remain unreachable from conversations until
  08 lands it.
- **Received**: none this round.
- **For the Integrator**: `command`-kind integrations have no runtime consumer
  (dead surface) — decide delete (12/15) or build the composer consumer (01/08).

## 6. Deviations

None. All work stayed inside the lane-09 ownership table; setup followed
BASELINE.md/INTEGRATION_RULES.md exactly (worktree from the base tag, explicit
`git add` file lists, no cross-lane merges, no dependency changes).
