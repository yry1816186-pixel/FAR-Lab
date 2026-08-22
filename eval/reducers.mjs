/**
 * Vote/generation reducers (Wave-9 fusion; sources: inspect_ai scorer/_reducer/reducer.py
 * MIT (at_least/mode/pass_at semantics) + lm-evaluation-harness filters/selection.py MIT
 * (majority_vote/take_first family). TS rewrites, algorithm only, no code execution
 * upstream; both licenses permit derivative ports with attribution retained here).
 *
 * Design intent (lm-eval repeats × named pipelines pattern): ONE budget of N raw
 * outputs feeds MULTIPLE named reductions (first / maj@N / maj@k / at_least(k)) —
 * a robustness band computed offline from the same recorded votes, zero extra calls.
 * All functions pure + total: undefined/degenerate inputs produce defined results.
 */

/** Median of numbers (even n averages the middle two). */
export const median = (xs) => {
  if (!Array.isArray(xs) || xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Majority value (mode) of a list; tie -> undefined (honest, never arbitrary pick). */
export const mode = (xs) => {
  if (!Array.isArray(xs) || xs.length === 0) return undefined;
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best; let bestN = 0; let tie = false;
  for (const [v, n] of counts) {
    if (n > bestN) { best = v; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  return tie ? undefined : best;
};

/**
 * maj@k: majority over the FIRST k items (lm-eval take_first_k + Counter pattern).
 * Returns undefined when the first-k slice has no strict majority.
 */
export const majAtK = (xs, k) => mode(xs.slice(0, Math.max(0, k)));

/**
 * at_least(k) pass gate over boolean-ish outcomes: true iff >= k of the n items are
 * truthy (inspect_ai at_least(k) semantics). n=0 -> false (nothing passed).
 */
export const atLeast = (xs, k) => {
  if (!Array.isArray(xs)) return false;
  return xs.filter(Boolean).length >= k;
};

/**
 * pass@k unbiased estimator (Codex paper arXiv:2107.03374 Eq.1, as implemented in
 * inspect_ai reducer.py:119-161): given n samples with c correct,
 * pass@k = 1 - C(n-c, k)/C(n, k), computed via the stable product form
 * prod_{i=0..k-1} (n-c-i)/(n-i). Returns 1 when c > n-k clamps... explicit:
 * c>=n -> 1; k>n treated as k=n; c<=0 -> 0.
 */
export const passAtK = (n, c, k) => {
  if (n <= 0 || k <= 0) return 0;
  const kk = Math.min(k, n);
  const cc = Math.max(0, Math.min(c, n));
  if (cc === 0) return 0;
  if (cc >= n - kk + 1) return 1;
  let result = 1;
  for (let i = 0; i < kk; i += 1) result *= (n - cc - i) / (n - i);
  return 1 - result;
};

/**
 * One budget -> named reductions (lm-eval `{metric},{filter}` keying pattern).
 * For boolean-ish vote lists: first, maj@N, maj@ceil(N/2 + something)... explicitly:
 * first (vote 1), majAll (mode over all), maj@ceil(N/2) (majority over a prefix),
 * atLeastHalf (>=ceil(N/2) true), all (unanimity). Undefined outcomes are preserved
 * (never coerced) — consumers see exactly what the reduction produced.
 */
export const namedReductions = (votes) => {
  const n = votes.length;
  const prefix = Math.max(1, Math.ceil(n / 2));
  return {
    n,
    first: votes[0],
    majAll: mode(votes),
    majAtHalfPrefix: majAtK(votes, prefix),
    atLeastHalf: atLeast(votes, Math.ceil(n / 2)),
    unanimous: votes.length > 0 && votes.every(Boolean),
  };
};
