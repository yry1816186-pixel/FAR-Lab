/**
 * Deterministic statistics layer for FAR-Lab evals (Wave-9, D-039 statistics tier).
 *
 * Every function is PURE and SEEDED: same inputs + same seed -> bit-identical output
 * (Wave-9 guardrail: statistical methods must be deterministic/reproducible; no
 * Math.random anywhere). RNG = mulberry32 — tiny, well-understood, adequate for
 * bootstrap resampling; not cryptographic (not its job).
 *
 * Scope honesty: N is small (5-task evals, ~30 judged cells). Bootstrap CIs and
 * permutation p-values are reported as DECISION AIDS with their assumptions, never
 * as ground truth (constitution: scores are decision aids, never objective truth).
 */

/** mulberry32 PRNG: deterministic 32-bit seeded generator. */
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Hash a string to a 32-bit seed so seed keys can be human words (run ids etc.). */
export const seedFromString = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Bootstrap CI for the mean (percentile method). Returns {mean, lo, hi} where
 * lo/hi are the 2.5%/97.5% percentiles of the resampled means. Deterministic
 * under (values, {seed, iters}).
 */
export const bootstrapMeanCI = (values, { seed = 20260822, iters = 10_000 } = {}) => {
  if (!Array.isArray(values) || values.length === 0) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
  const rng = mulberry32(typeof seed === 'string' ? seedFromString(seed) : seed);
  const n = values.length;
  const means = new Array(iters);
  for (let b = 0; b < iters; b += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += values[Math.floor(rng() * n)];
    means[b] = sum / n;
  }
  means.sort((x, y) => x - y);
  const pct = (p) => means[Math.min(means.length - 1, Math.max(0, Math.floor(p * (means.length - 1))))];
  return {
    n,
    mean: values.reduce((a, b) => a + b, 0) / n,
    lo: pct(0.025),
    hi: pct(0.975),
  };
};

/**
 * Paired permutation test for BEFORE vs AFTER on the same tasks (H0: mean
 * difference = 0, two-sided). Exact when iters >= 2^n (enumerates all sign
 * flips); otherwise sampled with the seeded RNG. Returns {observedDiff, pValue}
 * with pValue = fraction of |flipped means| >= |observed mean| (add-1 smoothed:
 * even in exact mode an all-extreme enumeration reports 2/(2^n+1), never 0 —
 * deliberately conservative so a finite test can never certify p = 0).
 */
export const pairedPermutationTest = (before, after, { seed = 20260822, iters = 10_000 } = {}) => {
  if (before.length !== after.length || before.length === 0) return { observedDiff: NaN, pValue: NaN, n: 0 };
  const n = before.length;
  const diffs = before.map((b, i) => b - after[i]);
  const observed = diffs.reduce((a, b) => a + b, 0) / n;
  const enumAll = 2 ** n <= iters;
  const total = enumAll ? 2 ** n : iters;
  const rng = mulberry32(typeof seed === 'string' ? seedFromString(seed) : seed);
  let extreme = 0;
  for (let t = 0; t < total; t += 1) {
    let mask = enumAll ? t : 0;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const flip = enumAll ? (mask >> i) & 1 : (rng() < 0.5 ? 1 : 0);
      sum += flip === 1 ? -diffs[i] : diffs[i];
    }
    if (Math.abs(sum / n) >= Math.abs(observed) - 1e-12) extreme += 1;
  }
  return { n, observedDiff: observed, pValue: (extreme + 1) / (total + 1), mode: enumAll ? 'exact' : 'sampled' };
};

/** Wilson score interval for a proportion (k successes of n) — no RNG needed. */
export const wilsonInterval = (k, n, z = 1.96) => {
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
};

