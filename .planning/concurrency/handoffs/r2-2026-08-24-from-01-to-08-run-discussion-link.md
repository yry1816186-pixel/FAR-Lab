# Handoff 01 → 08: durable run↔discussion conversation link

- **From:** lane 01 (hx-web-product) — **To:** lane 08 (agent-kernel, conversations owner)
- **Date:** 2026-08-24 · **Urgency:** P2 (product model completeness) · **Status:** requested

## Context

Lane 01 shipped the conversation↔research seam: a "讨论此研究" entry on every
research page that docks the dialogue beside the objects
(`#run/<id>/<tab>?conv=<cid>` URL, resume-safe). Two conversation→run
relations exist today, both server-side:

1. `Conversation.runIds` — runs LAUNCHED from the conversation (existing).
2. a discussion ABOUT an existing run — **not modeled**.

## Gap

For case 2 lane 01 creates a conversation titled with the research question
and dedupes the mapping **per browser session only**
(`discussionsRef` in `App.tsx`). After a reload, "讨论此研究" on the same run
creates a second conversation. No second engine was built client-side — this
note requests the authoritative link.

## Requested change (owner decides the model)

Either a `runIds`-style backlink (`discussionOfRunIds`) on the conversation
record, or a conversation field `context: { runId }`, so the workbench can
resolve "the dialogue about this research" durably. API surface addition +
persistence is yours; lane 01 will consume it in `sourceByRunId` and drop the
session-scoped dedupe.
