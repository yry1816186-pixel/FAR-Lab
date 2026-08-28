import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';
import type { FeedbackSignal, Revision, VersionDiff } from './feedback.js';

/**
 * Product Spine M3 (final product reconstruction, 2026-08-28): the SCIENTIFIC
 * STATE DELTA projection. The engine already records revisions as causal
 * operations (trigger feedback → operations with before/after → causalReason
 * → qualityDelta). This projection turns that chain into the product question
 * "WHAT CHANGED / WHY / WHAT NEXT" — a projection only, never a second truth.
 */
export const DeltaOperationView = z.object({
  objectType: z.string().min(1),
  objectId: z.string().min(1),
  operation: z.string().min(1),
  before: z.string().nullable(),
  after: z.string().nullable(),
  reason: z.string().min(1),
});
export type DeltaOperationView = z.infer<typeof DeltaOperationView>;

export const ScientificStateDelta = z.object({
  id: z.string().min(1),
  runId: RunId,
  /** Revision label transition (e.g. v2 → v3). */
  fromVersionLabel: z.string(),
  toVersionLabel: z.string(),
  at: z.string().datetime(),
  trigger: z.object({
    feedbackSource: z.string().min(1),
    excerpt: z.string().min(1),
  }),
  whatChanged: z.array(DeltaOperationView).min(1),
  /** Hypotheses affected by any operation in this revision. */
  affectedHypothesisIds: z.array(HypothesisId).default([]),
  affectedClaimIds: z.array(ClaimId).default([]),
  /** Ranking impact, derived from operation types (qualitative — no invented scores). */
  rankingImpact: z.enum(['weakened', 'strengthened', 'restructured', 'unclear']),
  explanation: z.string().min(1),
  qualityDelta: z.object({
    status: z.enum(['improved', 'neutral', 'worse', 'inconclusive']),
    claim: z.string(),
  }),
  /** From the version-diff walker when present (field-level residual unknowns). */
  remainingUncertainties: z.array(z.string()).default([]),
});
export type ScientificStateDelta = z.infer<typeof ScientificStateDelta>;

const WEAKEN_OPS = new Set(['weaken', 'invalidate', 'retire']);
const STRENGTHEN_OPS = new Set(['strengthen', 'promote']);

const rankingImpactOf = (ops: readonly { operation: string }[]): ScientificStateDelta['rankingImpact'] => {
  if (ops.some((o) => WEAKEN_OPS.has(o.operation))) return 'weakened';
  if (ops.some((o) => STRENGTHEN_OPS.has(o.operation))) return 'strengthened';
  if (ops.some((o) => o.operation === 'create' || o.operation === 'refine')) return 'restructured';
  return 'unclear';
};

/**
 * Pure projection from persisted revisions (+ their trigger feedbacks + version
 * diffs). Newest first. `pendingSignals` (feedback not yet consumed by any
 * revision) are NOT deltas — they are surfaced by the next-action derivation
 * as CONSUME_FEEDBACK_INTO_REVISION.
 */
export function projectStateDeltas(input: {
  runId: RunId;
  revisions: Revision[];
  feedbacks: FeedbackSignal[];
  versionDiffs: VersionDiff[];
}): ScientificStateDelta[] {
  const { runId, revisions, feedbacks, versionDiffs } = input;
  const fbById = new Map(feedbacks.map((f) => [f.id, f] as const));
  const diffByRevision = new Map(versionDiffs.map((d) => [d.revisionId, d] as const));
  return revisions
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((rev, i) => {
      const fb = fbById.get(rev.triggerFeedbackId);
      const whatChanged = rev.operations.map((op) => ({
        objectType: op.objectType,
        objectId: op.objectId,
        operation: op.operation,
        before: op.before ?? null,
        after: op.after ?? null,
        reason: op.reason,
      }));
      const diff = diffByRevision.get(rev.id);
      return ScientificStateDelta.parse({
        id: `ssd_${runId}_${revisions.length - i}`,
        runId,
        fromVersionLabel: rev.fromVersionLabel,
        toVersionLabel: rev.toVersionLabel,
        at: rev.createdAt,
        trigger: {
          feedbackSource: fb?.source ?? 'unknown',
          excerpt: (fb?.content ?? '').slice(0, 200) || '(无内容摘录)',
        },
        whatChanged,
        affectedHypothesisIds: [...new Set(rev.operations.filter((o) => o.objectType === 'hypothesis').map((o) => o.objectId as HypothesisId))],
        affectedClaimIds: [...new Set(rev.operations.filter((o) => o.objectType === 'claim').map((o) => o.objectId as ClaimId))],
        rankingImpact: rankingImpactOf(rev.operations),
        explanation: rev.causalReason,
        qualityDelta: rev.qualityDelta,
        ...(diff !== undefined && diff.remainingUncertainties.length > 0
          ? { remainingUncertainties: diff.remainingUncertainties }
          : {}),
      });
    });
}
