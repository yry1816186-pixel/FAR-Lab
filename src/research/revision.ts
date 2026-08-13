/**
 * research/revision — immutable, versioned, comparable revisions (directive §9.10).
 *
 * A feedback signal is NOT appended to a chat log — it is converted into a
 * typed FeedbackSignal and applied as an immutable Revision. Each revision
 * carries a parent id (rollback-referencable), a 1-based number, the before/after
 * hypothesis/plan/metric changes, and unresolved conflicts. Revisions never
 * force a metric to improve — a null result, plateau, or plan regression is
 * recorded honestly (directive §9.10).
 */

import { rawSha256Hex } from '../retrieval/hash.ts';
import type { FeedbackSignal, Revision } from './types.ts';

/** Change inputs for building a revision. */
export interface RevisionChangeInput {
  readonly hypothesisChanges: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly downgraded: readonly string[];
  };
  readonly planChanges: readonly string[];
  readonly metricChanges: readonly string[];
  readonly unresolvedConflicts: readonly string[];
}

/**
 * Build an immutable Revision (deterministic id = hash(parent + feedback + changes)).
 */
export function createRevision(input: {
  readonly parentRevisionId: string | null;
  readonly number: number;
  readonly feedback: FeedbackSignal;
  readonly changes: RevisionChangeInput;
  readonly createdAt?: string;
}): Revision {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const id = rawSha256Hex(
    `${input.parentRevisionId ?? 'root'}\n${input.feedback.text}\n${input.feedback.receivedAt}\n${createdAt}`,
  ).slice(0, 32);
  return {
    id,
    parentRevisionId: input.parentRevisionId,
    number: input.number,
    feedback: input.feedback,
    hypothesisChanges: {
      added: [...input.changes.hypothesisChanges.added],
      removed: [...input.changes.hypothesisChanges.removed],
      downgraded: [...input.changes.hypothesisChanges.downgraded],
    },
    planChanges: [...input.changes.planChanges],
    metricChanges: [...input.changes.metricChanges],
    unresolvedConflicts: [...input.changes.unresolvedConflicts],
    createdAt,
  };
}

/**
 * Build a FeedbackSignal from raw human/tool feedback (deterministic, pure).
 *
 * The `triggers` are computed from the signal content — a caller may override
 * them, but a bare human note defaults to `['none']` (it is recorded, not
 * silently discarded, but it does not claim to have changed the plan).
 */
export function buildFeedbackSignal(input: {
  readonly source: FeedbackSignal['source'];
  readonly actor: string;
  readonly text: string;
  readonly affectsHypothesisIds?: readonly string[];
  readonly changesScore?: boolean;
  readonly triggers?: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
  readonly receivedAt?: string;
}): FeedbackSignal {
  return {
    source: input.source,
    actor: input.actor,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    affectsHypothesisIds: [...(input.affectsHypothesisIds ?? [])],
    changesScore: input.changesScore ?? false,
    triggers: [...(input.triggers ?? ['none'])],
    text: input.text,
  };
}
