import { z } from 'zod';
import { zTwoSided } from './meta-math.js';

/**
 * W-F M2: structured effect estimates — the numeric input layer of statistical_meta
 * experiments (scout §2). An LLM PROPOSES these numbers from claim locators; this
 * module's DETERMINISTIC validators decide admission (fail-closed: any violation
 * drops the estimate with a countable reason, never a silent degradation).
 *
 * Scale convention: `point`/`ciLow`/`ciHigh` are stored on the RAW reported scale
 * (OR 1.5, RR 0.8, SMD -0.32); `toStudyEstimate` normalizes ratio measures to the
 * log scale for pooling.
 */

export const EffectMeasure = z.enum(['or', 'rr', 'smd']);
export type EffectMeasure = z.infer<typeof EffectMeasure>;

export const TwoByTwo = z.object({
  /** Exposed cases / exposed non-cases / control cases / control non-cases. */
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative(),
  c: z.number().int().nonnegative(),
  d: z.number().int().nonnegative(),
});
export type TwoByTwo = z.infer<typeof TwoByTwo>;

/** A VALIDATED estimate as persisted (rejected proposals are never stored). */
export const EffectEstimate = z.object({
  id: z.string().regex(/^efx_[0-9a-z]+$/),
  runId: z.string().min(1),
  /** The claim whose verbatim quote grounds these numbers (provenance inheritance). */
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  measure: EffectMeasure,
  /** Raw-scale point estimate as reported. */
  point: z.number().positive(),
  ciLow: z.number().positive().optional(),
  ciHigh: z.number().positive().optional(),
  ciLevel: z.number().positive().max(0.999).default(0.95),
  /** 2×2 reconstruction path when CI was not reported but counts were. */
  twoByTwo: TwoByTwo.optional(),
  nTotal: z.number().int().positive().optional(),
  /** Provenance: which model extracted these numbers (same convention as ScientificClaim). */
  extractionModelRef: z.string().min(1),
  extractedAt: z.string().datetime(),
});
export type EffectEstimate = z.infer<typeof EffectEstimate>;

/** Raw LLM proposal shape (pre-validation): everything optional except the anchor + numbers. */
export const EffectEstimateProposal = z.object({
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  measure: EffectMeasure,
  point: z.number(),
  ciLow: z.number().optional(),
  ciHigh: z.number().optional(),
  ciLevel: z.number().positive().max(0.999).optional(),
  twoByTwo: TwoByTwo.optional(),
  nTotal: z.number().int().positive().optional(),
});
export type EffectEstimateProposal = z.infer<typeof EffectEstimateProposal>;

export type ValidationOutcome =
  | { ok: true; se: number; note?: string }
  | { ok: false; reason: string };

/** Zero-cell continuity correction (disclosed convention, 0.5). */
export const ZERO_CELL_CORRECTION = 0.5;

const ln = Math.log;

/** SE(ln OR) from a 2×2 table with the disclosed 0.5 zero-cell correction. */
export const seLnOrFromTable = (t: TwoByTwo): number => {
  const { a, b, c, d } = corrected(t);
  return Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
};

/** SE(ln RR) from a 2×2 table with the same correction. */
export const seLnRrFromTable = (t: TwoByTwo): number => {
  const { a, b, c, d } = corrected(t);
  return Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d));
};

const corrected = (t: TwoByTwo): { a: number; b: number; c: number; d: number } => {
  const hasZero = t.a === 0 || t.b === 0 || t.c === 0 || t.d === 0;
  if (!hasZero) return t;
  return { a: t.a + ZERO_CELL_CORRECTION, b: t.b + ZERO_CELL_CORRECTION, c: t.c + ZERO_CELL_CORRECTION, d: t.d + ZERO_CELL_CORRECTION };
};

/** ln OR / ln RR point estimate from a corrected 2×2 table. */
export const lnEffectFromTable = (measure: 'or' | 'rr', t: TwoByTwo): number => {
  const { a, b, c, d } = corrected(t);
  return measure === 'or' ? ln((a / b) / (c / d)) : ln((a / (a + b)) / (c / (c + d)));
};

/**
 * Deterministic admission gate (scout §2.2). Every rule is a pure numeric invariant;
 * any violation rejects the proposal with a countable reason.
 */
