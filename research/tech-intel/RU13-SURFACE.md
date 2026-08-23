# RU-13 SURFACE — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED (MCP spec .md fetched and
read directly; A2A repo/license verified; competitive facts from primary
announcements where reachable).

## Problem
Inverse-surface plane: B8.2 MCP client GET-SSE notifications (streamable-HTTP
server-initiated messages) · B8.3 FAR-Lab as MCP server / A2A participant ·
E19 competitive landscape watch (Claude Science-class workbenches).

## Search vocabulary run
`MCP streamable HTTP GET SSE server-initiated notifications`,
`MCP server typescript SDK streamable`, `FAR-Lab as MCP server research
artifacts tools`, `A2A agent2agent protocol v1 Linux Foundation`,
`A2A vs MCP complement`, `Claude Science Anthropic workbench beta`,
`OpenClaw research agent`, `agent skill marketplace surface`

## Candidate/spec table (SR=read, SC=probed)
| Candidate | Org | License/Status | Solves | Family | Tag |
|---|---|---|---|---|---|
| MCP Streamable HTTP transport (spec 2025-06-18, current) | modelcontextprotocol | open spec | GET on MCP endpoint MAY open SSE stream for server→client notifications/requests; Last-Event-ID resume; 405 = no-stream option | transport capability | SR(spec text read: GET semantics, Accept header, replay rules) |
| MCP TypeScript SDK server helpers | modelcontextprotocol | MIT (org convention; verify file at impl) | building an MCP server surface | SDK | SC |
| A2A Protocol | Linux Foundation / Google (a2aproject) | Apache-2.0 (README read) | agent-to-agent task delegation, complementary to MCP (tools vs agents) | interop protocol | SR |
| Claude Science (Anthropic beta, 2026-06) | Anthropic | product | skills+connectors research workbench = the product benchmark to watch | competitive | PR(announcement-level; details gated) |
| OpenClaw / ResearchClaw agents | community | various | agent surfaces consuming MCP servers | ecosystem consumers | SC |

## Source-level findings
1. **B8.2 GET-SSE**: the spec text confirms our client gap precisely: client
   MAY GET the MCP endpoint to receive server-initiated notifications
   (resource-changed, tool-list-changed, progress) and MUST handle 405
   (server without stream). Our MCP client currently speaks streamable-HTTP
   POST only — meaning servers that push list-changed notifications are
   silently missed until manual refresh. Implementation: optional GET stream
   per server connection with Last-Event-ID resume; on 405 mark
   notifications=unsupported and keep polling refresh (current behavior).
   Small, spec-exact, zero new deps (Node fetch + our existing SSE parsing).
2. **B8.3 inverse server**: the natural FAR-Lab-as-server surface is
   READ-CLASS ONLY at first: expose run status, hypothesis/claim/evidence
   projections, bundle summaries as MCP resources + a small tool set
   (search_workspace, get_run_details already exist as resident-agent read
   plane — reuse the SAME projection functions as MCP handlers; one owner).
   Write/exec-class exposure REJECTS for now (approval-plane semantics are
   human-in-loop; exposing them to external agents bypasses the trust
   boundary — RU-3 invariant). Transport: streamable-HTTP server on the
   existing loopback HTTP server (new /mcp route), stdio variant for local
   CLI agents later. A2A: DEFER — its agent-card/task model targets
   cross-org delegation which FAR-Lab (single-user desktop-first) does not
   need yet; re-open when a real second-org consumer appears.
3. **E19 watch**: Claude Science defines the UX bar (skills+connectors).
   Our differentiation stays evidence-first (falsifiability, provenance,
   mechanical verdicts). Watch cadence: monthly frontier-radar check on
   Anthropic product posts + MCP registry growth; no code response needed.

## Verdicts (main-Agent, closed vocab)
- MCP GET-SSE client notifications: **BUILD** (spec-exact optional stream +
  405 fallback; per-connection capability flag)
- FAR-Lab as MCP server (read-class resources/tools): **BUILD** (reuse
  resident-agent read-plane projections as single owner; loopback-only;
  no write/exec exposure)
- Write/exec MCP exposure: **REJECT** (trust-boundary bypass; revisit only
  with per-action human approval parity proven)
- A2A participant: **DEFER** (trigger: real cross-org delegation demand)
- MCP SDK dependency for server side: **DEFER→likely-REJECT** (hand-rolled
  JSON-RPC over our HTTP server matches zod-only gate; SDK only if protocol
  surface grows beyond ~10 methods)
- Claude Science watch: **KEEP** (radar item, no action)

## Integration sketch (owners)
- src/agent/mcp-client: GET-stream addition (capability-negotiated)
- src/server/mcp.ts (new): read-class MCP server route on existing HTTP
  server; resource/tool handlers delegate to resident-agent projection fns
- .control/FRONTIER radar entry: E19 cadence note
- Security: server binds loopback only; F-1 Host/Origin guard covers /mcp;
  no auth-token needed beyond existing loopback model (C9.2 ruling stands)

## Deterministic validation workload (offline)
- GET-SSE client: mock MCP server emits notification → client applies
  tool-list refresh; 405 case → capability flag set, no retry loop
- MCP server: fixture client does initialize/list_resources/read_resource →
  exact JSON-RPC shapes; loopback guard test (external Host rejected)
- Projection parity test: MCP resource payload === resident-agent read
  output for same run (one-owner guarantee)

## UNVERIFIED
- MCP TS SDK license file (badge-level only this session)
- Claude Science connector API details (gated product docs)
- Real-world MCP servers' GET-SSE adoption rate (sampled none this session)
