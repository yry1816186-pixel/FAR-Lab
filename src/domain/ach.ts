import { z } from 'zod';
import { AchAnalysisId, ClaimId, HypothesisId, RunId } from './ids.js';
import type { EvidenceRelation } from './evidence.js';
import { logLrInterval } from './formal.js';

/**
 * Wave-S/s3+g9 — Heuer ACH steps 4–6 as deterministic functions (the product already
 * renders the matrix; what was missing is DIAGNOSTICITY scoring and REMOVAL SENSITIVITY).
 * Both are pure; neither calls a model. (Heuer 1999 Ch.8; canonical 8 steps — the public
 * compressed 7-step version drops exactly the two we are restoring here.)
 */

export const DiagnosticityScore = z.object({
  claimId: ClaimId,
  /** 0..1 — how unevenly this claim's evidence distributes across hypotheses. */
  score: z.number().min(0).max(1),
  /** Net log10-LR contribution per hypothesis (disclosed, the matrix behind the score). */
  netByHypothesis: z.record(z.string(), z.number()),
});
export type DiagnosticityScore = z.infer<typeof DiagnosticityScore>;

export const RemovalSensitivity = z.object({
  removedTopK: z.number().int().nonnegative(),
  orderBefore: z.array(HypothesisId),
  orderAfter: z.array(HypothesisId),
  /** Inversion count between the two orders (0 = perfectly stable). */
  inversions: z.number().int().nonnegative(),
  stable: z.boolean(),
});
export type RemovalSensitivity = z.infer<typeof RemovalSensitivity>;

export const AchAnalysis = z.object({
  id: AchAnalysisId,
  runId: RunId,
  hypothesisIds: z.array(HypothesisId),
  diagnosticity: z.array(DiagnosticityScore),
  removalSensitivity: RemovalSensitivity,
  method: z.literal('heuer-diagnosticity-v1'),
  createdAt: z.string().datetime(),
});
export type AchAnalysis = z.infer<typeof AchAnalysis>;

const midpointOf = (r: EvidenceRelation): number | null => {
  const interval = logLrInterval(r.relation, r.strength);
  return interval === null ? null : (interval[0] + interval[1]) / 2;
};

/** Per-claim × per-hypothesis net log10-LR matrix. */
const netMatrix = (
  relations: readonly EvidenceRelation[],
): Map<string, Map<string, number>> => {
  const matrix = new Map<string, Map<string, number>>();
  for (const r of relations) {
    if (r.claimId === undefined || r.targetHypothesisId === undefined) continue;
    const m = midpointOf(r);
    if (m === null || m === 0) continue;
    const row = matrix.get(r.claimId) ?? new Map<string, number>();
    row.set(r.targetHypothesisId, (row.get(r.targetHypothesisId) ?? 0) + m);
    matrix.set(r.claimId, row);
  }
  return matrix;
};

/**
 * Diagnosticity (Heuer step 4-5): a claim discriminates when its net contribution SPREADS
 * UNEVENLY across hypotheses. Score = range / total mass (0 = even/und diagnostic, →1 =
 * fully one-sided). Claims touching fewer than two hypotheses cannot discriminate.
 */
export const diagnosticityScores = (
  relations: readonly EvidenceRelation[],
): DiagnosticityScore[] => {
  const matrix = netMatrix(relations);
  const out: DiagnosticityScore[] = [];
  for (const [claimId, row] of matrix) {
    if (row.size < 2) continue;
    const values = [...row.values()];
    const range = Math.max(...values) - Math.min(...values);
    const mass = values.reduce((acc, v) => acc + Math.abs(v), 0);
    out.push(DiagnosticityScore.parse({
      claimId,
      score: Number((range / (mass + 1e-9)).toFixed(6)),
      netByHypothesis: Object.fromEntries([...row.entries()].map(([h, v]) => [h, Number(v.toFixed(6))])),
    }));
  }
  return out.sort((a, b) => b.score - a.score);
};

/** Evidence-total ordering of hypotheses (Σ over all claim rows). */
const orderByEvidenceTotal = (
  matrix: Map<string, Map<string, number>>,
  hypothesisIds: readonly string[],
): string[] =>
  [...hypothesisIds]
    .map((id) => {
      let total = 0;
      for (const row of matrix.values()) total += row.get(id) ?? 0;
      return { id, total };
    })
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1))
    .map((x) => x.id);

const countInversions = (before: readonly string[], after: readonly string[]): number => {
  const pos = new Map(before.map((id, i) => [id, i] as const));
  let inversions = 0;
  for (let i = 0; i < after.length; i += 1) {
    for (let j = i + 1; j < after.length; j += 1) {
      const ai = after[i];
      const aj = after[j];
      if (ai === undefined || aj === undefined) continue;
      const pi = pos.get(ai);
      const pj = pos.get(aj);
      if (pi !== undefined && pj !== undefined && pi > pj) inversions += 1;
    }
  }
  return inversions;
};

/**
 * Removal sensitivity (Heuer step 6): drop the top-k most diagnostic claims, recompute
 * the evidence-total order, count inversions. A ranking that flips when its most
 * diagnostic evidence is removed is fragile — that fragility is shown, not hidden.
 */
export const removalSensitivity = (
  relations: readonly EvidenceRelation[],
  hypothesisIds: readonly string[],
  opts: { topK?: number } = {},
): RemovalSensitivity => {
  const topK = opts.topK ?? 3;
  const full = netMatrix(relations);
  const orderBefore = orderByEvidenceTotal(full, hypothesisIds);
  const top = diagnosticityScores(relations).slice(0, topK).map((d) => d.claimId as string);
  const removed = netMatrix(relations.filter((r) => r.claimId === undefined || !top.includes(r.claimId)));
  const orderAfter = orderByEvidenceTotal(removed, hypothesisIds);
  const inversions = countInversions(orderBefore, orderAfter);
  return RemovalSensitivity.parse({
    removedTopK: top.length,
    orderBefore,
    orderAfter,
    inversions,
    stable: inversions === 0,
  });
};

export const buildAchAnalysis = (input: {
  id: AchAnalysisId;
  runId: RunId;
  hypothesisIds: readonly HypothesisId[];
  relations: readonly EvidenceRelation[];
  now: string;
}): AchAnalysis => AchAnalysis.parse({
  id: input.id,
  runId: input.runId,
  hypothesisIds: [...input.hypothesisIds],
  diagnosticity: diagnosticityScores(input.relations),
  removalSensitivity: removalSensitivity(input.relations, input.hypothesisIds),
  method: 'heuer-diagnosticity-v1',
  createdAt: input.now,
});
