/**
 * Deterministic two-sample permutation test on the mean difference.
 *
 * Background (T-006/T-044 · 2026-07-24 CP-9): identified the
 * B→A- science-depth gap — `src/statistics/` covered t-test-style p-values, effect sizes,
 * CIs, multiple testing, and (after T-046) KS, but lacked non-parametric resampling methods
 * (permutation/bootstrap). Permutation tests are a standard non-parametric method for
 * two-sample inference: exhaustive enumeration gives exact p-values under the null of
 * exchangeability; this implementation is the seeded Monte Carlo approximation described
 * below (Fisher 1935; Good 2006 §1).
 *
 * Algorithm (two-sample mean-difference permutation test):
 *   1. observed statistic: T_obs = mean(sample1) − mean(sample2)
 *   2. pool N = n1 + n2 observations and put their exact binary values in a
 *      canonical order;
 *   3. for k = 1..iterations: shuffle the pool (seeded RNG), split into the
 *      smaller group size and its complement,
 *      compute T_k = mean(first n1) − mean(last n2);
 *   4. two-sided p-value = (#{k : |T_k| ≥ |T_obs|} + 1) / (iterations + 1)
 *      (the +1 numerator and denominator is the standard conservatism correction —
 *       Phipson & Smyth 2010 — so that the observed statistic always counts and p > 0).
 *
 * Determinism (F2): seeded via mulberry32 (caller passes `seed`). Same seed + same two
 * empirical multisets ⇒ identical two-sided p-value, bit-for-bit, regardless of row order
 * or which sample is named first. No ambient RNG (Math.random forbidden). Pure function.
 * Fisher–Yates indices use rejection sampling over equal-width uint32 buckets; direct
 * `floor(u * bound)` is intentionally avoided because it is biased when bound does not
 * divide 2^32.
 *
 * Honest limits:
 *   - Asymptotic exactness requires `iterations → ∞`; with finite `iterations` the p-value
 *     has Monte Carlo noise of order O(1/√iterations). Default 9999 gives SD ≈ 0.003 for p≈0.05.
 *   - For very small samples the test is valid but low-powered (the enumeration space is tiny).
 *     Sampling is with replacement: setting `iterations ≥ C(n1+n2, n1)` does not guarantee
 *     that every allocation was visited and therefore does not turn this into an exact test.
 *   - We do not implement the exact full-enumeration path. Callers requiring an exact test need
 *     a separate exhaustive enumerator with an explicit combinatorial-explosion guard.
 *   - Extremeness treats each supplied JavaScript Number as its exact IEEE-754 dyadic value.
 *     An arithmetic transform that rounds to different doubles can therefore change a boundary
 *     count; this function cannot infer a caller's pre-rounding decimal intent.
 *   - `observedStatistic` is the correctly rounded binary64 projection of that exact rational,
 *     not an arbitrary-precision return value. Magnitudes below half the smallest subnormal
 *     canonicalize to +0; values that round to infinity fail closed with rescaling guidance.
 *
 * No LLM.
 */

