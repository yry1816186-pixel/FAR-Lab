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
 *
 * Lane-06 precision fix (2026-08-25): pairing was the full mean×n CROSS
 * PRODUCT over the whole quote — a sentence-pair like "mean 3.4 (n=42) ...
 * mean 3.1 (n=40)" produced 4 checks, 2 of them spurious, and a spurious
 * GRIM failure steps the claim's certainty DOWN via forensicFails. Forensic
 * checks are advisory, so precision outranks recall: a mean is paired with an
 * n only when they appear in the SAME sentence segment and that segment
 * contains exactly one mean and exactly one n. Ambiguous segments are skipped
 * — a missed advisory check is honest silence; a false INCONSISTENT flag
 * corrupts the grade.
 */
export const extractMeanN = (quote: string): Array<{ mean: number; n: number; decimals: number }> => {
  const out: Array<{ mean: number; n: number; decimals: number }> = [];
  const meanRe = /(?:mean|M)\b(?:\s+[a-z]+){0,2}[\s:=]+(\d+(?:\.\d+)?)/gi;
  const nRe = /\b(?:n|N)\s*[:=]?\s*(\d{1,6})\b/g;
  // Sentence-ish segmentation: terminator + whitespace, or a semicolon. Segments
  // keep their text so the regexes anchor inside one clause, not across the quote.
  const segments = quote.split(/(?<=[.!?;])\s+/);
  for (const seg of segments) {
    const ns: number[] = [];
    for (const m of seg.matchAll(nRe)) ns.push(Number(m[1]));
    if (ns.length !== 1) continue; // 0 or 2+ n's in one segment: ambiguous pairing
    const means: { value: number; decimals: number }[] = [];
    for (const m of seg.matchAll(meanRe)) {
      const meanStr = m[1]!;
      means.push({
        value: Number(meanStr),
        decimals: meanStr.includes('.') ? meanStr.split('.')[1]!.length : 0,
      });
    }
    if (means.length !== 1) continue; // 2+ means in one segment: ambiguous pairing
    const mean = means[0]!;
    if (mean.value > 0) out.push({ mean: mean.value, n: ns[0]!, decimals: mean.decimals });
  }
  return out;
};

/**
 * RU-5 GO2 — deterministic range/domain guard for reported statistics
 * (complements GRIM's granularity check; catches impossible values GRIM
 * cannot see). Every check is a pure function of parsed verbatim numbers;
 * findings are advisory uncertainty notes, never verdicts.
 */
export interface RangeFinding {
  ok: boolean;
  detail: string;
}

export const rangeGuard = (input: {
  pValue?: number;
  percent?: number;
  ci?: { low: number; high: number; point: number };
  sd?: number;
}): RangeFinding[] => {
  const findings: RangeFinding[] = [];
  if (input.pValue !== undefined && (input.pValue < 0 || input.pValue > 1)) {
    findings.push({ ok: false, detail: `impossible p-value ${input.pValue} — probabilities lie in [0,1]` });
  }
  if (input.percent !== undefined && (input.percent < 0 || input.percent > 100)) {
    findings.push({ ok: false, detail: `impossible percentage ${input.percent} — percentages lie in [0,100]` });
  }
  if (input.ci !== undefined) {
    const { low, high, point } = input.ci;
    if (low > high) findings.push({ ok: false, detail: `CI inverted: [${low}, ${high}]` });
    if (point < low || point > high) findings.push({ ok: false, detail: `point estimate ${point} outside its own CI [${low}, ${high}]` });
  }
  if (input.sd !== undefined && input.sd < 0) {
    findings.push({ ok: false, detail: `impossible SD ${input.sd} — dispersion is non-negative` });
  }
  return findings;
};

