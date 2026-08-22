import { z } from 'zod';
import { PredictionId, RunId } from './ids.js';

/**
 * Wave-S/d3 — L4 self-calibration loop. Every forward-looking claim the system emits
 * (structured predictions, VOI expectations, rank orders, judge verdicts) lands in this
 * ledger; when the outcome settles (EEL verdict / feedback / timeout-void) it is scored
 * with proper scoring rules against disclosed ignorance baselines. Scoring-rule ancestry:
 * Gneiting & Raftery 2007 (JASA); RPS for ordered classes (Murphy 1970s tradition).
 * Calibration anchors for interpretation (Dreber 2015 PNAS ~71–73%; Metaculus community
 * Brier 0.207 vs 0.25 ignorant) live in the report, not the schema.
 */

export const VERDICT_CLASSES = ['supports', 'inconclusive', 'weakens', 'falsifies'] as const;
export type VerdictClass = (typeof VERDICT_CLASSES)[number];

export const PredictionKind = z.enum([
  'expected_relation', 'voi_separation', 'rank_order', 'judge_verdict', 'grade_certainty',
]);
export type PredictionKind = z.infer<typeof PredictionKind>;

export const LedgerEntry = z.object({
  id: PredictionId,
  runId: RunId,
  kind: PredictionKind,
  /** Pipeline stage that emitted the prediction (stratification axis). */
  stage: z.string().min(1),
  /** Producer identity, e.g. "plan-structured-preregistration" or "rank-tournament". */
  predictor: z.string().min(1),
  /** The assertion itself, e.g. {hypothesisId, observable, condition, expectedRelation}. */
  assertion: z.record(z.string(), z.unknown()),
  /** Optional context digest so later readers can reconstruct what was known then. */
  contextDigest: z.string().optional(),
  predictedAt: z.string().datetime(),
  /** Class probability vector over VERDICT_CLASSES when the kind implies one. */
  probs: z.array(z.number().min(0).max(1)).length(VERDICT_CLASSES.length).optional(),
  settlesWith: z.enum(['experiment_verdict', 'feedback', 'manual', 'timeout']),
  settledAt: z.string().datetime().optional(),
  outcome: z.record(z.string(), z.unknown()).optional(),
  scores: z.object({
    /** Ranked probability score — primary: the only proper rule that accounts for the
     * ORDER of the 4 verdict classes. */
    rps: z.number(),
    brier: z.number(),
    /** −ln(p_outcome), clamped so honest-but-unsure never receives an infinite penalty. */
    logClamped: z.number(),
    /** 1 − rps/rps(uniform): >0 beats the ignorance baseline, <0 loses to it — shown as-is. */
    skillVsUniform: z.number(),
  }).optional(),
  /** Settlements that never happened (deadline, superseded) stay visible, never deleted. */
  voidReason: z.string().optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

// ---------------------------------------------------------------------------
// Proper scoring rules (pure, no rounding at the API boundary).

export const rpsScore = (probs: readonly number[], outcomeIndex: number): number => {
  let acc = 0;
  let cumP = 0;
  let cumO = 0;
  for (let i = 0; i < probs.length - 1; i += 1) {
    const p = probs[i];
    if (p === undefined) break;
    cumP += p;
    cumO += i === outcomeIndex ? 1 : 0;
    acc += (cumP - cumO) ** 2;
  }
  return acc;
};

export const brierScore = (probs: readonly number[], outcomeIndex: number): number =>
  probs.reduce((acc, p, i) => acc + (p - (i === outcomeIndex ? 1 : 0)) ** 2, 0);

export const clampedLogScore = (
  probs: readonly number[],
  outcomeIndex: number,
  clamp = 1e-3,
): number => -Math.log(Math.max(probs[outcomeIndex] ?? 0, clamp));

export const UNIFORM_PROBS: readonly number[] = VERDICT_CLASSES.map(() => 1 / VERDICT_CLASSES.length);

/** Disclosed convention: a mode assertion (expected class, no distribution) becomes a
 * 0.55/0.15/0.15/0.15 vector — confident-but-not-certain, never a dishonest one-hot.
 * Unmatched phrasing falls back to UNIFORM: silence about direction is ignorance, not support. */
export const MODE_CONFIDENCE = 0.55;

export const probsFromExpected = (expectedRelation: string): number[] => {
  const norm = expectedRelation.toLowerCase();
  const idx = norm.includes('falsif')
    ? 3
    : norm.includes('weaken') || norm.includes('contradict') || norm.includes('decrease')
      ? 2
      : norm.includes('inconclusive') || norm.includes('unclear') || norm.includes('no change') || norm.includes('no relation')
        ? 1
        : norm.includes('support') || norm.includes('increase') || norm.includes('improve') || norm.includes('higher')
          ? 0
          : -1;
  if (idx < 0) return UNIFORM_PROBS.slice();
  const base = VERDICT_CLASSES.map(() => (1 - MODE_CONFIDENCE) / (VERDICT_CLASSES.length - 1));
  base[idx] = MODE_CONFIDENCE;
  return base;
};

// ---------------------------------------------------------------------------
// Settlement + reporting.

export interface SettleInput {
  outcomeClass: VerdictClass;
  settledAt: string;
  outcome?: Record<string, unknown>;
}

/** Immutable settlement: returns the scored entry (scores + settledAt + outcome). */
export const settleEntry = (entry: LedgerEntry, input: SettleInput): LedgerEntry => {
  if (entry.settledAt !== undefined || entry.voidReason !== undefined) return entry;
  const probs = entry.probs ?? UNIFORM_PROBS.slice();
  const outcomeIndex = VERDICT_CLASSES.indexOf(input.outcomeClass);
  if (outcomeIndex < 0) throw new Error(`prediction: unknown outcome class ${input.outcomeClass}`);
  const rps = rpsScore(probs, outcomeIndex);
  const baseline = rpsScore(UNIFORM_PROBS, outcomeIndex);
  return {
    ...entry,
    settledAt: input.settledAt,
    outcome: input.outcome ?? { class: input.outcomeClass },
    scores: {
      rps,
      brier: brierScore(probs, outcomeIndex),
      logClamped: clampedLogScore(probs, outcomeIndex),
      skillVsUniform: baseline > 0 ? 1 - rps / baseline : 0,
    },
  };
};

export interface CalibrationStratum {
  kind: PredictionKind;
  n: number;
  meanRps: number;
  meanBrier: number;
  /** Mean skill vs the uniform-ignorance baseline; negative = worse than knowing nothing. */
  meanSkillVsUniform: number;
  /** d3 honesty rule: below 30 settled predictions a stratum says "insufficient", no curve. */
  insufficientEvidence: boolean;
}

export const calibrationReport = (entries: readonly LedgerEntry[]): {
  stratified: CalibrationStratum[];
  settledTotal: number;
  openTotal: number;
} => {
  const settled = entries.filter((e) => e.scores !== undefined);
  const byKind = new Map<PredictionKind, typeof settled>();
  for (const e of settled) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  const stratified: CalibrationStratum[] = [...byKind.entries()].map(([kind, list]) => {
    const n = list.length;
    const mean = (f: (e: LedgerEntry) => number): number =>
      Number((list.reduce((acc, e) => acc + f(e), 0) / n).toFixed(6));
    return {
      kind,
      n,
      meanRps: mean((e) => e.scores?.rps ?? 0),
      meanBrier: mean((e) => e.scores?.brier ?? 0),
      meanSkillVsUniform: mean((e) => e.scores?.skillVsUniform ?? 0),
      insufficientEvidence: n < 30,
    };
  }).sort((a, b) => b.n - a.n);
  return { stratified, settledTotal: settled.length, openTotal: entries.length - settled.length };
};
