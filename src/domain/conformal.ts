/**
 * RU-5 GO1 — split conformal prediction intervals (clean-room TS from the
 * Angelopoulos & Bates formulation, arXiv:2107.07511; no MAPIE dependency).
 *
 * Guarantee we may honestly state (and MUST, wherever surfaced): marginal
 * coverage >= 1-alpha UNDER EXCHANGEABILITY of calibration and test rows
 * (our preregistered i.i.d. split satisfies this); the guarantee is
 * unconditional on features and INVALID under covariate shift. Every surface
 * shows alpha and the calibration size — an interval without its n is
 * unfalsifiable.
 */

export interface ConformalInterval {
  low: number;
  high: number;
  alpha: number;
  nCalibration: number;
  /** Honest coverage wording — render verbatim next to the interval. */
  guarantee: string;
}

const quantile = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 0) throw new Error('conformal: empty calibration set');
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

/**
 * Split-conformal interval for a new prediction, calibrated on held-out
 * ABSOLUTE residuals |y - yhat| of the calibration split.
 * Finite-sample quantile: the ⌈(n+1)(1-α)⌉-th smallest residual.
 */
export const conformalInterval = (
  calibrationResiduals: readonly number[],
  prediction: number,
  alpha: number,
): ConformalInterval => {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`conformal: alpha must be in (0,1), got ${alpha}`);
  const n = calibrationResiduals.length;
  if (n < 2) throw new Error(`conformal: need >=2 calibration residuals, got ${n}`);
  const sorted = [...calibrationResiduals].sort((a, b) => a - b);
  const k = Math.min(n, Math.ceil((n + 1) * (1 - alpha)));
  const q = k <= 0 ? sorted[0]! : quantile(sorted.slice(0, Math.max(k, 1)), (k - 1) / Math.max(k - 1, 1));
  const halfWidth = k === 0 ? sorted[0]! : q;
  return {
    low: prediction - halfWidth,
    high: prediction + halfWidth,
    alpha,
    nCalibration: n,
    guarantee:
      `marginal coverage ≥ ${(1 - alpha).toFixed(3)} under exchangeability of calibration and test rows ` +
      `(preregistered i.i.d. split; unconditional; invalid under covariate shift)`,
  };
};
