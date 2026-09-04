/**
 * Reference implementation for corpus entry OM-CE-01 (dimension: code-execution).
 * Deterministic exact two-sided permutation test over all C(20,10)=184,756 label
 * assignments, statistic |mean(B) - mean(A)|. `threeway.mjs check` re-executes this
 * file and compares against the gold frozen in eval/omega/corpus.json — gold must be
 * reproducible from code, never asserted (W4 anti-inflation discipline).
 *
 * Run standalone: node eval/omega/reference/permutation-exact.mjs
 */
const A = [12.3, 13.1, 11.8, 12.7, 13.4, 12.1, 11.9, 13.0, 12.5, 12.9];
const B = [13.6, 14.2, 13.9, 14.8, 13.2, 14.5, 13.8, 14.1, 13.5, 14.4];

const all = [...A, ...B];
const n = A.length; // group size (equal groups, n=m=10)
const N = all.length;
const sum = all.reduce((s, v) => s + v, 0);
const meanA = A.reduce((s, v) => s + v, 0) / n;
const meanB = B.reduce((s, v) => s + v, 0) / n;
const sd = (xs, mu) => Math.sqrt(xs.reduce((s, v) => s + (v - mu) ** 2, 0) / (xs.length - 1));
const obs = meanB - meanA;

let count = 0;
let total = 0;
const choose = (start, k, chosen) => {
  if (k === 0) {
    // chosen = indices assigned to group A; equal group sizes => diff = (sum - 2*sA)/n
    const sA = chosen.reduce((s, i) => s + all[i], 0);
    const d = (sum - 2 * sA) / n;
    total += 1;
    if (Math.abs(d) >= Math.abs(obs) - 1e-12) count += 1;
    return;
  }
  for (let i = start; i <= N - k; i++) {
    chosen.push(i);
    choose(i + 1, k - 1, chosen);
    chosen.pop();
  }
};
choose(0, n, []);

const se = Math.sqrt(sd(A, meanA) ** 2 / n + sd(B, meanB) ** 2 / n);
console.log(JSON.stringify({
  meanA: +meanA.toFixed(4),
  meanB: +meanB.toFixed(4),
  sdA: +sd(A, meanA).toFixed(4),
  sdB: +sd(B, meanB).toFixed(4),
  obsDiff: +obs.toFixed(4),
  welchT: +(obs / se).toFixed(3), // secondary anchor only
  permutations: total,
  ge: count,
  pExact: +(count / total).toFixed(10),
}, null, 2) + '\n');
