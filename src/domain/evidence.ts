import { z } from 'zod';
import { EvidenceRelationId, ClaimId, HypothesisId, RunId, SourceDocumentId } from './ids.js';

/** Mission §25 relation vocabulary — closed core set. Conflicts are never averaged away. */
export const EvidenceRelationType = z.enum([
  'supports', 'contradicts', 'weakens', 'qualifies',
  'depends_on', 'derived_from', 'replicates', 'fails_to_replicate',
  'alternative_explanation', 'methodological_limitation', 'unknown',
]);
export type EvidenceRelationType = z.infer<typeof EvidenceRelationType>;

/** Coarse polarity for queries/UX; derived from the precise type, never replacing it. */
export const RELATION_POLARITY: Record<EvidenceRelationType, 'supporting' | 'counter' | 'neutral'> = {
  supports: 'supporting',
  replicates: 'supporting',
  contradicts: 'counter',
  weakens: 'counter',
  fails_to_replicate: 'counter',
  alternative_explanation: 'counter',
  qualifies: 'neutral',
  depends_on: 'neutral',
  derived_from: 'neutral',
  methodological_limitation: 'neutral',
  unknown: 'neutral',
};

export const EvidenceStrength = z.enum(['strong', 'moderate', 'weak', 'unrated']);
export type EvidenceStrength = z.infer<typeof EvidenceStrength>;

export const EvidenceRelation = z.object({
  id: EvidenceRelationId,
  runId: RunId,
  relation: EvidenceRelationType,
  claimId: ClaimId.optional(),
  sourceDocumentId: SourceDocumentId.optional(), // direct source-level relations allowed
  targetHypothesisId: HypothesisId.optional(),
  targetClaimId: ClaimId.optional(), // claim-to-claim relations (conflict etc.)
  rationale: z.string().min(1),
  strength: EvidenceStrength.default('unrated'),
  uncertainties: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});
export type EvidenceRelation = z.infer<typeof EvidenceRelation>;

/**
 * "No counter-evidence found" must be expressible EXACTLY as that — a scoped search record,
 * never as "no counter-evidence exists".
 */
export const CounterEvidenceSearchRecord = z.object({
  runId: RunId,
  queriesAttempted: z.array(z.string()).min(1),
  scopeNote: z.string().default('within verified search scope of this run'),
  foundCount: z.number().int().nonnegative(),
  at: z.string().datetime(),
});
export type CounterEvidenceSearchRecord = z.infer<typeof CounterEvidenceSearchRecord>;
