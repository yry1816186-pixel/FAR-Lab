# Handoff 09 → 08: wire the resident conversation agent through assembleSessionCapabilities

- **Date:** 2026-08-25
- **From:** Lane 09 (capability-ecosystem)
- **To:** Lane 08 (agent-kernel — owns `src/server/conversation-agent.ts`)
- **Urgency:** HIGH (product-level gap: researcher-enabled integrations are unreachable from the primary product surface)
- **Status:** OPEN

## Requested change

`generateConversationTurn` (`src/server/conversation-agent.ts`) builds its tool
registry inline and connects **zero** tool integrations: MCP servers, skills and
hook rules a researcher stages and enables in settings never join conversation
sessions. Lane 09 shipped the authoritative composition —
`assembleSessionCapabilities` (`src/agent/capabilities/assembly.ts`) — and asks
lane 08 to consume it.

## Why

- The resident agent's own system prompt advertises `create_tool_integration`
  proposals, and the product lets researchers enable integrations — but nothing
  in the conversation path can use them. Enabling is currently a no-op for the
  primary surface (only `far agent refine` sessions consume integrations).
- Unified lifecycle/admission/permission/skill-injection logic now lives in one
  place; a second inline assembly would recreate the duplication R2 exists to
  remove.

## Proposed integration (exact shape)

```ts
import { assembleSessionCapabilities } from '../agent/capabilities/assembly.js';
import type { ToolIntegration } from '../domain/tool-integration.js';

// inside generateConversationTurn, replacing the inline ToolRegistry +
// PermissionEngine construction:
const integrations: ToolIntegration[] = app.store.listObjects('tool_integration', '__none__');
const assembly = await assembleSessionCapabilities({
  builtinTools: [makeListRuns(app), makeGetRunDetails(app), makeGetRunPlan(app),
                 makeSearchWorkspace(app), makeWorkspaceStatus(app),
                 makeProposeAction(app, conv, proposals)],
  integrations,
  // resident agent is interactive and proposal-gated, but conservative: read-class
  // external tools join automatically; edit+ need their own policy decision by 08
  policy: { capability: 'conversation-resident', admittedRiskClasses: ['read'] },
  skills: {
    task: `${conv.title} ${input.text}`,
    dirs: [{ dir: path.join(process.cwd(), 'skills'), tier: 'builtin' }],
    limits: { maxCount: 3, maxChars: 4000 },
  },
  onHookLog: (entry) => { /* append to toolTrace or conversation events as 08 sees fit */ },
});
// use assembly.registry / assembly.permissions / assembly.hookBus in runAgentLoop deps;
// systemPrompt += assembly.skillsPrompt;
// finally { await assembly.close(); }
```

Notes:
- The assembly registers `list_capabilities` automatically (model-facing
  discovery incl. refused/failed integrations with reasons) and stamps identity
  (source/version/risk/trust) on every tool.
- Store-backed skill integrations (enabled) join at user tier without extra code.
- Hook rules compile to bypassImmune deny / ask (fail-closed headless) + log bus.
- `propose_action` risk stays as 08 defined (records a card only).

## Files

- `src/server/conversation-agent.ts` (08's; no lane-09 edits made to it)

## Verification lane 09 already ran (carries over)

- `tests/capability-assembly.test.ts` (8 tests, real child-process MCP servers
  through `runAgentLoop`): discovery→use, oversize spill, server death +
  reconnect, lying-`readOnlyHint` admission refusal, hook-rule denial, broken
  spawn honesty, domain-pack import→activation→assembly.
- `tests/agent-refine.test.ts` (6 tests) green after refine migrated to the
  same assembly — behavior-preserving reference consumer.
