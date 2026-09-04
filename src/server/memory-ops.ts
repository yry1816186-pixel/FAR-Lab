import { z } from 'zod';
import { deriveTrustClass, MemoryItemSchema, newMemoryId, type MemoryItem } from '../domain/memory.js';
import type { App } from '../app/composition.js';

/**
 * FA-HAR-06 memory management operations (view surface lives in web #memory;
 * `far memory` CLI keeps its own path). Same discipline as claim-ops:
 *  - Every real mutation lands an audit note event (actor 'human', stable
 *    reason) AND rides the memory_edges audit spine; idempotent no-ops mutate
 *    nothing and event nothing.
 *  - Append-only lifecycle: edit = SUPERSESSION (old item is kept, marked
 *    superseded, linked via supersedes edge), archive = terminal transition.
 *    Nothing is ever deleted — retrieval surfaces read status='active' only.
 *  - Human edits cannot launder trust: the replacement item carries taint
 *    'untrusted_literal' and a trustClass RE-DERIVED from it (never copied
 *    from the original), so a hand-edited memory row surfaces as
 *    external_untrusted through every consumer (negative conditioning, search).
 *  - Both edit and archive REQUIRE a reason (changes to analysis inputs must
 *    stay reviewable, G3 researcher control).
 *
 * Audit placement (disclosed gap): events.run_id is unconstrained and
 * workspace-scoped memory (profile items) has no run. The note event goes to
 * the item's provenance run when that run exists, else to the '__none__'
 * workspace bucket — a plain INSERT in both cases, but verifyEventChain only
 * walks listRuns() runs, so __none__ events are persisted-yet-unverified. The
 * memory_edges row is the always-verified spine for BOTH cases.
 */

export type MemoryOpErrorCode = 'not_found' | 'validation' | 'lifecycle';

export class MemoryOpError extends Error {
  constructor(readonly status: number, readonly code: MemoryOpErrorCode, message: string) {
    super(message);
  }
}

const badRequest = (message: string): MemoryOpError => new MemoryOpError(400, 'validation', message);
const notFound = (message: string): MemoryOpError => new MemoryOpError(404, 'not_found', message);
const lifecycle = (message: string): MemoryOpError => new MemoryOpError(409, 'lifecycle', message);

export const EditMemoryBody = z.object({
  title: z.string().min(3).max(200).optional(),
  body: z.string().min(1).optional(),
  failureReason: z.string().min(3).max(2_000).optional(),
  /** Required: a human edit changes analysis inputs; the decision stays reviewable. */
  reason: z.string().min(1).max(2_000),
});
export type EditMemoryInput = z.infer<typeof EditMemoryBody>;

export const ArchiveMemoryBody = z.object({
  reason: z.string().min(1).max(2_000),
});
export type ArchiveMemoryInput = z.infer<typeof ArchiveMemoryBody>;

const issueText = (issues: z.ZodIssue[]): string =>
  issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

const mustGetMemory = (app: App, id: string): MemoryItem => {
  if (!/^mem_[a-z0-9]+$/.test(id)) throw badRequest(`malformed memory id: ${id}`);
  const item = app.store.getMemory(id);
  if (item === null) throw notFound(`memory item ${id} not found`);
  return item;
};

/**
 * Audit placement (disclosed): the events table validates run_id against the
 * branded RunId schema, so a workspace-scoped item (no run) CANNOT land a note
 * event — the '__none__' bucket exists for OBJECTS, not events. The human act
 * is therefore audited twice: a note event onto the provenance run when it
 * resolves, and ALWAYS a reason-bearing memory_edges row (the memory plane's
 * audit spine; relation_type carries no CHECK, migration v6) so the reason is
 * durable even for workspace-global items.
 */
const auditEvent = (app: App, item: MemoryItem, detail: Record<string, unknown>): number | null => {
  const runId = item.provenance.runId;
  if (runId === undefined || app.store.getRun(runId) === null) return null;
  return app.store.appendEvent(runId, { type: 'note', detail: { ...detail, memoryId: item.id, actor: 'human' } }).seq;
};