export const validateEffectEstimate = (p: EffectEstimateProposal): ValidationOutcome => {
  if (!Number.isFinite(p.point)) return { ok: false, reason: 'point is not finite' };
  if (p.measure !== 'smd' && p.point <= 0) return { ok: false, reason: `${p.measure} point estimate must be > 0 on the raw scale, got ${p.point}` };
  if (p.measure === 'smd' && p.point === 0 && p.ciLow === undefined && p.twoByTwo === undefined) {
    return { ok: false, reason: 'smd point 0 with no CI and no table cannot yield a variance' };
  }

  // Reported-CI path: bounds must bracket the point on the RAW scale.
  if (p.ciLow !== undefined || p.ciHigh !== undefined) {
    if (p.ciLow === undefined || p.ciHigh === undefined) {
      return { ok: false, reason: 'partial CI (one bound) is unusable — need both or neither' };
    }
    if (p.measure !== 'smd' && (p.ciLow <= 0 || p.ciHigh <= 0)) {
      return { ok: false, reason: `${p.measure} CI bounds must be > 0, got [${p.ciLow}, ${p.ciHigh}]` };
    }
    if (!(p.ciLow < p.point && p.point < p.ciHigh)) {
      return { ok: false, reason: `CI must bracket the point: ciLow=${p.ciLow} < point=${p.point} < ciHigh=${p.ciHigh} violated` };
    }
    if (p.ciLow >= p.ciHigh) return { ok: false, reason: 'ciLow >= ciHigh' };
    const level = p.ciLevel ?? 0.95;
    // Scale discipline: ratio measures derive SE on the LOG scale; SMD is pooled on
    // its native scale, so its SE is the native half-width over 2z.
    const halfWidth = p.measure === 'smd'
      ? p.ciHigh - p.ciLow
      : ln(p.ciHigh) - ln(p.ciLow);
    const se = halfWidth / (2 * zTwoSided(1 - level));
    if (!Number.isFinite(se) || se <= 0) return { ok: false, reason: 'derived SE is not finite > 0' };

    // Cross-check against the 2×2 path when both are reported: a >3x SE discrepancy
    // means the numbers do not describe the same quantity — reject, never average.
    if (p.twoByTwo !== undefined && p.measure !== 'smd') {
      const tableSe = p.measure === 'or' ? seLnOrFromTable(p.twoByTwo) : seLnRrFromTable(p.twoByTwo);
      const ratio = Math.max(se, tableSe) / Math.min(se, tableSe);
      if (ratio > 3) {
        return { ok: false, reason: `CI-derived SE (${se.toFixed(4)}) and 2x2-derived SE (${tableSe.toFixed(4)}) differ by ${ratio.toFixed(1)}x — the numbers disagree about what was measured` };
      }
    }
    return { ok: true, se };
  }

  // No reported CI: the 2×2 path must be present and reconstruct both estimate + SE.
  if (p.twoByTwo === undefined) {
    return { ok: false, reason: 'no CI and no 2x2 table — no admissible variance source' };
  }
  if (p.measure === 'smd') {
    return { ok: false, reason: 'smd has no 2x2 reconstruction path — needs mean/SD/n inputs, out of minimal scope' };
  }
  const tableSe = p.measure === 'or' ? seLnOrFromTable(p.twoByTwo) : seLnRrFromTable(p.twoByTwo);
  const tablePoint = lnEffectFromTable(p.measure, p.twoByTwo);
  const reported = ln(p.point);
  // The reported point and the table must agree in direction within a loose factor —
  // a gross mismatch means the numbers are not the same contrast.
  if (Math.max(Math.abs(tablePoint), Math.abs(reported)) > 0 &&
      Math.abs(tablePoint - reported) > 1.5) {
    return { ok: false, reason: `2x2-implied ln ${p.measure} (${tablePoint.toFixed(3)}) differs from reported ln point (${reported.toFixed(3)}) by >1.5 — not the same contrast` };
  }
  return {
    ok: true,
    se: tableSe,
    note: 'variance reconstructed from 2x2 table (0.5 zero-cell correction when applicable — disclosed convention)',
  };
};

/** Normalized pooling input (log scale for ratio measures; native scale for SMD). */
export const toStudyEstimate = (
  est: Pick<EffectEstimate, 'measure' | 'point' | 'ciLow' | 'ciHigh' | 'ciLevel' | 'twoByTwo'>,
  label: string,
): { theta: number; v: number } => {
  const outcome = validateEffectEstimate({ ...est, claimId: '', sourceDocumentId: '' });
  if (!outcome.ok) throw new Error(`toStudyEstimate on an invalid estimate (${label}): ${outcome.reason}`);
  let theta: number;
  if (est.ciLow !== undefined && est.ciHigh !== undefined) {
    theta = est.measure === 'smd' ? est.point : ln(est.point);
  } else if (est.twoByTwo !== undefined && est.measure !== 'smd') {
    theta = lnEffectFromTable(est.measure, est.twoByTwo);
  } else {
    throw new Error(`toStudyEstimate (${label}): no CI and no table on a validated estimate — invariant broken`);
  }
  return { theta, v: outcome.se * outcome.se };
};

/**
 * Conservative duplicate collapse (scout Q5): two proposals from different claims with
 * EXACTLY equal numbers are the same trial reported twice — fold to the first, count
 * the rest. Overlapping-cohort detection is explicitly out of minimal scope (disclosed).
 */
export const dedupeEstimates = (
  estimates: readonly EffectEstimate[],
): { kept: EffectEstimate[]; duplicatesDropped: number } => {
  const seen = new Set<string>();
  const kept: EffectEstimate[] = [];
  let duplicatesDropped = 0;
  for (const e of estimates) {
    const key = `${e.measure}:${e.point}:${e.ciLow ?? ''}:${e.ciHigh ?? ''}:${e.twoByTwo ? `${e.twoByTwo.a}/${e.twoByTwo.b}/${e.twoByTwo.c}/${e.twoByTwo.d}` : ''}`;
    if (seen.has(key)) {
      duplicatesDropped += 1;
      continue;
    }
    seen.add(key);
    kept.push(e);
  }
  return { kept, duplicatesDropped };
};
