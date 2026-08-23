import { z } from 'zod';

/**
 * Research lineage vocabulary (RU-2, AVO G3 / Execution-Lineage semantics) —
 * the ONE owner of persisted lineage edge kinds. The `lineage_edges` table
 * (persistence migration v5) is the authoritative store; src/app/lineage.ts
 * remains a read-time projection until it rebases onto the table.
 *
 * Semantics (Execution Lineage, arXiv 2605.06365 — adopted):
 * edges record EXPLICIT dependencies between first-class artifacts; replay
 * identity stays with step_fingerprints — lineage adds the dependency-domain
 * dimension, not a new identity scheme.
 */
export const LineageEdgeKindSchema = z.enum([
  'revised_into',      // run -> run: revision chain (parentRunId semantics)
  'forked_from',       // run -> run: branch point (new run references fork origin)
  'delegated_to',      // run -> run/agent: authority delegation (subagent/sidecar)
  'produced',          // activity -> artifact
  'consumed',          // activity -> artifact (input dependency)
  'counter_evidence',  // evidence_relation -> hypothesis/claim (contradicts et al.)
  'support_evidence',  // evidence_relation -> hypothesis/claim
  'caused_revision',   // feedback -> revision
  'revises',           // revision -> object it touched
]);
export type LineageEdgeKind = z.infer<typeof LineageEdgeKindSchema>;

/** Relation types that count as counter-evidence — shared by backfill and any consumer. */
export const LINEAGE_COUNTER_RELATIONS: ReadonlySet<string> = new Set([
  'contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation',
]);

export const LineageEdgeRecordSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: LineageEdgeKindSchema,
  runId: z.string().min(1),
  at: z.string().min(1),
});
export type LineageEdgeRecord = z.infer<typeof LineageEdgeRecordSchema>;

/**
 * Closed event-tag vocabulary for the event_tags table / events.query plane
 * (RU-2, AVO G6). Tags are derived deterministically from the event record at
 * insert — never by an LLM.
 */
export const eventTagsFor = (e: { type: string; stage?: string }): string[] => {
  const tags = [`kind:${e.type}`];
  if (e.stage !== undefined && e.stage.length > 0) tags.push(`stage:${e.stage}`);
  return tags;
};
