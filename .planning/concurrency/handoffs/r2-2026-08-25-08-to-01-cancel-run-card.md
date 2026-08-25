# Handoff 08 → 01: render `cancel_run` proposal cards (+ stale kind mirror)

- **Date:** 2026-08-25
- **From lane:** 08 agent-kernel
- **To lane:** 01 hx-web-product
- **Urgency:** low (backend is honest without it; unknown kinds render via the generic fallback today)

## Requested change

The resident agent can now propose a fifth action kind, `cancel_run` (lane-08
commits on `ws/r2/08-agent-kernel`): a researcher-gated card that cancels one
of the conversation's launched runs (`store.requestCancel` + audit event).

1. `web/src/api/types.ts:847` — `ConversationActionKind` mirror is stale: it
   lacks `create_tool_integration` (shipped earlier by the resident-agent
   lane) and now `cancel_run`. Update to the five-kind union.
2. `web/src/components/ConversationView.tsx` — add a `cancel_run` branch to
   the kind-keyed i18n map (`conv.proposal.cancel_run` 停止研究 / Cancel run)
   and arg rendering (`argSummary.runId`). `riskLevel` arrives server-computed
   as `low`.

## Reason

`run_supervision` evidence (stall / repeated identical failures) should end in
a visible human-gated redirect, not a dead end. The card is that redirect.

## Files

- `web/src/api/types.ts` (kind union)
- `web/src/components/ConversationView.tsx` (card rendering)
- `web/src/i18n/dict.ts` (zh/en labels)

## Verification notes for lane 01

Backend contract locked by `tests/conversation-kernel-durability.test.ts`
(6/6): foreign-run proposals are refused at the tool boundary; approval flips
`run.cancelRequested` and appends a `run_cancelled` event with
`detail.via = 'conversation-proposal'`. A scripted GUI walkthrough of the new
card is IMPLEMENTED_UNVERIFIED-live from the backend side.
