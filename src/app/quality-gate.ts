import { createHash } from 'node:crypto';
import type { HypothesisScorecard, HypothesisTournament } from '../domain/index.js';

/**
 * Deterministic post-rank quality gate (breakthrough BP-1).
 *
 * The pipeline used to accept whatever rank produced and barrel into plan. This
 * module turns "the ranked set looks weak" into a mechanical signal the
 * orchestrator can act on (one bounded regeneration round). Every threshold is
 * documented and deterministic — no LLM judges whether the LLM output was weak.
 *
 * Signal rules (any one fires):
 * - fewer than 2 ranked hypotheses — no genuine competition existed;
 * - top composite below WEAK_TOP_COMPOSITE — even the best candidate is thin;
 * - order-swap disagreement above WEAK_SWAP_DISAGREEMENT — pairwise verdicts are
 *   so inconsistent that the ordering itself is noise (MT-Bench position-bias
 *   control failing its own consistency check).
 */

export const WEAK_TOP_COMPOSITE = 0.45;
export const WEAK_SWAP_DISAGREEMENT = 0.4;
/** Hard bound: initial round + at most one regeneration round. */
export const MAX_QUALITY_ROUNDS = 2;

export interface QualityGateMetrics {
  ranked: number;
  topComposite: number | null;
  /** max-min Bradley-Terry score across standings (null when no contested tournament). */
  btSpread: number | null;
  /** Share of contested matches whose mirrored verdicts disagreed (-> tie). */
  swapDisagreementRate: number | null;
}

export interface QualityGateSignal {
  weak: boolean;
  reasons: string[];
  metrics: QualityGateMetrics;
  /** Lowest-scoring dimensions of the top hypotheses — the critique handed to regeneration. */
  weakDimensions: Array<{ hypothesisId: string; rank: number; dimensions: Array<{ dimension: string; value: number }> }>;
}

/** Composite per scorecard overallRationale is prose; recompute from dimensions with the canonical weights is rank's job — the gate reads the persisted ranked set directly. */
export const evaluateQualityGate = (
  scorecards: HypothesisScorecard[],
  tournament: HypothesisTournament | null,
): QualityGateSignal => {
  const ranked = [...scorecards].sort((a, b) => a.rank - b.rank);
  const reasons: string[] = [];

  if (ranked.length < 2) {
    reasons.push(`only ${ranked.length} ranked hypothesis/hypotheses — no genuine competition to rank`);
  }

  const top = ranked[0];
  let topComposite: number | null = null;
  if (top !== undefined) {
    const values = top.dimensions.map((d) => (typeof d.value === 'number' ? d.value : null)).filter((v): v is number => v !== null);
    if (values.length > 0) {
      // plain mean of reported dimension values mirrors "even a thin average" detection;
      // the canonical weighted composite lives in rank.ts — the gate only needs a
      // comparable central tendency over the SAME persisted dimensions.
      topComposite = values.reduce((a, b) => a + b, 0) / values.length;
      if (topComposite < WEAK_TOP_COMPOSITE) {
        reasons.push(`top hypothesis mean dimension score ${topComposite.toFixed(3)} < ${WEAK_TOP_COMPOSITE} — even the best candidate is thin`);
      }
    }
  }

  let btSpread: number | null = null;
  let swapDisagreementRate: number | null = null;
  if (tournament !== null && tournament.matches.length > 0) {
    const contested = tournament.matches.filter((m) => m.outcome !== 'no_contest');
    if (contested.length > 0) {
      const scores = tournament.standings.map((s) => s.btScore);
      if (scores.length >= 2) btSpread = Math.max(...scores) - Math.min(...scores);
      const disagreed = contested.filter((m) => m.outcome === 'tie' && m.aFirstVerdict !== m.bFirstVerdict).length;
      swapDisagreementRate = disagreed / contested.length;
      if (swapDisagreementRate > WEAK_SWAP_DISAGREEMENT) {
        reasons.push(
          `order-swap disagreement ${Math.round(swapDisagreementRate * 100)}% > ${Math.round(WEAK_SWAP_DISAGREEMENT * 100)}% across ${contested.length} contested match(es) — the ordering itself is noise`,
        );
      }
    }
  }

  // Critique payload: for each of the top hypotheses, its two lowest reported dimensions.
  const weakDimensions = ranked.slice(0, 3).map((s) => ({
    hypothesisId: s.hypothesisId,
    rank: s.rank,
    dimensions: [...s.dimensions]
      .filter((d) => typeof d.value === 'number')
      .sort((a, b) => (a.value as number) - (b.value as number))
      .slice(0, 2)
      .map((d) => ({ dimension: d.dimension, value: d.value as number })),
  }));

  return {
    weak: reasons.length > 0,
    reasons,
    metrics: { ranked: ranked.length, topComposite, btSpread, swapDisagreementRate },
    weakDimensions,
  };
};

/** Stable object id for upsert-by-content projections (re-runs overwrite, never duplicate). */
export const deterministicId = (prefix: string, ...parts: string[]): string =>
  `${prefix}_${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 26)}`;
