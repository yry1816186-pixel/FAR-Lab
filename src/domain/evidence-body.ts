import { z } from 'zod';
import { EvidenceBodyId, HypothesisId, RunId } from './ids.js';
import { RELATION_POLARITY, type EvidenceRelation } from './evidence.js';
import type { ScientificClaim } from './claim.js';
import {
  LogLrBand, ProofStandard, bandOf, logLrInterval, proofStandardOf, qbafStrength, sumLogLr,
  type LogLrItem,
} from './formal.js';

/**
 * Wave-S/s3+g8 — hypothesis-level evidence-body rating. Claim-level GRADE stays as is;
 * this is the body-of-evidence view a promotion decision actually needs: floor certainty
 * over key claims, INDEPENDENT source count (claim count ≠ evidence strength), the
 * formal Σlog-LR band, the QBAF aggregate and the Carneades proof standard met.
 */

const GRADE_ORDER = ['high', 'moderate', 'low', 'very_low'] as const;
type GradeLevel = (typeof GRADE_ORDER)[number];

export const EvidenceBodyPromotion = z.enum([
  /** ≥2 orthogonal experimental axes back the verdict. */
  'orthogonal',
  /** Experiment exists but on a single axis — explicitly downgraded, shown as such. */
  'single_source',
  /** Literature-only support; no experimental axis has spoken yet. */
  'literature_only_unverified',
  /** Nothing positive on record. */
  'none',
]);
export type EvidenceBodyPromotion = z.infer<typeof EvidenceBodyPromotion>;

