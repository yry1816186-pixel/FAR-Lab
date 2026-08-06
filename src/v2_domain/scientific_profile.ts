/**
 * Scientific profile: two-group fixture track + locked holdout.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §4,
 *   SPEC-012 (preregistered protocol).
 * Freeze: IMPL-021/033 (fixture track only; real holdout deferred).
 *
 * Fixture track: T1 synthetic + T2 fixture-derived tiers.
 * Real holdout (T5) requires independent science owner — deferred with trigger.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';

// ===========================================================================
// Profile definitions
// ===========================================================================

/** Scientific profile descriptor. */
export interface ScientificProfile {
  readonly profileId: string;
  readonly name: string;
  readonly groupCount: number;
  readonly metricKey: string;
  readonly description: string;
}

/** Frozen scientific profiles. */
export const SCIENTIFIC_PROFILES: readonly ScientificProfile[] = Object.freeze([
  {
    profileId: 'far.sci.two-group-fixture-v0.v1',
    name: 'Two-Group Fixture (v0)',
    groupCount: 2,
    metricKey: 'macro_f1',
    description: 'Treatment vs control with synthetic fixture data; Cohen d + Welch t-test; does NOT qualify for science verdict',
  },
]);

// ===========================================================================
// Fixture group definitions
// ===========================================================================

/** A group in the two-group fixture profile. */
export interface FixtureGroupDef {
  readonly groupId: string;
  readonly role: 'treatment' | 'control';
  readonly sampleSize: number;
  readonly seedBinding: string;  // 64-hex sha256 of declared PRNG seed
  readonly metricKey: string;
}

/** Frozen fixture group definitions (treatment + control). */
export const FIXTURE_GROUP_DEFS: readonly FixtureGroupDef[] = Object.freeze([
  {
    groupId: 'fixture-treatment-A',
    role: 'treatment',
    sampleSize: 120,
    seedBinding: createHash('sha256').update('fixture-seed-treatment-v0-001').digest('hex'),
    metricKey: 'macro_f1',
  },
  {
    groupId: 'fixture-control-B',
    role: 'control',
    sampleSize: 120,
    seedBinding: createHash('sha256').update('fixture-seed-control-v0-001').digest('hex'),
    metricKey: 'macro_f1',
  },
]);

// ===========================================================================
// buildScientificProfileResult
// ===========================================================================

/** Input for scientific profile result computation. */
export interface ScientificProfileInput {
  readonly profileId: string;
  readonly treatmentMean: number;
  readonly controlMean: number;
  readonly treatmentStd: number;
  readonly controlStd: number;
  readonly sampleSize: number;
  readonly metricKey: string;
  readonly dataTier: string;
  readonly preregistrationDigest: string;
}

/** Scientific profile result. */
export interface ScientificProfileResult {
  readonly profileId: string;
  readonly effectSize: number;       // raw mean difference
  readonly cohensD: number;          // standardized effect size
  readonly pValue: number | null;    // Welch t-test p-value (simplified)
  readonly tStatistic: number;
  readonly degreesOfFreedom: number;
  readonly isFixtureTrack: boolean;
  readonly qualifiesForScienceVerdict: boolean;
  readonly limitationNotice: string;
  readonly dataTier: string;
  readonly preregistrationDigest: string;
}

/** Fixture track tiers (T1 + T2 only). */
const FIXTURE_TRACK_TIERS = new Set(['T1_PURE_SYNTHETIC', 'T2_FIXTURE_DERIVED']);

/**
 * Build a scientific profile result from group statistics.
 * Computes Cohen's d + simplified Welch t-test.
 * Fixture track (T1/T2) → qualifiesForScienceVerdict=false.
 * Real holdout (T5) → qualifiesForScienceVerdict=true.
 */
