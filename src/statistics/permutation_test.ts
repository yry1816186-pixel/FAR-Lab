/**
 * Deterministic two-sample permutation test on the mean difference.
 *
 * Background (T-006/T-044 · 2026-07-24 CP-9): identified the
 * B→A- science-depth gap — `src/statistics/` covered t-test-style p-values, effect sizes,
 * CIs, multiple testing, and (after T-046) KS, but lacked non-parametric resampling methods
 * (permutation/bootstrap). Permutation tests are the gold standard for non-parametric
 * two-sample inference: they make no distributional assumptions (unlike t-test) and give
 * exact p-values under the null of exchangeability (Fisher 1935; Good 2006 §1).
 *
 * Algorithm (two-sample mean-difference permutation test):
 *   1. observed statistic: T_obs = mean(sample1) − mean(sample2)
 *   2. pool N = n1 + n2 observations;
 *   3. for k = 1..iterations: shuffle the pool (seeded RNG), split into n1 / n2,
 *      compute T_k = mean(first n1) − mean(last n2);
 *   4. two-sided p-value = (#{k : |T_k| ≥ |T_obs|} + 1) / (iterations + 1)
 *      (the +1 numerator and denominator is the standard conservatism correction —
 *       Phipson & Smyth 2010 — so that the observed statistic always counts and p > 0).
 *
 * Determinism (F2): seeded via mulberry32 (caller passes `seed`). Same seed + same input ⇒
 * identical p-value, bit-for-bit. No ambient RNG (Math.random forbidden). Pure function.
 *
 * Honest limits:
 *   - Asymptotic exactness requires `iterations → ∞`; with finite `iterations` the p-value
 *     has Monte Carlo noise of order O(1/√iterations). Default 9999 gives SD ≈ 0.003 for p≈0.05.
 *   - For very small samples the test is valid but low-powered (the enumeration space is tiny).
 *     Callers wanting the exact test should use `iterations ≥ C(n1+n2, n1)` (the full enumeration).
 *   - We do not implement the exact full-enumeration path (combinatorial explosion guards are
 *     the caller's responsibility); this is the Monte Carlo approximation, documented as such.
 *
 * No LLM.
 */

/** Permutation test result. */
export interface PermutationTestResult {
  /** Observed mean difference T_obs = mean(sample1) − mean(sample2). */
  readonly observedStatistic: number;
  /** Two-sided permutation p-value ∈ (0, 1] (Phipson–Smyth +1 correction applied). */
  readonly pValue: number;
  /** Number of permutations performed. */
  readonly iterations: number;
  /** Number of permutations with |T_k| ≥ |T_obs| (pre-correction count). */
  readonly extremeCount: number;
  /** Seed used (transparency · reproducibility). */
  readonly seed: number;
}

/** Options for the permutation test. */
export interface PermutationTestOptions {
  /** Seed for the deterministic mulberry32 RNG (required · no ambient RNG). */
  readonly seed: number;
  /** Number of permutations (default 9999). Higher → tighter Monte Carlo CI on p. */
  readonly iterations?: number;
}

/**
 * Two-sample mean-difference permutation test.
 *
 * @param sample1 - first sample (≥1 finite observation)
 * @param sample2 - second sample (≥1 finite observation)
 * @param options - { seed, iterations? }
 * @returns PermutationTestResult (observedStatistic + pValue + iterations + extremeCount + seed)
 * @throws if either sample is empty, contains non-finite values, or options.seed is not a safe integer
 */
export function permutationTestMeanDifference(
  sample1: readonly number[],
  sample2: readonly number[],
  options: PermutationTestOptions,
): PermutationTestResult {
  assertFiniteSample(sample1, 'sample1');
  assertFiniteSample(sample2, 'sample2');
  if (!Number.isSafeInteger(options.seed)) {
    throw new Error(
      `permutationTestMeanDifference: options.seed must be a safe integer (got ${options.seed}) — no ambient RNG allowed (F2 determinism)`,
    );
  }
  const iterations = options.iterations ?? 9999;
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new Error(
      `permutationTestMeanDifference: options.iterations must be a positive safe integer (got ${iterations})`,
    );
  }

  const n1 = sample1.length;
  const n2 = sample2.length;
  const total = n1 + n2;

  // Observed statistic T_obs = mean1 − mean2
  const observedStatistic = meanOf(sample1) - meanOf(sample2);
  const absObserved = Math.abs(observedStatistic);

  // Pool samples into a single mutable working array (we shuffle in place).
  const pool: number[] = new Array(total);
  for (let i = 0; i < n1; i += 1) {
    pool[i] = sample1[i]!;
  }
  for (let j = 0; j < n2; j += 1) {
    pool[n1 + j] = sample2[j]!;
  }

  // Seeded RNG (mulberry32) — deterministic given seed.
  const rng = createMulberry32(options.seed);

  let extremeCount = 0;
  for (let k = 0; k < iterations; k += 1) {
    // Fisher–Yates shuffle the pool (last index → first), then split at n1.
    // We only need the first n1 vs the rest; shuffling the whole pool is the standard
    // implementation (Good 2006 §2.3). Each shuffle is O(total).
    for (let i = total - 1; i > 0; i -= 1) {
      // mulberry32 returns uint32; map to [0, i] inclusive.
      // floor(uint32 / 2^32 * (i+1)) is uniform on {0,1,…,i} — bounded-rejection-free
      // because (i+1) << 2^32 and the quotient floor gives exactly i+1 equally-likely buckets.
      const j = Math.floor((rng() / 0x100000000) * (i + 1));
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    // T_k = mean(first n1) − mean(last n2)
    let sum1 = 0;
    for (let i = 0; i < n1; i += 1) {
      sum1 += pool[i]!;
    }
    let sum2 = 0;
    for (let i = n1; i < total; i += 1) {
      sum2 += pool[i]!;
    }
    const tK = sum1 / n1 - sum2 / n2;
    if (Math.abs(tK) >= absObserved) {
      extremeCount += 1;
    }
  }

  // Phipson–Smyth +1 correction (both numerator and denominator): guarantees p > 0 and
  // accounts for the observed statistic itself being part of the null distribution.
  const pValue = (extremeCount + 1) / (iterations + 1);

  return {
    observedStatistic,
    pValue,
    iterations,
    extremeCount,
    seed: options.seed,
  };
}

/**
 * mulberry32 — a fast, deterministic 32-bit PRNG (seed → () => uint32 in [0, 2^32)).
 *
 * Reference: public-domain algorithm by Tomm Bruggeman (mulberry32). Widely used in JS for
 * reproducible seeded shuffling. State is a single uint32 (no ambient/global state).
 *
 * Determinism: same seed ⇒ identical sequence, always, across platforms (pure integer math).
 * Period: 2^32 (sufficient for statistical resampling; not cryptographic — never use for security).
 *
 * Returns a function that produces the next uint32 on each call. The output is a float in
 * [0, 1) — we divide by 2^32 = 0x100000000 in the caller to land in [0, 1) for index mapping.
 */
export function createMulberry32(seed: number): () => number {
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`createMulberry32: seed must be a safe integer (got ${seed})`);
  }
  // Coerce to uint32 (seed & 0xffffffff) so negative seeds behave identically modulo 2^32.
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0);
    return result;
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
