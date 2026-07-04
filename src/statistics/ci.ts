/**
 * Confidence interval helpers for statistical evidence.
 */

import { sampleMean, sampleStandardDeviation } from './effect_size.ts';
import { normalQuantile } from './p_value.ts';

export interface ConfidenceInterval {
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: number;
  readonly standardError: number;
}

export function normalApproximationInterval(
  estimate: number,
  standardError: number,
  confidenceLevel = 0.95,
): ConfidenceInterval {
  assertFiniteNumber(estimate, 'estimate');
  assertPositiveNumber(standardError, 'standardError');
  assertConfidenceLevel(confidenceLevel);
  const alpha = 1 - confidenceLevel;
  const zCritical = normalQuantile(1 - alpha / 2);
  const margin = zCritical * standardError;
  return {
    estimate,
    lower: estimate - margin,
    upper: estimate + margin,
    confidenceLevel,
    standardError,
  };
}

export function meanConfidenceInterval(
  sample: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (sample.length < 2) {
    throw new Error('meanConfidenceInterval: sample must contain at least two observations');
  }
  const estimate = sampleMean(sample);
  const standardError = sampleStandardDeviation(sample) / Math.sqrt(sample.length);
  return normalApproximationInterval(estimate, standardError, confidenceLevel);
}

export function differenceInMeansConfidenceInterval(
  left: readonly number[],
  right: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (left.length < 2 || right.length < 2) {
    throw new Error('differenceInMeansConfidenceInterval: both samples need at least two observations');
  }
  const leftVariance = sampleStandardDeviation(left) ** 2;
  const rightVariance = sampleStandardDeviation(right) ** 2;
  const standardError = Math.sqrt(leftVariance / left.length + rightVariance / right.length);
  const estimate = sampleMean(left) - sampleMean(right);
  return normalApproximationInterval(estimate, standardError, confidenceLevel);
}

export function wilsonScoreInterval(
  successes: number,
  trials: number,
  confidenceLevel = 0.95,
): ConfidenceInterval {
  assertCount(successes, 'successes');
  assertCount(trials, 'trials');
  if (trials === 0) {
    throw new Error('wilsonScoreInterval: trials must be greater than zero');
  }
  if (successes > trials) {
    throw new Error('wilsonScoreInterval: successes cannot exceed trials');
  }
  assertConfidenceLevel(confidenceLevel);
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const pHat = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (pHat + zSquared / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) *
    Math.sqrt((pHat * (1 - pHat) + zSquared / (4 * trials)) / trials);
  return {
    estimate: pHat,
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
    confidenceLevel,
    standardError: Math.sqrt((pHat * (1 - pHat)) / trials),
  };
}

function assertConfidenceLevel(value: number): void {
  assertFiniteNumber(value, 'confidenceLevel');
  if (value <= 0 || value >= 1) {
    throw new Error(`confidenceLevel: expected a value strictly between 0 and 1, got ${value}`);
  }
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}: expected a non-negative integer, got ${value}`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`${name}: expected a positive number, got ${value}`);
  }
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}: expected a finite number, got ${value}`);
  }
}
