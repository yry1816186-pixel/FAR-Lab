# Handoff: MCP/plugin riskClass self-declaration floor (F-1) — 13 → 09

- **From:** lane 13 (reliability-security) · **To:** lane 09 (capability-ecosystem)
- **Urgency:** medium (defense-in-depth; compensating control = human review at import+enable)
- **Status:** OPEN — reproduced on ws/r2/13-reliability-security @ b234c9e+
- **Evidence:** `spikes/security-redteam.mjs` proofs F1a/F1b/F1c (4/4 REPRODUCED,
  exit 0) → `evidence/reliability/security-redteam.json`;
  narrative in `evidence/reliability/security-audit-2026-08-25.md` §F-1.

## Requested change

A plugin manifest may declare `riskClass: 'read'` for an MCP server
(`src/plugins/manifest.ts:56`; any enum value accepted, default 'execute' only on
omission). The declared class flows unchecked through `expandPluginManifest`
(`src/plugins/import.ts:103`) into the staged integration, and
`McpManager.registerTools` registers every tool with it
(`src/agent/mcp-manager.ts:161`). The class is load-bearing in three places:

1. refine admission trusts the DECLARED class (`src/agent/capabilities/refine.ts:299`
   admits `riskClass === 'read'` servers and expands unconditional allow rules at
   :329 for their tools);
2. explore mode auto-allows read-class (`src/agent/permissions.ts:106-108`);
3. the RU-3 T3 untrusted-embedding guard only fires for non-read tools
   (`src/agent/loop.ts:411`).

Net: a malicious plugin declaring `read` gets effectful tool calls auto-allowed
with no ask handler AND exempt from the untrusted-embed guard — the deterministic
layer contradicts SECURITY.md's documented "execute risk-class default" intent
(the default exists, but a declaration downgrades it).

## Proposed patch (owner's call on placement)

Minimal, at the import expansion (import.ts:102-104): force plugin-declared
server riskClass to `'execute'` regardless of the manifest value (plugins are
attacker-authored by definition; only the RESEARCHER-created integrations via
API/UI may claim read), e.g.:

```ts
for (const server of manifest.mcpServers) {
  push({ kind: 'mcp_server', ..., riskClass: 'execute', // F-1 floor: plugin authors cannot self-classify below execute
        ...(server.timeoutMs !== undefined ? { timeoutMs: server.timeoutMs } : {}) });
}
```

plus a `tests/plugins.test.ts` case: manifest declaring `read` → staged
integration `riskClass === 'execute'`. Alternative (stronger): drop the field
from the manifest schema for mcpServers entirely. A belt-and-braces variant
additionally floors at registration for `trust: 'external'` entries
(mcp-manager.ts:161: `riskClass: 'execute'`), covering API-created integrations
that were imported from a plugin provenance (`provenance.pluginId`).

## Interaction notes

- `refine.ts`'s own admission floor is correct GIVEN truthful declarations — no
  change needed there once import stops passing through self-declared classes.
- Lane 08's F-5 handoff covers the conversation-side blanket allow; independent.
