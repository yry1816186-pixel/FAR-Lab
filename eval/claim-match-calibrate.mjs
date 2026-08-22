/**
 * Gold-grounded threshold calibration for the deterministic claim matcher (v2, Wave-9).
 *
 * v1 (D-037) calibrated against the recorded v1 LLM match COUNTS — circular, since the
 * LLM matcher is itself the noisy process being replaced. v2 calibrates against the
 * MAIN-AGENT gold pair set (eval/claim-pair-gold.jsonl: 104 best-counterpart pairs,
 * 28 substantive-match / 76 not, protocol recorded per row).
 *
 * Constraint by design: the deterministic layer has NO human review, so it must make
 * ZERO gold errors — a claim with bestSim >= high may only be a true pair, a claim with
 * bestSim < low may only be a false pair. Under that constraint we maximize the
 * deterministic-decision share (minimize the borderline band handed to LLM adjudication).
 *
 * Zero API calls; pure function of the gold file.
 *
 * Usage: node eval/claim-match-calibrate.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GOLD = resolve(process.cwd(), 'eval/claim-pair-gold.jsonl');
const rows = readFileSync(GOLD, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const nTrue = rows.filter((r) => r.label).length;
const nFalse = rows.length - nTrue;

const GRID_HIGH = [0.30, 0.32, 0.33, 0.34, 0.36, 0.38, 0.40, 0.42, 0.45, 0.48, 0.50, 0.55];
const GRID_LOW = [0.05, 0.08, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.18, 0.20];

const score = (high, low) => {
  const detYes = rows.filter((r) => r.bestSim >= high);
  const detNo = rows.filter((r) => r.bestSim < low);
  const detYesErrors = detYes.filter((r) => !r.label).length; // false pairs auto-matched
  const detNoErrors = detNo.filter((r) => r.label).length; // true pairs auto-rejected
  const borderline = rows.length - detYes.length - detNo.length;
  return {
    high, low,
    detYes: detYes.length, detYesErrors,
    detNo: detNo.length, detNoErrors,
    borderline, detShare: Math.round((100 * (detYes.length + detNo.length)) / rows.length),
    totalErrors: detYesErrors + detNoErrors,
  };
};

console.log(`gold: ${rows.length} pairs (${nTrue} true / ${nFalse} false) from ${GOLD}`);
const trueSims = rows.filter((r) => r.label).map((r) => r.bestSim).sort((a, b) => a - b);
const falseSims = rows.filter((r) => !r.label).map((r) => r.bestSim).sort((a, b) => a - b);
console.log(`true-pair bestSim: min ${trueSims[0]}, max ${trueSims[trueSims.length - 1]}`);
console.log(`false-pair bestSim: min ${falseSims[0]}, max ${falseSims[falseSims.length - 1]}`);
console.log(`overlap zone: [${trueSims[0]}, ${falseSims[falseSims.length - 1]}] — lexical separation is INCOMPLETE by construction\n`);

const all = [];
for (const high of GRID_HIGH) for (const low of GRID_LOW) if (low < high) all.push(score(high, low));
const zeroError = all.filter((r) => r.totalErrors === 0);
zeroError.sort((a, b) => b.detShare - a.detShare);
console.log('zero-gold-error threshold sets (deterministic share desc, top 8):');
console.log('high   low    | detYes | detNo | borderline | detShare% | errors');
for (const r of zeroError.slice(0, 8)) {
  console.log(
    `${r.high.toFixed(2)}  ${r.low.toFixed(2)}  |   ${String(r.detYes).padStart(2)}   |  ${String(r.detNo).padStart(3)}  |    ${String(r.borderline).padStart(3)}     |    ${String(r.detShare).padStart(3)}    | ${r.totalErrors}`,
  );
}
const best = zeroError[0];
const nearMiss = all.filter((r) => r.totalErrors === 1).sort((a, b) => b.detShare - a.detShare)[0];
console.log(`\nRECOMMENDED: high=${best.high.toFixed(2)} low=${best.low.toFixed(2)} (zero gold errors, detShare ${best.detShare}%)`);
if (nearMiss) console.log(`1-error alternative: high=${nearMiss.high.toFixed(2)} low=${nearMiss.low.toFixed(2)} (detShare ${nearMiss.detShare}%) — rejected: deterministic layer is unreviewed by design`);
console.log('\nNote: gold N=104, single decomposition pass, 3 biomedical domains; thresholds generalize modulo that sample (disclosed limitation). The overlap zone itself is the D-038 finding restated on clean labels: scientific-semantic matching needs the adjudication layer; determinism buys the extremes only.');