/** Extract p/percent/CI/SD from a verbatim quote (bounded deterministic regexes). */
export const extractStats = (quote: string): { pValue?: number; percent?: number; ci?: { low: number; high: number; point: number }; sd?: number } => {
  const out: { pValue?: number; percent?: number; ci?: { low: number; high: number; point: number }; sd?: number } = {};
  const p = /\bp\s*(?:=|<|≤)\s*\.?(\d+)/i.exec(quote) ?? /\bp\s*(?:=|<|≤)\s*0\.(\d+)/i.exec(quote);
  if (p !== null) {
    const raw = p[0].includes('0.') ? Number(p[0].replace(/[^0-9.]/g, '')) : Number(`0.${p[1]}`);
    if (Number.isFinite(raw)) out.pValue = raw;
  }
  const pct = /(\d+(?:\.\d+)?)\s*%(?!\s*CI)/i.exec(quote);
  if (pct !== null) out.percent = Number(pct[1]);
  const sd = /\bSD\s*(?:=|:)?\s*(\d+(?:\.\d+)?)/i.exec(quote) ?? /\b(?:sd|S\.D\.)\s*(?:=|:)?\s*(\d+(?:\.\d+)?)/i.exec(quote);
  if (sd !== null) out.sd = Number(sd[1]);
  // Lane-06: signed captures — difference-measure CIs legitimately span negatives
  // ("effect of -0.8 (95% CI [-1.5, -0.1])"); dropping the sign would silently
  // corrupt every downstream numeric check on such quotes.
  const ci = /CI\s*[:=]?\s*[([]\s*([+-]?\d+(?:\.\d+)?)\s*[,;–-]\s*([+-]?\d+(?:\.\d+)?)\s*[)\]]/i.exec(quote);
  const point = /(?:effect|difference|estimate)\s+(?:of\s+)?([+-]?\d+(?:\.\d+)?)/i.exec(quote);
  if (ci !== null && point !== null) {
    out.ci = { low: Number(ci[1]), high: Number(ci[2]), point: Number(point[1]) };
  }
  return out;
};

/**
 * Extract risk-ratio point estimates from a verbatim quote (SCIENCE lane 2026-08-24;
 * feeds eValue — the one quantitative unmeasured-confounding tool). Bounded regexes:
 * "RR 1.8", "risk ratio of 2.3", "relative risk 0.6". Positivity enforced downstream.
 */
export const extractRiskRatios = (quote: string): number[] => {
  const out: number[] = [];
  const patterns = [
    /\bRR\s*(?:=|:|of)?\s*(\d+(?:\.\d+)?)/i,
    /\brisk ratio\s*(?:=|:|of)?\s*(\d+(?:\.\d+)?)/i,
    /\brelative risk\s*(?:=|:|of)?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(quote);
    if (m !== null) {
      const v = Number(m[1]);
      // 0 is degenerate and >100 is almost certainly a misparse of unrelated text
      if (Number.isFinite(v) && v > 0 && v <= 100) out.push(v);
    }
  }
  return [...new Set(out)];
};

export interface CiPairContext {
  ciA: { low: number; high: number; point?: number };
  ciB: { low: number; high: number; point?: number };
  /** The two intervals do not overlap — numeric heterogeneity between the quotes. */
  disjoint: boolean;
  /** Intervals sit on opposite sides of zero — a directional conflict (difference/ratio measures). */
  oppositeSigns: boolean;
}

/**
 * Lane-06 (2026-08-25): deterministic CI-vs-CI context for a claim pair. When BOTH
 * verbatim quotes carry a confidence interval, the geometric relationship of the two
 * intervals is pure arithmetic — it anchors the D-018 contradiction judgment instead
 * of leaving it to unanchored text vibes, and disjoint intervals get a deterministic
 * heterogeneity disclosure on both claims regardless of the LLM verdict. Returns null
 * when either quote carries no CI (no anchor, no fabrication).
 */
export const ciPairContext = (quoteA: string, quoteB: string): CiPairContext | null => {
  const a = extractStats(quoteA).ci;
  const b = extractStats(quoteB).ci;
  if (a === undefined || b === undefined) return null;
  return {
    ciA: a,
    ciB: b,
    disjoint: a.high < b.low || b.high < a.low,
    oppositeSigns: (a.low > 0 && b.high < 0) || (a.high < 0 && b.low > 0),
  };
};
