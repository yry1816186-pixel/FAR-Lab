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

export const conformalInterval = (
  calibrationResiduals: readonly number[],
  prediction: number,
  alpha: number,
): ConformalInterval => {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`conformal: alpha must be in (0,1), got ${alpha}`);
  const n = calibrationResiduals.length;
  if (n < 2) throw new Error(`conformal: need >=2 calibration residuals, got ${n}`);
  const sorted = [...calibrationResiduals].sort((a, b) => a - b);
  const k = Math.ceil((n + 1) * (1 - alpha));
  // Re-audit fix: when alpha < 1/(n+1) the conformal quantile is the (n+1)-th
  // order statistic — beyond the sample. The honest finite-sample half-width
  // is INFINITE (coverage cannot be guaranteed); clamping to n (the old
  // Math.min) silently UNDER-covers. Fail closed with the actionable message.
  if (k > n) {
    throw new Error(`conformal: alpha=${alpha} too small for n=${n} calibration points — finite-sample coverage requires alpha >= 1/(n+1); add calibration data or raise alpha`);
  }
  const halfWidth = k === 0 ? sorted[0]! : sorted[k - 1]!;
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
