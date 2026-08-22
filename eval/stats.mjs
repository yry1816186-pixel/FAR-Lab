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
 * with pValue = fraction of |flipped means| >= |observed mean| (add-1 smoothed
 * to avoid p=0 claims from finite sampling).
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
