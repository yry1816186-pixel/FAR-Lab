import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';

/**
 * Mission §28 — every score is a decision aid. Producer, basis and calibration state are
 * mandatory so no LLM number can masquerade as objective scientific probability.
 */
export const ScoreDimension = z.enum([
  'scientific_plausibility', 'evidence_grounding', 'counter_evidence_exposure', 'novelty',
  'falsifiability', 'testability', 'data_availability', 'methodological_soundness',
  'expected_information_gain', 'resource_cost', 'risk', 'uncertainty',
]);
export type ScoreDimension = z.infer<typeof ScoreDimension>;

export const DimensionScore = z.object({
  dimension: ScoreDimension,
  /** 0..1 ordinal judgment value, or null when the dimension is genuinely not assessable. */
  value: z.number().min(0).max(1).nullable(),
  qualitative: z.enum(['low', 'moderate', 'high', 'not_assessed']).optional(),
  rationale: z.string().min(1),
  evidenceClaimIds: z.array(ClaimId).default([]),
  uncertainty: z.string().optional(),
  producer: z.string().min(1), // e.g. "deepseek-v4-flash via structured critique" or "deterministic-checker"
  calibration: z.enum(['uncalibrated_llm_judgment', 'deterministic', 'human_expert']),
});

export const HypothesisScorecard = z.object({
  id: z.string().min(1),
  runId: RunId,
  hypothesisId: HypothesisId,
  dimensions: z.array(DimensionScore).min(1),
  overallRationale: z.string().min(1),
  rankedOutOf: z.number().int().positive(),
  rank: z.number().int().positive(),
  comparisonNote: z.string().default('Scores are inspectable decision aids, not objective probabilities.'),
});
export type HypothesisScorecard = z.infer<typeof HypothesisScorecard>;

/** Structured pairwise comparison between two surviving candidates. */
export const HypothesisComparison = z.object({
  runId: RunId,
  aId: HypothesisId,
  bId: HypothesisId,
  preferred: z.enum(['a', 'b', 'incomparable']),
  criteria: z.array(z.object({
    criterion: z.string().min(1),
    favors: z.enum(['a', 'b', 'neither']),
    rationale: z.string().min(1),
  })).min(1),
  uncertainty: z.string().optional(),
});
export type HypothesisComparison = z.infer<typeof HypothesisComparison>;

/**
 * D-016 pairwise tournament record. Every match is judged TWICE in mirrored
 * presentation order within one call (position-bias cancellation, MT-Bench
 * methodology); verdict disagreement across the swap is an honest tie, and
 * 'incomparable' judge abstentions become no-contests. Bradley-Terry ILSR
 * aggregates contested matches into standings. All of it stays an
 * uncalibrated decision aid — never displayed as objective truth.
 */
export const TournamentMatch = z.object({
  aId: HypothesisId,
  bId: HypothesisId,
  aFirstVerdict: z.enum(['a', 'b', 'tie', 'incomparable']),
  bFirstVerdict: z.enum(['a', 'b', 'tie', 'incomparable']),
  rationale: z.string().min(10),
  producer: z.string().min(1),
  /** DETERMINISTIC aggregation of the two order-swapped verdicts. */
  outcome: z.enum(['a', 'b', 'tie', 'no_contest']),
});
export type TournamentMatch = z.infer<typeof TournamentMatch>;

export const TournamentStanding = z.object({
  hypothesisId: HypothesisId,
  /** Bradley-Terry strength (ILSR, ties counted as half-wins). Ordinal decision aid. */
  btScore: z.number().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  ties: z.number().int().nonnegative(),
  /** (wins + 0.5*ties) / contested matches; 0 when never contested. */
  winRate: z.number().min(0).max(1),
  rank: z.number().int().positive(),
});
export type TournamentStanding = z.infer<typeof TournamentStanding>;

export const HypothesisTournament = z.object({
  id: z.string().min(1),
  runId: RunId,
  participantIds: z.array(HypothesisId).min(2),
  matches: z.array(TournamentMatch).min(1),
  /** Empty when every match was a no-contest — ordering then falls back to the composite. */
  standings: z.array(TournamentStanding),
  algorithm: z.literal('bradley-terry-ilsr-v1'),
  uncertainty: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type HypothesisTournament = z.infer<typeof HypothesisTournament>;