export function buildScientificProfileResult(input: ScientificProfileInput): ScientificProfileResult {
  const { treatmentMean, controlMean, treatmentStd, controlStd, sampleSize, dataTier } = input;

  // Effect size (raw mean difference)
  const effectSize = treatmentMean - controlMean;

  // Pooled standard deviation (Cohen's formula for equal n)
  const pooledStd = Math.sqrt((treatmentStd * treatmentStd + controlStd * controlStd) / 2);
  const cohensD = pooledStd > 0 ? effectSize / pooledStd : 0;

  // Welch's t-test (simplified, assumes equal n per group)
  const se = Math.sqrt(
    (treatmentStd * treatmentStd) / sampleSize + (controlStd * controlStd) / sampleSize,
  );
  const tStatistic = se > 0 ? effectSize / se : 0;

  // Welch-Satterthwaite degrees of freedom
  const numerator = Math.pow(
    (treatmentStd * treatmentStd) / sampleSize + (controlStd * controlStd) / sampleSize,
    2,
  );
  const denominator =
    Math.pow(treatmentStd * treatmentStd / sampleSize, 2) / (sampleSize - 1) +
    Math.pow(controlStd * controlStd / sampleSize, 2) / (sampleSize - 1);
  const degreesOfFreedom = denominator > 0 ? numerator / denominator : sampleSize * 2 - 2;

  // Simplified two-tailed p-value from t-distribution (normal approximation for large df)
  const pValue = simplifiedTwoTailedP(tStatistic, degreesOfFreedom);

  const isFixtureTrack = FIXTURE_TRACK_TIERS.has(dataTier);
  const qualifiesForScienceVerdict = dataTier === 'T5_REAL_HOLDOUT';

  const limitationNotice = isFixtureTrack
    ? 'FIXTURE/SYNTHETIC DATA — this result does NOT qualify as scientific validation. Only T5_REAL_HOLDOUT data qualifies.'
    : qualifiesForScienceVerdict
      ? 'Real holdout data — qualifies for scientific verdict qualification.'
      : 'Non-fixture data tier — requires governance review.';

  return {
    profileId: input.profileId,
    effectSize,
    cohensD,
    pValue,
    tStatistic,
    degreesOfFreedom,
    isFixtureTrack,
    qualifiesForScienceVerdict,
    limitationNotice,
    dataTier,
    preregistrationDigest: input.preregistrationDigest,
  };
}

// ===========================================================================
// assertFixtureTrackOnly
// ===========================================================================

/**
 * Assert that a data tier is within the fixture track (T1 or T2).
 * T3-T5 require governance approval beyond agent scope.
 * @throws NOT_FIXTURE_TRACK if tier is T3+.
 */
export function assertFixtureTrackOnly(dataTier: string): void {
  if (!FIXTURE_TRACK_TIERS.has(dataTier)) {
    throw new Error(
      `NOT_FIXTURE_TRACK: data tier "${dataTier}" is outside the fixture track (T1/T2). T3-T5 require independent governance approval.`,
    );
  }
}

// ===========================================================================
// Simplified p-value (normal approximation)
// ===========================================================================

/**
 * Simplified two-tailed p-value from t-statistic.
 * Uses normal approximation for large degrees of freedom (>30).
 * For small df, applies a conservative correction.
 * This is NOT a production statistical library — it's a deterministic fixture computation.
 */
function simplifiedTwoTailedP(t: number, df: number): number {
  const absT = Math.abs(t);
  // For large df, t-distribution ≈ normal distribution
  // p ≈ 2 * (1 - Φ(|t|)) where Φ is the standard normal CDF
  // Using the approximation: p ≈ exp(-0.717*|t| - 0.416*|t|²) for |t| > 0
  if (absT < 0.001) return 1.0;

  // Abramowitz & Stegun normal CDF approximation
  const z = absT * Math.sqrt(df / (df - 2 + 0.001)); // small-sample correction
  const p = 2 * (1 - normalCdf(z));

  return Math.max(0, Math.min(1, p));
}

/** Standard normal CDF approximation (Abramowitz & Stegun 26.2.17). */
function normalCdf(x: number): number {
  if (x < 0) return 1 - normalCdf(-x);
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
