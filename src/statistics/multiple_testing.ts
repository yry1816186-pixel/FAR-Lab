/**
 * Multiple-testing correction utilities.
 */

export type MultipleTestingCorrection = 'none' | 'bonferroni' | 'holm' | 'bh_fdr';

/** Interface defining adjusted p value. */
export interface AdjustedPValue {
  readonly index: number;
  readonly rawPValue: number;
  readonly adjustedPValue: number;
  readonly rejected: boolean;
}

interface IndexedPValue {
  readonly index: number;
  readonly rawPValue: number;
}

/**
 * adjust p values.
 */
export function adjustPValues(
  rawPValues: readonly number[],
  correction: MultipleTestingCorrection,
  alpha = 0.05,
): readonly AdjustedPValue[] {
  validateAlpha(alpha);
  validatePValues(rawPValues);
  switch (correction) {
    case 'none':
      return rawPValues.map((pValue, index) => makeAdjusted(index, pValue, pValue, alpha));
    case 'bonferroni':
      return rawPValues.map((pValue, index) =>
        makeAdjusted(index, pValue, Math.min(1, pValue * rawPValues.length), alpha),
      );
    case 'holm':
      return holmAdjust(rawPValues, alpha);
    case 'bh_fdr':
      return benjaminiHochbergAdjust(rawPValues, alpha);
  }
}

function holmAdjust(rawPValues: readonly number[], alpha: number): readonly AdjustedPValue[] {
  const sorted = indexed(rawPValues);
  let runningMax = 0;
  const adjustedSorted: AdjustedPValue[] = [];
  for (let rank = 0; rank < sorted.length; rank++) {
    const item = readIndexed(sorted, rank);
    const adjusted = Math.min(1, (sorted.length - rank) * item.rawPValue);
    runningMax = Math.max(runningMax, adjusted);
    adjustedSorted.push(makeAdjusted(item.index, item.rawPValue, runningMax, alpha));
  }
  return byOriginalIndex(adjustedSorted);
}

function benjaminiHochbergAdjust(
  rawPValues: readonly number[],
  alpha: number,
): readonly AdjustedPValue[] {
  const sorted = indexed(rawPValues);
  let runningMin = 1;
  const adjustedDescending: AdjustedPValue[] = [];
  for (let rank = sorted.length - 1; rank >= 0; rank--) {
    const item = readIndexed(sorted, rank);
    const adjusted = Math.min(1, (sorted.length / (rank + 1)) * item.rawPValue);
    runningMin = Math.min(runningMin, adjusted);
    adjustedDescending.push(makeAdjusted(item.index, item.rawPValue, runningMin, alpha));
  }
  return byOriginalIndex(adjustedDescending);
}

function indexed(rawPValues: readonly number[]): readonly IndexedPValue[] {
  return rawPValues
    .map((rawPValue, index) => ({ index, rawPValue }))
    .sort((a, b) => a.rawPValue - b.rawPValue || a.index - b.index);
}

function byOriginalIndex(values: readonly AdjustedPValue[]): readonly AdjustedPValue[] {
  return [...values].sort((a, b) => a.index - b.index);
}

function makeAdjusted(
  index: number,
  rawPValue: number,
  adjustedPValue: number,
  alpha: number,
): AdjustedPValue {
  const clamped = Math.min(1, Math.max(0, adjustedPValue));
  return {
    index,
    rawPValue,
    adjustedPValue: clamped,
    rejected: clamped <= alpha,
  };
}

function readIndexed(values: readonly IndexedPValue[], index: number): IndexedPValue {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`readIndexed: missing sorted p-value at index ${index}`);
  }
  return value;
}

function validateAlpha(alpha: number): void {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new Error(`alpha: expected a value strictly between 0 and 1, got ${alpha}`);
  }
}

function validatePValues(rawPValues: readonly number[]): void {
  if (rawPValues.length === 0) {
    throw new Error('adjustPValues: rawPValues must contain at least one p-value');
  }
  for (const pValue of rawPValues) {
    if (!Number.isFinite(pValue) || pValue < 0 || pValue > 1) {
      throw new Error(`adjustPValues: expected p-values in [0,1], got ${pValue}`);
    }
  }
}
