/**
 * Deterministic effect-size utilities for preregistered statistical evidence.
 *
 * The functions here accept raw numeric samples and compute descriptive and
 * standardized effects without reading ambient state. Callers decide whether a
 * returned estimate is verdict-critical; this layer only supplies the math.
 */

export interface SampleSummary {
  readonly sampleSize: number;
  readonly mean: number;
  readonly variance: number;
  readonly standardDeviation: number;
}

/** Interface defining two sample effect size. */
export interface TwoSampleEffectSize {
  readonly differenceInMeans: number;
  readonly pooledStandardDeviation: number;
  readonly cohensD: number;
  readonly hedgesG: number;
  readonly hedgesCorrection: number;
}

/**
 * sample mean.
 */
export function sampleMean(values: readonly number[]): number {
  assertFiniteSample(values, 'values', 1);
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/**
 * sample variance.
 */
export function sampleVariance(values: readonly number[]): number {
  assertFiniteSample(values, 'values', 2);
  const mean = sampleMean(values);
  let squaredDeviationTotal = 0;
  for (const value of values) {
    const delta = value - mean;
    squaredDeviationTotal += delta * delta;
  }
  return squaredDeviationTotal / (values.length - 1);
}

/**
 * sample standard deviation.
 */
export function sampleStandardDeviation(values: readonly number[]): number {
  return Math.sqrt(sampleVariance(values));
}

/**
 * pooled standard deviation.
 */
export function pooledStandardDeviation(
  left: readonly number[],
  right: readonly number[],
): number {
  assertFiniteSample(left, 'left', 2);
  assertFiniteSample(right, 'right', 2);
  const degreesOfFreedom = left.length + right.length - 2;
  const weightedVariance =
    ((left.length - 1) * sampleVariance(left) + (right.length - 1) * sampleVariance(right)) /
    degreesOfFreedom;
  return Math.sqrt(weightedVariance);
}

/**
 * cohens d one sample.
 */
export function cohensDOneSample(sample: readonly number[], nullMean: number): number {
  assertFiniteNumber(nullMean, 'nullMean');
  const sd = sampleStandardDeviation(sample);
  if (sd === 0) {
    throw new Error('cohensDOneSample: sample standard deviation must be non-zero');
  }
  return (sampleMean(sample) - nullMean) / sd;
}



/**
 * hedges correction.
 */
export function hedgesCorrection(degreesOfFreedom: number): number {
  assertFiniteNumber(degreesOfFreedom, 'degreesOfFreedom');
  if (degreesOfFreedom <= 1) {
    throw new Error('hedgesCorrection: degreesOfFreedom must be greater than 1');
  }
  return 1 - 3 / (4 * degreesOfFreedom - 1);
}

/**
 * two sample effect size.
 */
export function twoSampleEffectSize(
  left: readonly number[],
  right: readonly number[],
): TwoSampleEffectSize {
  const pooledSd = pooledStandardDeviation(left, right);
  if (pooledSd === 0) {
    throw new Error('twoSampleEffectSize: pooled standard deviation must be non-zero');
  }
  const differenceInMeans = sampleMean(left) - sampleMean(right);
  const degreesOfFreedom = left.length + right.length - 2;
  const correction = hedgesCorrection(degreesOfFreedom);
  const cohensD = differenceInMeans / pooledSd;
  return {
    differenceInMeans,
    pooledStandardDeviation: pooledSd,
    cohensD,
    hedgesG: cohensD * correction,
    hedgesCorrection: correction,
  };
}

function assertFiniteSample(values: readonly number[], name: string, minimumLength: number): void {
  if (values.length < minimumLength) {
    throw new Error(`${name}: expected at least ${minimumLength} observation(s), got ${values.length}`);
  }
  for (const value of values) {
    assertFiniteNumber(value, name);
  }
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}: expected a finite number, got ${value}`);
  }
}
