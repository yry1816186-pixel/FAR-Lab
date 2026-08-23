# OSS Capability Integration — Live Verification (2026-08-23)

Mission: user directive — multimodal understanding + computer use via first-line
OSS reused through MCP, zero new product runtime deps. All capability enters as
standalone MCP servers bridged by the product's existing McpManager/McpStdioClient.

## What landed

### 1. Docling Document Understanding (multimodal / document structure)
- OSS: docling-project/docling-mcp (official IBM Docling MCP server), installed via `uv tool install docling-mcp --with "docling-mcp[local]"`
- Integration: `tint_xwzgs792gpmsbzbx5kn7wsxnf1` "Docling Document Understanding"
  - stdio: `docling-mcp-server --transport stdio conversion`
  - env: DOCLING_MCP_CONVERSION_MODE=local
  - riskClass: read, timeout 120s
- Product connectivity test: PASS — "3 tools listed … in 3796ms"
- Live functional proof: converted real workspace PDF jss_metafor.pdf
  (JSS metafor paper) through the PRODUCT's McpStdioClient → ok:true,
  document_key 79f555f2417fc50e413bb1297e36d4d6.
- Independent CLI cross-check: `docling convert --to md` produced structured
  Markdown with embedded figure images + Table markers (artifacts/docling-live/).

### 2. Playwright Browser Control (computer use)
- OSS: microsoft/playwright-mcp v0.0.79, installed globally (`npm i -g @playwright/mcp`)
- Integration: `tint_c4h4va1w5qkxf26b8ays5b5pdw` "Playwright Browser Control"
  - stdio: `node <global>/@playwright/mcp/cli.js`  (NOT npx.cmd — see root cause below)
  - riskClass: execute, timeout 60s
- Product connectivity test: PASS — "24 tools listed … in 263ms"
- Live functional proof: navigated to https://example.com headless through the
  product's client; accessibility snapshot returned real heading structure.

## Root cause found & fixed along the way
Node ≥22 security hardening rejects spawning .cmd shims without shell
(spawn EINVAL). Root-cause fix: spawn `node <abs path to cli.js>` directly —
no shell injection surface, no shim dependency. Recorded so future Windows MCP
registrations follow this pattern.

Also: docling-mcp requires DOCLING_MCP_CONVERSION_MODE=local + the [local]
extra for offline PDF conversion; default mode is remote and fails loudly.

## Honest boundaries
- These are registered, connected, live-tested tool integrations. Agent-session
  end-to-end use (LLM choosing the tools during a research run) is NOT yet
  demonstrated — next integration step is a pipeline stage consuming them.
- Figure-image → vision-model handoff (true image understanding) is not yet
  wired; docling currently yields structure + embedded images in markdown.

## Post-integration repair (same session)
Sibling-session in-flight file src/server/automations.ts had `const` declared
INSIDE an object literal (syntax error) — broke every test importing it
(reasoning-conversation suite surfaced as phantom 404s). Fixed: hoisted
`__autoReasoning` above the generateConversationTurn call. Full gates after fix:
vitest 1169 passed / 2 skipped (96 files), lint, typecheck, build,
completion-gate all PASS.

Verification scripts: artifacts/live-verify.mjs, artifacts/pw-live.mjs (product-client driven).
