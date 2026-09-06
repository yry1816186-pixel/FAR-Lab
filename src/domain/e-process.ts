/** Deterministic anytime-valid e-processes for bounded per-observation statistics. */

export interface EProcessResult {
  eValue: number;
  logEValue: number;
  n: number;
  lambda: number;
  factors: number[];
}

export interface EProcessOptions {
  direction: 'above' | 'below';
  threshold: number;
  lower: number;
  upper: number;
}

/**
 * Computes a fixed-mixture test martingale. Under H0: E[X] <= threshold
 * (direction=above), or E[X] >= threshold (direction=below), each factor has
 * conditional expectation <= 1. Bounds are preregistered and independent of rows.
 */
export const computeEProcess = (rows: readonly number[], options: EProcessOptions): EProcessResult => {
  const { direction, threshold, lower, upper } = options;
  if (!Number.isFinite(threshold) || !Number.isFinite(lower) || !Number.isFinite(upper) || !(lower < upper)) {
    throw new Error('e-process bounds must be finite with lower < upper');
  }
  if (threshold < lower || threshold > upper) throw new Error(`e-process threshold ${threshold} outside [${lower}, ${upper}]`);
  const adverseDistance = direction === 'above' ? threshold - lower : upper - threshold;
  const magnitude = adverseDistance > 0 ? 0.5 / adverseDistance : 0.5;
  const lambda = direction === 'above' ? magnitude : -magnitude;
  const factors: number[] = [];
  let logEValue = 0;
  for (const row of rows) {
    if (!Number.isFinite(row) || row < lower || row > upper) throw new Error(`e-process row ${row} outside [${lower}, ${upper}]`);
    const factor = 1 + lambda * (row - threshold);
    if (!(factor > 0) || !Number.isFinite(factor)) throw new Error(`e-process produced invalid factor ${factor}`);
    factors.push(factor);
    logEValue += Math.log(factor);
  }
  const eValue = logEValue >= Math.log(Number.MAX_VALUE) ? Number.MAX_VALUE : Math.exp(logEValue);
  return { eValue, logEValue, n: rows.length, lambda, factors };
};

export const eProcessThresholdForAlpha = (alpha: number): number => {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0,1), got ${alpha}`);
  return 1 / alpha;
};
