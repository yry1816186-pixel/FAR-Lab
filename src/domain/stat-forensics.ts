/**
 * RU-6 GO4 — deterministic statistical forensics (clean-room TS; scrutiny /
 * statcheck / EValue R packages are algorithm references only, no code copied).
 *
 * GRIM (Brown & Heathers 2017): a reported mean of n integer-valued
 * observations must equal sum/n for SOME integer sum — i.e. mean*n must land
 * on an integer (within rounding tolerance of the reported precision).
 * A failure means the quoted statistic cannot come from the stated n.
 *
 * E-value (VanderWeele & Ding 2017,Ann Intern Med): the minimum strength of
 * association an unmeasured confounder would need with both treatment and
 * outcome to fully explain away an observed risk-ratio association.
 * Closed form for RR >= 1: E = RR + sqrt(RR*(RR-1)); for RR < 1 use the
 * reciprocal. Pure arithmetic, no tables.
 */

export interface GrimResult {
  consistent: boolean;
  detail: string;
}

/**
 * GRIM granularity check. `mean` is the reported mean at `decimals` decimal
 * places; `n` the reported sample size. Consistency: SOME integer sum exists
 * whose mean rounds to the reported value — checked against the rounding
 * interval of the reported mean (exact-integer GRIM, no float artifacts).
 */
export const grimCheck = (mean: number, n: number, decimals = 1): GrimResult => {
  if (!Number.isFinite(mean) || !Number.isFinite(n) || n <= 0 || decimals < 0 || decimals > 6) {
    return { consistent: true, detail: 'GRIM not applicable (malformed inputs — never flags on bad input)' };
  }
  const scale = 10 ** decimals;
  const lo = Math.ceil((mean - 0.5 / scale) * n - 1e-9);
  const hi = Math.floor((mean + 0.5 / scale) * n + 1e-9);
  if (lo <= hi) {
    return { consistent: true, detail: `GRIM consistent (integer sum in [${lo}, ${hi}] for n=${n})` };
  }
  return { consistent: false, detail: `GRIM INCONSISTENT: mean=${mean} at ${decimals}dp admits no integer sum for n=${n} — the quoted statistic cannot come from the stated sample size` };
};

/**
 * E-value for a risk ratio (point estimate). RR < 1 is inverted (protective
 * associations mirror the same unmeasured-confounding logic).
 */
export const eValue = (rr: number): { eValue: number; detail: string } => {
  if (!Number.isFinite(rr) || rr <= 0) {
    return { eValue: NaN, detail: 'E-value not applicable (non-positive RR)' };
  }
  const r = rr >= 1 ? rr : 1 / rr;
  const e = r + Math.sqrt(r * (r - 1));
  return { eValue: e, detail: `E-value ${e.toFixed(2)}: an unmeasured confounder would need at least this much association with BOTH treatment and outcome to explain away the observed RR of ${rr}` };
};

/**
 * Extract mean/n pairs from a verbatim quote (deterministic regex; returns []
 * when the quote carries no such statistics). Feeds grimCheck at claim time.
 */
export const extractMeanN = (quote: string): Array<{ mean: number; n: number; decimals: number }> => {
  const out: Array<{ mean: number; n: number; decimals: number }> = [];
  // bounded gap: "mean 3.22", "mean = 3.22", "mean score was 3.22", "M: 40.2"
  const meanRe = /(?:mean|M)\b(?:\s+[a-z]+){0,2}[\s:=]+(\d+(?:\.\d+)?)/gi;
  const nRe = /\b(?:n|N)\s*[:=]?\s*(\d{1,6})\b/g;
  const ns: number[] = [];
  for (const m of quote.matchAll(nRe)) ns.push(Number(m[1]));
  if (ns.length === 0) return out;
  for (const m of quote.matchAll(meanRe)) {
    const meanStr = m[1]!;
    const decimals = meanStr.includes('.') ? meanStr.split('.')[1]!.length : 0;
    const mean = Number(meanStr);
    if (mean > 0) {
      for (const n of ns) out.push({ mean, n, decimals });
    }
  }
  return out;
};
