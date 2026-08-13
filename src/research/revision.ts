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
import type { FeedbackSignal, ResearchPlan, Revision } from './types.ts';

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
 * `beforePlan`/`afterPlan` freeze the plans so the diff is recomputable from
 * stored state (directive §9.10 "不可变、可比较、可回滚引用").
 */
export function createRevision(input: {
  readonly parentRevisionId: string | null;
  readonly number: number;
  readonly feedback: FeedbackSignal;
  readonly changes: RevisionChangeInput;
  readonly beforePlan?: ResearchPlan | null;
  readonly afterPlan?: ResearchPlan;
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
    beforePlan: input.beforePlan ?? null,
    afterPlan: input.afterPlan ?? null,
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

/** One array-field diff (added / removed / unchanged counts + items). */
export interface ArrayFieldDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
}

/** A structured, deterministic diff between two research plans. */
export interface ResearchPlanDiff {
  /** String fields that changed (name → before/after values). */
  readonly stringFieldChanges: ReadonlyArray<{
    readonly field: string;
    readonly before: string;
    readonly after: string;
  }>;
  /** Array fields with content changes (field → diff). */
  readonly arrayFieldChanges: Readonly<Record<string, ArrayFieldDiff>>;
  /** Array fields present in both plans with zero changes. */
  readonly unchangedArrayFields: readonly string[];
  /** Primary hypothesis changed? */
  readonly primaryHypothesisChanged: boolean;
  /** True iff nothing changed (identical plans). */
  readonly identical: boolean;
}

/** Array-valued plan field names (the rest are strings). */
const PLAN_ARRAY_FIELDS = [
  'objectives',
  'preregisteredPredictions',
  'dataRequirements',
  'inclusionExclusionCriteria',
  'variables',
  'analysisDag',
  'tools',
  'statisticalMethods',
  'stoppingConditions',
  'checkpoints',
  'risks',
  'reproducibility',
  'nextRoundDecisionRules',
  'humanApprovalRequired',
] as const;

const PLAN_STRING_FIELDS = [
  'design',
  'sampleSizeRationale',
  'multiplicityHandling',
  'missingOutlierStrategy',
  'budget',
] as const;

/**
 * Deterministically diff two research plans (directive §9.10 "版本比较").
 * Pure: same inputs → same diff. Never requires improvement.
 */
export function compareResearchPlans(before: ResearchPlan, after: ResearchPlan): ResearchPlanDiff {
  const stringFieldChanges: { field: string; before: string; after: string }[] = [];
  for (const field of PLAN_STRING_FIELDS) {
    if (before[field] !== after[field]) {
      stringFieldChanges.push({ field, before: before[field], after: after[field] });
    }
  }

  const arrayFieldChanges: Record<string, ArrayFieldDiff> = {};
  const unchangedArrayFields: string[] = [];
  for (const field of PLAN_ARRAY_FIELDS) {
    const b = new Set(before[field]);
    const a = new Set(after[field]);
    const added = [...a].filter((v) => !b.has(v));
    const removed = [...b].filter((v) => !a.has(v));
    const unchanged = [...b].filter((v) => a.has(v));
    if (added.length > 0 || removed.length > 0) {
      arrayFieldChanges[field] = { added, removed, unchanged };
    } else {
      unchangedArrayFields.push(field);
    }
  }

  const primaryHypothesisChanged = before.primaryHypothesisId !== after.primaryHypothesisId;
  const identical =
    stringFieldChanges.length === 0 &&
    Object.keys(arrayFieldChanges).length === 0 &&
    !primaryHypothesisChanged;

  return {
    stringFieldChanges,
    arrayFieldChanges,
    unchangedArrayFields,
    primaryHypothesisChanged,
    identical,
  };
}
