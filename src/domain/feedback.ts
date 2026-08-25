import { z } from 'zod';
import { FeedbackId, RevisionId, RunId } from './ids.js';
import { ObjectRef } from './ids.js';

export const FeedbackSourceKind = z.enum([
  'human_expert', 'new_literature', 'new_dataset', 'tool_result', 'simulation',
  'experiment', 'reviewer', 'verification_failure', 'reproduction_failure',
]);
export type FeedbackSourceKind = z.infer<typeof FeedbackSourceKind>;

export const FeedbackSignal = z.object({
  id: FeedbackId,
  runId: RunId,
  source: FeedbackSourceKind,
  /** Free-form or structured content; provenance describes where it came from. */
  content: z.string().min(1),
  structured: z.record(z.string(), z.unknown()).optional(),
  target: ObjectRef.optional(), // which object the feedback is about, when specific
  provenance: z.string().min(1),
  receivedAt: z.string().datetime(),
});
export type FeedbackSignal = z.infer<typeof FeedbackSignal>;

/** The object types a revision can touch — shared by RevisionOperation and VersionDiffEntry (WP2 F6). */
export const RevisedObjectType = z.enum(['hypothesis', 'plan', 'claim', 'evidence_relation', 'scope', 'assumption']);
export type RevisedObjectType = z.infer<typeof RevisedObjectType>;

/** Mission §33 — a revision is a causal operation, never "prompt again, new answer". */
export const RevisionOperation = z.object({
  objectType: RevisedObjectType,
  objectId: z.string().min(1),
  operation: z.enum(['create', 'modify', 'weaken', 'strengthen', 'invalidate', 'retire', 'refine']),
  before: z.string().optional(),
  after: z.string().optional(),
  reason: z.string().min(1),
});

export const QualityDelta = z.object({
  status: z.enum(['improved', 'neutral', 'worse', 'inconclusive']),
  claim: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

export const Revision = z.object({
  id: RevisionId,
  runId: RunId,
  triggerFeedbackId: FeedbackId,
  causalReason: z.string().min(1), // WHY the feedback forced these changes
  operations: z.array(RevisionOperation).min(1),
  fromVersionLabel: z.string(),
  toVersionLabel: z.string(),
  qualityDelta: QualityDelta,
  createdAt: z.string().datetime(),
});
export type Revision = z.infer<typeof Revision>;

export const VersionDiffEntry = z.object({
  objectType: RevisedObjectType,
  objectId: z.string(),
  summary: z.string().min(1),
  changedFields: z.array(z.string()).default([]),
  /**
   * RU-12 GO-1: RFC 6902 structured ops from the id-anchored walker
   * (src/domain/artifact-diff.ts) — the revision chain becomes
   * field-explainable. Optional: revisions predating the walker have summary
   * + changedFields only.
   */
  patchOps: z.array(z.union([
    z.object({ op: z.literal('add'), path: z.string(), value: z.unknown() }),
    z.object({ op: z.literal('remove'), path: z.string() }),
    z.object({ op: z.literal('replace'), path: z.string(), value: z.unknown() }),
    z.object({ op: z.literal('move'), from: z.string(), path: z.string() }),
  ])).default([]),
  /** Deterministic semantic flags (decision-rule change, prediction added, ...). */
  semanticFlags: z.array(z.string()).default([]),
});

export const VersionDiff = z.object({
  revisionId: RevisionId,
  runId: RunId,
  entries: z.array(VersionDiffEntry).min(1),
  semanticSummary: z.string().min(1),
  remainingUncertainties: z.array(z.string()).default([]),
});
export type VersionDiff = z.infer<typeof VersionDiff>;
export type VersionDiffEntry = z.infer<typeof VersionDiffEntry>;
