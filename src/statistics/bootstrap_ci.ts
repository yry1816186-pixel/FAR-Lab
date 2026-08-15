/**
 * Deterministic non-parametric bootstrap confidence interval for the sample mean.
 *
 * Background (T-006/T-044 · 2026-07-24 CP-9): pairs with `permutation_test.ts`
 * to close the non-parametric resampling gap identified by . Bootstrap (Efron 1979)
 * estimates the sampling distribution of a statistic by resampling with replacement —
 * no distributional assumption (unlike the normal-approximation CIs in `ci.ts`).
 *
 * Algorithm (percentile bootstrap CI for the mean):
 *   1. For k = 1..iterations: draw n observations from `sample` with replacement (seeded RNG),
 *      compute x̄_k = mean(resample);
 *   2. Sort the x̄_k array;
 *   3. Percentile CI: lower = sorted[⌈(α/2)·iterations⌉−1], upper = sorted[⌈(1−α/2)·iterations⌉−1]
 *      (α = 1 − confidenceLevel).
 *
 * Why percentile (not BCa) for V1: percentile is the simplest correct bootstrap CI; BCa adds
 * bias-correction + acceleration (jackknife) which needs extra computation and has known
 * numerical-instability for small samples. V1 ships percentile; BCa is a documented V2 upgrade.
 * This is the honest scope.
 *
 * Determinism (F2): seeded via mulberry32 (re-used from permutation_test.ts — single source of
 * truth for seeded RNG). Same seed + same input ⇒ identical CI, bit-for-bit. No ambient RNG.
 *
 * Honest limits:
 *   - Percentile bootstrap has coverage error O(1/n) for the mean (BCa reduces to O(1/n²));
 *     callers needing higher accuracy should wait for BCa (V2) or use analytical CIs when
 *     the distributional assumption is justified.
 *   - For very small samples (n < 5) the bootstrap distribution is coarse — the CI is valid
 *     but wide. We do not assert minimum sample size beyond n ≥ 2 (mean requires n ≥ 1; CI is
 *     meaningless for n=1 — caller's responsibility).
 *   - `iterations` controls Monte Carlo noise on the percentile estimates; default 9999 gives
 *     CI edges stable to ~0.5% of the estimate's spread.
 *
 * No LLM.
 */

import { createMulberry32 } from './permutation_test.ts';

/** Bootstrap percentile CI for the mean. */
export interface BootstrapMeanCiResult {
  /** Original sample mean (point estimate · center of CI). */
  readonly estimate: number;
  /** Lower bound of the (1−α) percentile CI. */
  readonly lower: number;
  /** Upper bound of the (1−α) percentile CI. */
  readonly upper: number;
  /** Confidence level (e.g. 0.95 for a 95% CI). */
  readonly confidenceLevel: number;
  /** Number of bootstrap resamples performed. */
  readonly iterations: number;
  /** Seed used (transparency · reproducibility). */
  readonly seed: number;
}

/** Options for the bootstrap CI. */
export interface BootstrapMeanCiOptions {
  /** Seed for the deterministic mulberry32 RNG (required · no ambient RNG). */
  readonly seed: number;
  /** Number of bootstrap resamples (default 9999). */
  readonly iterations?: number;
  /** Confidence level ∈ (0, 1) (default 0.95). */
  readonly confidenceLevel?: number;
}

/**
 * Percentile bootstrap CI for the sample mean.
 *
 * @param sample - input sample (≥1 finite observation)
 * @param options - { seed, iterations?, confidenceLevel? }
 * @returns BootstrapMeanCiResult (estimate + lower + upper + confidenceLevel + iterations + seed)
 * @throws if sample is empty / non-finite, or options are invalid (seed non-integer,
 *         iterations non-positive, confidenceLevel outside (0,1))
 */
export function bootstrapMeanPercentileCi(
  sample: readonly number[],
  options: BootstrapMeanCiOptions,
): BootstrapMeanCiResult {
  assertFiniteSample(sample, 'sample');
  if (sample.length < 2) {
    throw new Error(
      `bootstrapMeanPercentileCi: sample must contain at least 2 observations for a meaningful CI (got ${sample.length})`,
    );
  }
  if (!Number.isSafeInteger(options.seed)) {
    throw new Error(
      `bootstrapMeanPercentileCi: options.seed must be a safe integer (got ${options.seed}) — no ambient RNG allowed (F2 determinism)`,
    );
  }
  const iterations = options.iterations ?? 9999;
  if (!Number.isSafeInteger(iterations) || iterations < 2) {
    throw new Error(
      `bootstrapMeanPercentileCi: options.iterations must be a safe integer ≥ 2 (got ${iterations}) — need ≥2 points for a percentile`,
    );
  }
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(
      `bootstrapMeanPercentileCi: options.confidenceLevel must be in (0, 1) (got ${confidenceLevel})`,
    );
  }

  const n = sample.length;
  const estimate = meanOf(sample);

  // Seeded RNG (mulberry32 — shared with permutation_test · single source of truth).
  const rng = createMulberry32(options.seed);

  // Resample `iterations` times, computing the mean of each bootstrap resample.
  const bootstrapMeans: number[] = new Array(iterations);
  for (let k = 0; k < iterations; k += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      // Index ∈ [0, n): floor(uint32 / 2^32 * n) is uniform on {0, 1, …, n−1}.
      const idx = Math.floor((rng() / 0x100000000) * n);
      sum += sample[idx]!;
    }
    bootstrapMeans[k] = sum / n;
  }

  // Sort ascending to take percentile cutoffs.
  bootstrapMeans.sort(compareAscending);

  // Percentile indices: 1-based positions mapped back to 0-based array.
  // lower = sorted[⌈(α/2)·iterations⌉ − 1], upper = sorted[⌈(1−α/2)·iterations⌉ − 1]
  // (Efron & Tibshirani 1993 §13.3 — the standard percentile-method formula).
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.ceil((alpha / 2) * iterations) - 1;
  const upperIdx = Math.ceil((1 - alpha / 2) * iterations) - 1;
  // Clamp to valid array bounds (defensive — should not trigger for iterations ≥ 2 and α ∈ (0,1)).
  const safeLowerIdx = Math.max(0, Math.min(iterations - 1, lowerIdx));
  const safeUpperIdx = Math.max(0, Math.min(iterations - 1, upperIdx));

  const lower = bootstrapMeans[safeLowerIdx]!;
  const upper = bootstrapMeans[safeUpperIdx]!;

  return {
    estimate,
    lower,
    upper,
    confidenceLevel,
    iterations,
    seed: options.seed,
  };
}

/** Arithmetic mean of a non-empty finite sample. */
function meanOf(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
}

/** Numeric ascending comparator (deterministic · NaN-free guaranteed by assertFiniteSample). */
function compareAscending(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function assertFiniteSample(values: readonly number[], name: string): void {
  if (values.length < 1) {
    throw new Error(`${name}: expected at least 1 observation, got ${values.length}`);
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name}: expected a finite number, got ${value}`);
    }
  }
}
