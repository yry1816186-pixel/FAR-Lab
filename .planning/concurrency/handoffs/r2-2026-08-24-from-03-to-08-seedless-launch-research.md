# Handoff R2: 03 → 08 — seedless `launch_research` approval always fails

- **Date:** 2026-08-24
- **From lane:** 03 terminal-desktop
- **To lane:** 08 agent-kernel (`src/server/conversations.ts`; co-relevant: 12 platform-data-api, `src/server/api.ts` `createRunWithSeeds`)
- **Urgency:** medium (real product defect on the primary chat → research path; terminal lane works around it in tests only)

## Requested change

Approving a `launch_research` proposal in a conversation with **no attached seeds**
always fails with `执行失败：field "seeds" must be an array of 1-50 seed sources`.

## Root cause (verified against real server, stub provider)

`executeProposal` (conversations.ts) calls the bridge with
`seeds: collectConversationSeeds(conv)` — an unconditional property, so a seedless
conversation passes `seeds: []`. `createRunWithSeeds` (api.ts) validates
`seeds` as "array of **1-50**" when the field is present, and `[]` violates the
minimum. The manual launch route (`POST /conversations/:id/launch`) does NOT hit
this because it never passes a `seeds` field.

Reproduction (offline, hermetic — stub provider, ephemeral server):

1. `POST /api/v1/conversations` → conv
2. `POST …/messages {text:"go"}` with a stub turn that proposes `launch_research`
3. `POST …/proposals/<act_id> {approve:true, remember:true}`
4. Proposal status = `failed`, result = `执行失败：field "seeds" must be an array of 1-50 seed sources`

With ≥1 valid seed attached the same flow executes (`status=executed`,
result `已启动研究 run_…`) — evidence in lane 03's `packages/tui/test/e2e.test.ts`.

## Proposed fix (owner decides)

In `executeProposal`, pass seeds only when non-empty (mirror the launch route):

```ts
const runId = await deps.createRun({
  text: args.question,
  ...(collectConversationSeeds(conv).length > 0 ? { seeds: collectConversationSeeds(conv) } : {}),
  ...
});
```

(or relax `createRunWithSeeds` to treat `[]` as absent — one owner should pick;
the first option keeps run-creation validation strict for direct API callers).

## Impact on lane 03

TUI chat approval flow is fully usable with materials; the seedless case surfaces
the honest failure text from the server. No workaround shipped in product code.