/** Permutation test result. */
export interface PermutationTestResult {
  /** Finite observed mean difference T_obs = mean(sample1) − mean(sample2). */
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

const UINT32_RANGE = 0x100000000;

/**
 * Two-sample mean-difference permutation test.
 *
 * @param sample1 - first sample (≥1 finite observation)
 * @param sample2 - second sample (≥1 finite observation)
 * @param options - { seed, iterations? }
 * @returns PermutationTestResult (observedStatistic + pValue + iterations + extremeCount + seed)
 * @throws if either sample is empty, contains non-finite values, a mean difference
 *         exceeds the finite IEEE-754 range, or options.seed is not a safe integer
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
  // A two-sided allocation and its complement have the same absolute statistic.
  // Always sampling the smaller side makes the seeded Monte Carlo trace invariant
  // when callers exchange the two sample labels, including when n1 !== n2.
  const permutationGroupSize = Math.min(n1, n2);

  // Pool the supplied doubles. Every later statistic is derived from their exact
  // IEEE-754 dyadic values, so neither caller row order nor floating accumulation
  // order can change the reported statistic or the extremeness boundary.
  const pool: number[] = new Array(total);
  for (let i = 0; i < n1; i += 1) {
    pool[i] = sample1[i]!;
  }
  for (let j = 0; j < n2; j += 1) {
    pool[n1 + j] = sample2[j]!;
  }
  // Every finite double is a dyadic rational. Encode the raw values at one
  // common power-of-two scale so permutation extremeness can be
  // compared exactly for the values the caller actually supplied. This avoids
  // both accumulation-order ties and epsilon bands that can promote a genuinely
  // smaller, representable statistic.
  const exactEncoding = encodeExactDyadicIntegers(pool);
  const exactPool = exactEncoding.integers;
  let exactTotal = 0n;
  for (const value of exactPool) exactTotal += value;
  const exactObservedSignedNumerator = exactMeanDifferenceNumerator(exactPool, n1, exactTotal);
  const exactObservedNumerator = absoluteBigInt(exactObservedSignedNumerator);
  const exactMeanDifferenceDenominator = BigInt(n1) * BigInt(n2);
  const observedStatistic = exactDyadicMeanDifferenceToNumber(
    exactObservedSignedNumerator,
    exactMeanDifferenceDenominator,
    exactEncoding.binaryExponent,
  );

  // A fixed random-word stream must identify allocations from the empirical
  // multisets, not from arbitrary caller row order. Equal exact values are
  // interchangeable observations and need no secondary identity key.
  exactPool.sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));

  // Seeded RNG (mulberry32) — deterministic given seed.
  const rng = createMulberry32(options.seed);

  let extremeCount = 0;
  for (let k = 0; k < iterations; k += 1) {
    // Fisher–Yates shuffle the pool (last index → first), then split at the
    // canonical smaller group size. Shuffling the whole pool is the standard
    // implementation (Good 2006 §2.3). Each shuffle is O(total).
    for (let i = total - 1; i > 0; i -= 1) {
      // mulberry32 returns uint32; rejection sampling maps it without modulo/scaling bias.
      const j = drawUniformIndex(rng, i + 1);
      const exactTmp = exactPool[i]!;
      exactPool[i] = exactPool[j]!;
      exactPool[j] = exactTmp;
    }
    // Both the finite-range guard and extremeness comparison use the exact dyadic
    // numerator. The common scale and denominator n1*n2 cancel from >=.
    const exactPermutationSignedNumerator = exactMeanDifferenceNumerator(
      exactPool,
      permutationGroupSize,
      exactTotal,
    );
    assertExactMeanDifferenceRoundsFinite(
      exactPermutationSignedNumerator,
      exactMeanDifferenceDenominator,
      exactEncoding.binaryExponent,
    );
    const exactPermutationNumerator = absoluteBigInt(exactPermutationSignedNumerator);
    if (exactPermutationNumerator >= exactObservedNumerator) {
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
 * Returns a function that produces the next uint32 on each call. `drawUniformIndex` consumes
 * these words with rejection sampling so incomplete buckets cannot bias shuffle indices.
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

/**
 * Draw an unbiased integer in [0, boundExclusive) from a uint32 source.
 *
 * Equal-width quotient buckets preserve the historical scaled mapping for all
 * but the unavoidable uneven boundary values; the incomplete tail is rejected.
 * This keeps seeded streams deterministic while removing the former unequal-bucket bias.
 * Compatibility: a seed that lands on a shifted bucket boundary or rejected tail can
 * produce a different downstream shuffle than the biased implementation; that change is
 * intentional and is pinned by boundary plus end-to-end reference-vector tests.
 */
function drawUniformIndex(rng: () => number, boundExclusive: number): number {
  if (
    !Number.isSafeInteger(boundExclusive)
    || boundExclusive < 1
    || boundExclusive > UINT32_RANGE
  ) {
    throw new RangeError(`drawUniformIndex: boundExclusive must be an integer in [1, 2^32], got ${boundExclusive}`);
  }
  const bucketWidth = Math.floor(UINT32_RANGE / boundExclusive);
  const acceptanceLimit = bucketWidth * boundExclusive;
  while (true) {
    const sample = rng();
    if (!Number.isInteger(sample) || sample < 0 || sample >= UINT32_RANGE) {
      throw new RangeError(`drawUniformIndex: rng must return a uint32, got ${sample}`);
    }
    if (sample < acceptanceLimit) return Math.floor(sample / bucketWidth);
  }
}

/**
 * Encode finite IEEE-754 doubles as integers at one common binary exponent.
 * Multiplying every value by the same positive power of two cannot change the
 * ordering of absolute mean differences.
 */
function encodeExactDyadicIntegers(values: readonly number[]): {
  readonly integers: bigint[];
  readonly binaryExponent: number;
} {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  const components: Array<{ significand: bigint; exponent: number }> = [];
  let commonExponent = Number.POSITIVE_INFINITY;

  for (const value of values) {
    view.setFloat64(0, value, false);
    const high = view.getUint32(0, false);
    const low = view.getUint32(4, false);
    const exponentBits = (high >>> 20) & 0x7ff;
    const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
    if (exponentBits === 0 && fraction === 0n) {
      components.push({ significand: 0n, exponent: 0 });
      continue;
    }
    const magnitude = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
    const significand = (high & 0x80000000) === 0 ? magnitude : -magnitude;
    const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
    components.push({ significand, exponent });
    commonExponent = Math.min(commonExponent, exponent);
  }

  if (commonExponent === Number.POSITIVE_INFINITY) {
    return { integers: values.map(() => 0n), binaryExponent: 0 };
  }
  return {
    integers: components.map(({ significand, exponent }) => (
      significand === 0n
        ? 0n
        : significand << BigInt(exponent - commonExponent)
    )),
    binaryExponent: commonExponent,
  };
}

/**
 * Correctly round an exact signed dyadic rational to binary64.
 *
 * `numerator * 2^binaryExponent / denominator` is rounded with IEEE-754
 * round-to-nearest, ties-to-even. Converting the BigInt numerator to Number first
 * would introduce double rounding (and can overflow before a cancelling division),
 * so quotient selection remains integer-only until the final exactly representable
 * significand is scaled by a power of two.
 */
function exactDyadicMeanDifferenceToNumber(
  numerator: bigint,
  denominator: bigint,
  binaryExponent: number,
): number {
  if (numerator === 0n) return 0;
  if (denominator <= 0n || !Number.isSafeInteger(binaryExponent)) {
    throw new RangeError('permutationTestMeanDifference: invalid exact mean-difference encoding');
  }

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let value: number;
  const valueExponent = floorBinaryExponent(magnitude, denominator, binaryExponent);

  if (valueExponent < -1022) {
    // Subnormal binary64 values have a fixed unit of 2^-1074. Rounding can
    // legitimately produce +0 or carry into the smallest normal value.
    const significand = roundedRatioOfPowersOfTwo(
      magnitude,
      denominator,
      binaryExponent + 1074,
    );
    if (significand === 0n) return 0;
    value = Number(significand) * Number.MIN_VALUE;
  } else {
    let roundedExponent = valueExponent;
    let significand = roundedRatioOfPowersOfTwo(
      magnitude,
      denominator,
      binaryExponent - valueExponent + 52,
    );
    if (significand === (1n << 53n)) {
      significand = 1n << 52n;
      roundedExponent += 1;
    }
    if (roundedExponent > 1023) {
      throwMeanDifferenceRangeError();
    }
    value = Number(significand) * (2 ** (roundedExponent - 52));
  }

  if (!Number.isFinite(value)) throwMeanDifferenceRangeError();
  return negative ? -value : value;
}

/** Reject an exact mean difference whose correctly rounded binary64 is infinite. */
function assertExactMeanDifferenceRoundsFinite(
  numerator: bigint,
  denominator: bigint,
  binaryExponent: number,
): void {
  const magnitude = absoluteBigInt(numerator);
  if (magnitude === 0n) return;

  // Round-to-nearest overflows at the midpoint above Number.MAX_VALUE:
  // 2^1024 - 2^970 = (2^54 - 1) * 2^970. Equality selects infinity
  // under ties-to-even because MAX's 53-bit significand is odd.
  const thresholdSignificand = (1n << 54n) - 1n;
  const thresholdNumerator = denominator * thresholdSignificand;
  const shift = binaryExponent - 970;
  const reachesOverflowMidpoint = shift >= 0
    ? (magnitude << BigInt(shift)) >= thresholdNumerator
    : magnitude >= (thresholdNumerator << BigInt(-shift));
  if (reachesOverflowMidpoint) throwMeanDifferenceRangeError();
}

/** floor(log2(numerator * 2^binaryExponent / denominator)). */
function floorBinaryExponent(
  numerator: bigint,
  denominator: bigint,
  binaryExponent: number,
): number {
  const candidate = bigintBitLength(numerator) - bigintBitLength(denominator) + binaryExponent;
  const shift = binaryExponent - candidate;
  const atLeastCandidate = shift >= 0
    ? (numerator << BigInt(shift)) >= denominator
    : numerator >= (denominator << BigInt(-shift));
  return atLeastCandidate ? candidate : candidate - 1;
}

/** Round `(numerator / denominator) * 2^shift` to an integer, ties-to-even. */
function roundedRatioOfPowersOfTwo(
  numerator: bigint,
  denominator: bigint,
  shift: number,
): bigint {
  const dividend = shift >= 0 ? numerator << BigInt(shift) : numerator;
  const divisor = shift >= 0 ? denominator : denominator << BigInt(-shift);
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  const doubledRemainder = remainder << 1n;
  const roundsUp = doubledRemainder > divisor
    || (doubledRemainder === divisor && (quotient & 1n) === 1n);
  return roundsUp ? quotient + 1n : quotient;
}

function bigintBitLength(value: bigint): number {
  return value.toString(2).length;
}

function throwMeanDifferenceRangeError(): never {
  throw new RangeError(
    'permutationTestMeanDifference: mean difference exceeds the finite IEEE-754 range; rescale inputs to a smaller common unit',
  );
}

/** Exact numerator proportional to mean(group1) - mean(group2). */
function exactMeanDifferenceNumerator(
  values: readonly bigint[],
  n1: number,
  totalSum: bigint,
): bigint {
  let firstSum = 0n;
  for (let index = 0; index < n1; index += 1) firstSum += values[index]!;
  return firstSum * BigInt(values.length) - totalSum * BigInt(n1);
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
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