export const EvidenceBody = z.object({
  id: EvidenceBodyId,
  runId: RunId,
  hypothesisId: HypothesisId,
  /** Min gradeCertainty across key supporting claims (absent when none are graded). */
  floorCertainty: z.enum(['high', 'moderate', 'low', 'very_low']).optional(),
  /** Distinct sources contributing evidential relations — the real evidence count. */
  independentSources: z.number().int().nonnegative(),
  sumLogLrLow: z.number(),
  sumLogLrHigh: z.number(),
  logLrBand: LogLrBand,
  qbafScore: z.number().min(0).max(1),
  proofStandard: ProofStandard,
  /** Distinct experimental axes (dataset/model/split) observed in experiment feedback. */
  experimentalAxes: z.number().int().nonnegative(),
  promotion: EvidenceBodyPromotion,
  /** Human-readable disclosure incl. capped sources and excluded neutral relations. */
  disclosure: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type EvidenceBody = z.infer<typeof EvidenceBody>;

export interface BuildEvidenceBodyInput {
  id: EvidenceBodyId;
  runId: RunId;
  hypothesisId: HypothesisId;
  relations: readonly EvidenceRelation[];
  claims: readonly ScientificClaim[];
  /** Distinct orthogonal experimental axes observed for this hypothesis (g7 input). */
  experimentalAxes: number;
  now: string;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Assemble the deterministic evidence body for one hypothesis. Pure; no LLM anywhere. */
export const buildEvidenceBody = (input: BuildEvidenceBodyInput): EvidenceBody => {
  const { id, runId, hypothesisId, relations, claims, experimentalAxes, now } = input;
  const claimsById = new Map(claims.map((c) => [c.id as string, c] as const));
  const mine = relations.filter((r) => r.targetHypothesisId === hypothesisId);

  const sourceKeyOf = (r: EvidenceRelation): string => {
    if (r.sourceDocumentId !== undefined) return r.sourceDocumentId;
    if (r.claimId !== undefined) {
      const src = claimsById.get(r.claimId)?.locators[0]?.sourceDocumentId;
      if (src !== undefined) return src;
    }
    return 'unattributed';
  };

  const items: LogLrItem[] = mine.map((r) => ({
    relation: r.relation,
    strength: r.strength,
    sourceKey: sourceKeyOf(r),
  }));
  const summary = sumLogLr(items);
  const independentSources = new Set(items.map((i) => i.sourceKey)).size;

  // Floor certainty over key SUPPORTING claims (counter-evidence cannot raise a floor).
  const supportingClaimIds = new Set(
    mine
      .filter((r) => r.claimId !== undefined && RELATION_POLARITY[r.relation] === 'supporting')
      .map((r) => r.claimId as string),
  );
  const grades = [...supportingClaimIds]
    .map((cid) => claimsById.get(cid)?.gradeCertainty)
    .filter((g): g is GradeLevel => g !== undefined)
    .map((g) => GRADE_ORDER.indexOf(g));
  const floorCertainty = grades.length > 0 ? GRADE_ORDER[Math.max(...grades)] : undefined;

  // QBAF: claim nodes (base = graded certainty level / 4, ungraded 0.5) + the hypothesis node.
  const nodes: { id: string; base: number }[] = [{ id: hypothesisId, base: 0.5 }];
  const edges: { from: string; to: string; weight: number }[] = [];
  for (const r of mine) {
    if (r.claimId === undefined) continue;
    const interval = logLrInterval(r.relation, r.strength);
    if (interval === null) continue;
    const polarity = RELATION_POLARITY[r.relation];
    if (polarity === 'neutral') continue;
    const sign = polarity === 'supporting' ? 1 : -1;
    const weight = sign * clamp01(Math.abs((interval[0] + interval[1]) / 2) / 2);
    if (weight === 0) continue;
    const grade = claimsById.get(r.claimId)?.gradeCertainty;
    const base = grade !== undefined ? (GRADE_ORDER.indexOf(grade) + 1) / 4 : 0.5;
    if (!nodes.some((n) => n.id === r.claimId)) nodes.push({ id: r.claimId, base });
    edges.push({ from: r.claimId, to: hypothesisId, weight });
  }
  const strengths = qbafStrength(nodes, edges);
  const qbafScore = Number((strengths.get(hypothesisId) ?? 0.5).toFixed(6));

  const promotion: EvidenceBodyPromotion =
    experimentalAxes >= 2 ? 'orthogonal'
      : experimentalAxes === 1 ? 'single_source'
        : summary.midpoint > 0.15 ? 'literature_only_unverified'
          : 'none';

  const disclosure =
    `${summary.contributions} evidential relation(s) from ${independentSources} independent source(s); ` +
    `${summary.sourcesCapped} dropped by the per-source cap (correlated evidence ≠ independent confirmation); ` +
    `${summary.excluded} neutral/structural relation(s) excluded; floor certainty=${floorCertainty ?? 'ungraded'}; ` +
    `Σlog10LR ∈ [${summary.low.toFixed(2)}, ${summary.high.toFixed(2)}] → band ${bandOf(summary.midpoint)}; ` +
    `experimentalAxes=${experimentalAxes} → promotion=${promotion} (g7: ≥2 orthogonal axes required for full promotion).`;

  return EvidenceBody.parse({
    id,
    runId,
    hypothesisId,
    ...(floorCertainty !== undefined ? { floorCertainty } : {}),
    independentSources,
    sumLogLrLow: Number(summary.low.toFixed(6)),
    sumLogLrHigh: Number(summary.high.toFixed(6)),
    logLrBand: bandOf(summary.midpoint),
    qbafScore,
    proofStandard: proofStandardOf(qbafScore),
    experimentalAxes,
    promotion,
    disclosure,
    createdAt: now,
  });
};

/**
 * g7 orthogonal-axis count from experiment feedback signals: distinct values across the
 * dataset/model/split fields a signal may carry. Unknown shapes count as zero — the
 * downgrade then shows up honestly in `promotion` instead of being guessed upward.
 */
export const countExperimentalAxes = (
  signals: readonly { source: string; structured?: Record<string, unknown> }[],
): number => {
  const axes = new Set<string>();
  for (const s of signals) {
    if (s.source !== 'experiment' || s.structured === undefined) continue;
    for (const key of ['dataset', 'datasetId', 'model', 'modelId', 'split', 'splitId'] as const) {
      const v = s.structured[key];
      if (typeof v === 'string' && v.length > 0) axes.add(`${key}:${v}`);
    }
  }
  return axes.size;
};