/**
 * The audit-spine edge carries the FULL reason (schema-bounded at 2,000
 * chars): for workspace-global items this edge is the only persistent audit of
 * the human act, so truncating it here would silently destroy the researcher's
 * record. relation_type has no CHECK (migration v6) and no index scans its
 * value, so length is free.
 */
const reasonEdgeType = (action: 'edited_human' | 'archived_human', reason: string): string =>
  `${action}:${reason.replace(/\s+/g, ' ').trim()}`;

export interface MemoryMutationResult {
  memoryId: string;
  /** Present only for edit (supersession): the replacement item's id. */
  newId?: string;
  status: 'active' | 'superseded' | 'archived';
  /** Present only when this call performed a real mutation (null on idempotent no-op). */
  eventId: number | null;
}

// ---- edit (supersession) ----

export function editMemory(app: App, id: string, rawBody: unknown): MemoryMutationResult {
  const parsed = EditMemoryBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid edit request (reason is required): ${issueText(parsed.error.issues)}`);
  const { title, body, failureReason, reason } = parsed.data;
  const old = mustGetMemory(app, id);
  if (old.status !== 'active') {
    throw lifecycle(`memory item ${id} is ${old.status} — only active items can be edited`);
  }
  const nextTitle = title ?? old.title;
  const nextBody = body ?? old.body;
  const nextFailureReason = failureReason ?? old.failureReason;
  if (nextTitle === old.title && nextBody === old.body && nextFailureReason === old.failureReason) {
    // Idempotent: nothing changes — no mutation, no event.
    return { memoryId: old.id, status: old.status, eventId: null };
  }
  const now = new Date().toISOString();
  const taint = 'untrusted_literal' as const;
  const next = MemoryItemSchema.parse({
    id: newMemoryId(),
    kind: old.kind,
    entityType: old.entityType,
    title: nextTitle,
    body: nextBody,
    status: 'active',
    outcome: old.outcome,
    ...(nextFailureReason !== undefined ? { failureReason: nextFailureReason } : {}),
    trustClass: deriveTrustClass(taint, old.provenance),
    taint,
    // sourceRef survives: an external_literature edit without it would fail the
    // schema's honesty CHECK; a hand edit never fabricates a NEW source.
    provenance: old.provenance,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
  });
  // Supersession and its reason-bearing audit edge commit in ONE transaction —
  // a committed change can never be missing its reason (see store.supersedeMemory).
  app.store.supersedeMemory(old.id, next, reasonEdgeType('edited_human', reason));
  const eventId = auditEvent(app, old, {
    reason: 'memory_edited_human',
    newId: next.id,
    changedFields: [
      ...(title !== undefined && title !== old.title ? ['title'] : []),
      ...(body !== undefined && body !== old.body ? ['body'] : []),
      ...(failureReason !== undefined && failureReason !== old.failureReason ? ['failureReason'] : []),
    ],
    editReason: reason,
  });
  return { memoryId: old.id, newId: next.id, status: 'superseded', eventId };
}

// ---- archive (terminal) ----

export function archiveMemory(app: App, id: string, rawBody: unknown): MemoryMutationResult {
  const parsed = ArchiveMemoryBody.safeParse(rawBody);
  if (!parsed.success) throw badRequest(`invalid archive request (reason is required): ${issueText(parsed.error.issues)}`);
  const { reason } = parsed.data;
  const item = mustGetMemory(app, id);
  if (item.status === 'archived') {
    // Idempotent: already archived — the original reason stays authoritative.
    return { memoryId: item.id, status: 'archived', eventId: null };
  }
  app.store.archiveMemory(item.id, reasonEdgeType('archived_human', reason));
  const eventId = auditEvent(app, item, { reason: 'memory_archived_human', archiveReason: reason });
  return { memoryId: item.id, status: 'archived', eventId };
}
