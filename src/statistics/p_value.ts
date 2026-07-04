/**
 * Normal-approximation p-value calculations for statistical evidence.
 *
 * These utilities are deterministic and side-effect free. They intentionally
 * return explicit test statistics plus p-values so downstream verdict code can
 * preserve the calculation trace instead of hand-filling significance fields.
 */

import { sampleMean, sampleStandardDeviation } from './effect_size.ts';

export type AlternativeHypothesis = 'less' | 'greater' | 'two_sided';

export interface ZTestResult {
  readonly statistic: number;
  readonly pValue: number;
  readonly standardError: number;
  readonly alternative: AlternativeHypothesis;
}

export function erf(x: number): number {
  assertFiniteNumber(x, 'x');
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const polynomial = (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
  const estimate = 1 - polynomial * Math.exp(-abs * abs);
  return sign * estimate;
}

export function normalCdf(x: number): number {
  assertFiniteNumber(x, 'x');
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function normalSurvival(x: number): number {
  return 1 - normalCdf(x);
}

export function zTestPValue(
  zScore: number,
  alternative: AlternativeHypothesis,
): number {
  assertFiniteNumber(zScore, 'zScore');
  switch (alternative) {
    case 'less':
      return clampProbability(normalCdf(zScore));
    case 'greater':
      return clampProbability(normalSurvival(zScore));
    case 'two_sided':
      return clampProbability(2 * normalSurvival(Math.abs(zScore)));
  }
}

export function oneSampleZTest(
  sample: readonly number[],
  nullMean: number,
  populationStandardDeviation: number,
  alternative: AlternativeHypothesis = 'two_sided',
): ZTestResult {
  assertFiniteNumber(nullMean, 'nullMean');
  assertPositiveNumber(populationStandardDeviation, 'populationStandardDeviation');
  if (sample.length === 0) {
    throw new Error('oneSampleZTest: sample must contain at least one observation');
  }
  const standardError = populationStandardDeviation / Math.sqrt(sample.length);
  const statistic = (sampleMean(sample) - nullMean) / standardError;
  return {
    statistic,
    pValue: zTestPValue(statistic, alternative),
    standardError,
    alternative,
  };
}

export function twoSampleWelchZTest(
  left: readonly number[],
  right: readonly number[],
  alternative: AlternativeHypothesis = 'two_sided',
): ZTestResult {
  const leftVariance = sampleStandardDeviation(left) ** 2;
  const rightVariance = sampleStandardDeviation(right) ** 2;
  const standardError = Math.sqrt(leftVariance / left.length + rightVariance / right.length);
  if (standardError === 0) {
    throw new Error('twoSampleWelchZTest: standard error must be non-zero');
  }
  const statistic = (sampleMean(left) - sampleMean(right)) / standardError;
  return {
    statistic,
    pValue: zTestPValue(statistic, alternative),
    standardError,
    alternative,
  };
}

export function normalQuantile(probability: number): number {
  assertProbabilityOpen(probability, 'probability');

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ] as const;
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ] as const;
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ] as const;
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ] as const;

  const plow = 0.02425;
  const phigh = 1 - plow;
  if (probability < plow) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability <= phigh) {
    const q = probability - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - probability));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function clampProbability(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}: expected a finite number, got ${value}`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`${name}: expected a positive number, got ${value}`);
  }
}

function assertProbabilityOpen(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value <= 0 || value >= 1) {
    throw new Error(`${name}: expected a probability strictly between 0 and 1, got ${value}`);
  }
}