/** Max absolute swing across a list of repeated measurements (the D-029 headline stat). */
export const maxAbsSwing = (values) => {
  if (!Array.isArray(values) || values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
};

/** Population variance of a list (secondary dispersion stat). */
export const variance = (values) => {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
};

/**
 * Krippendorff's alpha for inter-rater agreement (Wave-9; semantics per Krippendorff
 * 2011 "Computing Krippendorff's Alpha-Reliability" as implemented in inspect_ai
 * scorer/_metrics/krippendorff.py (MIT) — TS rewrite).
 * raters[i][j] = rating of item j by rater i; null = missing.
 * level 'nominal': delta(c,k)=1 if c!=k. level 'ordinal': midrank marginal formula
 *   delta(c,k) = ( sum_g=n_c..n_k n_g - (n_c+n_k)/2 )^2 for ordered categories.
 * alpha = 1 - D_o/D_e. 1=perfect, 0=chance, negative=below chance.
 */
export const krippendorffAlpha = (raters, level = 'nominal') => {
  const nItems = raters[0]?.length ?? 0;
  if (raters.length < 2 || nItems === 0) return { alpha: NaN, nUnits: 0, nPairs: 0 };
  const values = new Set();
  for (const row of raters) for (const v of row) if (v !== null && v !== undefined) values.add(v);
  const vals = [...values].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
  const q = vals.length;
  if (q < 2) return { alpha: NaN, nUnits: nItems, nPairs: 0, reason: 'single-value domain' };
  const catIndex = new Map(vals.map((v, i) => [v, i]));
  // coincidence matrix: unit with m>=2 ratings contributes 1/(m-1) per ordered pair
  const o = Array.from({ length: q }, () => new Array(q).fill(0));
  let pairsTotal = 0;
  let unitsUsed = 0;
  for (let j = 0; j < nItems; j += 1) {
    const obs = raters.map((row) => (row[j] === null || row[j] === undefined ? null : catIndex.get(row[j]))).filter((x) => x !== null && x !== undefined);
    if (obs.length < 2) continue;
    unitsUsed += 1;
    const w = 1 / (obs.length - 1);
    for (let a = 0; a < obs.length; a += 1) for (let b = 0; b < obs.length; b += 1) { if (a === b) continue; o[obs[a]][obs[b]] += w; pairsTotal += w; }
  }
  if (pairsTotal === 0) return { alpha: NaN, nUnits: unitsUsed, nPairs: 0 };
  const marg = o.map((row) => row.reduce((x, y) => x + y, 0));
  const total = marg.reduce((x, y) => x + y, 0);
  // ordinal cumulative midranks
  const cum = new Array(q).fill(0);
  for (let g = 1; g < q; g += 1) cum[g] = cum[g - 1] + marg[g - 1];
  const delta = (c, k) => {
    if (c === k) return 0;
    if (level === 'nominal') return 1;
    const [lo, hi] = c < k ? [c, k] : [k, c];
    let between = 0;
    for (let g = lo; g <= hi; g += 1) between += marg[g];
    return (between - (marg[lo] + marg[hi]) / 2) ** 2;
  };
  let dObsNum = 0;
  for (let c = 0; c < q; c += 1) for (let k = 0; k < q; k += 1) dObsNum += o[c][k] * delta(c, k);
  const dO = dObsNum / total;
  let dExpNum = 0;
  for (let c = 0; c < q; c += 1) for (let k = 0; k < q; k += 1) {
    const nK = c === k ? marg[k] - 1 : marg[k];
    dExpNum += marg[c] * nK * delta(c, k);
  }
  const dE = dExpNum / (total * (total - 1));
  if (dE === 0) return { alpha: NaN, nUnits: unitsUsed, nPairs: pairsTotal, reason: 'degenerate expected disagreement' };
  return { alpha: 1 - dO / dE, nUnits: unitsUsed, nPairs: pairsTotal };
};

/**
 * Pooled standard error across subgroups (lm-evaluation-harness pooled_sample_stderr,
 * MIT — pooled variance): groups = [{mean, stderr, n}]; SE of the size-weighted
 * pooled mean. FAR-Lab use: cross-domain claim-match aggregation with proper SE.
 */
export const pooledStderr = (groups) => {
  const valid = groups.filter((g) => g && g.n > 0 && Number.isFinite(g.stderr) && Number.isFinite(g.mean));
  const nTotal = valid.reduce((a, g) => a + g.n, 0);
  if (nTotal === 0) return { se: NaN, n: 0 };
  let mean = 0;
  for (const g of valid) mean += g.mean * g.n;
  mean /= nTotal;
  let num = 0;
  for (const g of valid) {
    const obsVar = g.stderr * g.stderr * g.n; // per-OBSERVATION variance (stderr is the SE of the group mean)
    num += g.n * (obsVar + (g.mean - mean) ** 2);
  }
  return { se: Math.sqrt(num) / nTotal, n: nTotal };
};

/**
 * Cohen's kappa for two raters over identical items (labels as strings/numbers).
 * kappa = (po - pe) / (1 - pe); 1 = perfect, 0 = chance, <0 = below chance.
 * Judge-noise probe: pass-vs-pass and judge-vs-gold agreement (Wave-9 matrix tier 3).
 */
export const cohensKappa = (raterA, raterB) => {
  if (raterA.length !== raterB.length || raterA.length === 0) return { kappa: NaN, agreement: NaN, n: 0 };
  const n = raterA.length;
  let agree = 0;
  const catsA = new Map(); const catsB = new Map();
  for (let i = 0; i < n; i += 1) {
    if (raterA[i] === raterB[i]) agree += 1;
    catsA.set(raterA[i], (catsA.get(raterA[i]) ?? 0) + 1);
    catsB.set(raterB[i], (catsB.get(raterB[i]) ?? 0) + 1);
  }
  let pe = 0;
  for (const [cat, count] of catsA) pe += (count / n) * ((catsB.get(cat) ?? 0) / n);
  const po = agree / n;
  return { kappa: pe === 1 ? 1 : (po - pe) / (1 - pe), agreement: po, n };
};

/**
 * Benjamini-Hochberg FDR correction. Returns per-index adjusted q-values in [0,1]
 * (step-up procedure; monotonicity enforced). Multiple-comparison guard for
 * multi-task x multi-metric comparisons (statsforevals default recommendation).
 */
export const benjaminiHochberg = (pValues) => {
  const n = pValues.length;
  if (n === 0) return [];
  const idx = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array(n);
  let prev = 1;
  for (let rank = n; rank >= 1; rank -= 1) {
    const { p, i } = idx[rank - 1];
    prev = Math.min(prev, (p * n) / rank);
    q[i] = Math.min(1, prev);
  }
  return q;
};

/**
 * Cluster-robust standard error (items nested in clusters; Miller arXiv:2411.00640
 * Eq.4/8 as implemented in inspect_ai std.py, finite-cluster correction C/(C-1)).
 * clusters: array of arrays of item scores.
 */
export const clusterStderr = (clusters) => {
  const flat = clusters.flat();
  const n = flat.length;
  const C = clusters.length;
  if (n === 0 || C < 2) return { se: NaN, n, clusters: C };
  const grand = flat.reduce((a, b) => a + b, 0) / n;
  let total = 0;
  for (const cl of clusters) {
    for (const si of cl) for (const sj of cl) total += (si - grand) * (sj - grand);
  }
  total *= C / (C - 1);
  return { se: Math.sqrt(Math.max(0, total)) / n, n, clusters: C };
};

/**
 * Decision gate for a before/after delta under noise (Miller Eq.9-10 MDE +
 * statsforevals N<15 downgrade). verdict: REAL requires CI excluding 0 AND |delta|
 * >= the pre-registered minimum detectable effect; small N is honest about it.
 */
export const decideDeltaReality = ({ delta, ciLo, ciHi, pValue, mde, n }) => {
  const warnings = [];
  if (n < 15) warnings.push('n<15: exploratory only (statsforevals rule)');
  const ciExcludesZero = ciLo > 0 || ciHi < 0;
  const meetsMde = Math.abs(delta) >= mde;
  let verdict;
  if (n < 5) verdict = 'INSUFFICIENT_N';
  else if (ciExcludesZero && meetsMde) verdict = 'REAL';
  else verdict = 'NOT_SIGNIFICANT';
  if (pValue !== undefined && pValue >= 0.05 && verdict === 'REAL') warnings.push('REAL by CI+MDE but p>=0.05 — inspect assumptions');
  return { verdict, ciExcludesZero, meetsMde, warnings };
};
