/**
 * Gold-grounded threshold calibration for the deterministic claim matcher (v2, Wave-9).
 *
 * v1 (D-037) calibrated against the recorded v1 LLM match COUNTS — circular, since the
 * LLM matcher is itself the noisy process being replaced. v2 calibrates against the
 * MAIN-AGENT gold pair sets:
 *  - claim-pair-gold.jsonl (2026-08-22, 104 best-counterpart pairs, verbose era)
 *  - claim-pair-gold-v21.jsonl (2026-08-29, 53 pairs sampled from the v2.1 concise
 *    decomposition's below-floor AND borderline zones — the 08-22 set never sampled
 *    below the floor, so genuine terse-paraphrase matches there were invisible)
 *
 * Constraint by design: the deterministic layer has NO human review, so it must make
 * ZERO gold errors — a claim with bestSim >= high may only be a true pair, a claim with
 * bestSim < low may only be a false pair. Under that constraint we maximize the
 * deterministic-decision share (minimize the borderline band handed to LLM adjudication).
 *
 * Zero API calls; pure function of the gold files.
 *
 * Usage: node eval/claim-match-calibrate.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deterministicBandVerdict } from './claim-match.mjs';

const GOLD_FILES = [
  'eval/claim-pair-gold.jsonl',
  'eval/claim-pair-gold-v21.jsonl',
];
const rows = GOLD_FILES.flatMap((f) => readFileSync(resolve(process.cwd(), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
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

console.log(`gold: ${rows.length} pairs (${nTrue} true / ${nFalse} false) from ${GOLD_FILES.join(' + ')}`);
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
console.log('\nSHIPPED: 0.40/0.10 (2026-08-29). high stays conservative (merged false-max 0.331 leaves detYes headroom); low is one rounding step below the grid optimum 0.11 — gold rows store 3-dp rounded sims, and the true pair at 0.110 has an unknown unrounded float that could sit below 0.11, so the margin guards the boundary rather than detShare.');

// ---- S2 deterministic band pre-layer (2026-09-05): same zero-error lens on the rules ----
const bandRows = rows.filter((r) => r.bestSim >= 0.10 && r.bestSim < 0.40 && r.claim && r.counterpart);
const detFired = bandRows.filter((r) => deterministicBandVerdict(r.claim, r.counterpart) === false);
const detErrors = detFired.filter((r) => r.label === true); // rule only classifies FALSE; gold-true rows are errors
console.log(`\nband pre-layer (deterministicBandVerdict, 2026-09-05): band n=${bandRows.length}, rules decided ${detFired.length} (all as different-finding), gold errors ${detErrors.length}${detErrors.length === 0 ? ' (ZERO — shippable)' : ' (NOT shippable)'}`);
console.log(`effective deterministic share on band pairs: ${detFired.length}/${bandRows.length} = ${Math.round((100 * detFired.length) / Math.max(bandRows.length, 1))}%; LLM-band residue ${bandRows.length - detFired.length}`);
console.log('Note: rules fire only inside [low, high); the threshold extremes above stay untouched.');
console.log('\nNote: gold N=157 (104 verbose-era 2026-08-22 + 53 v2.1-concise-era 2026-08-29 covering the below-floor zone), main-agent annotated; thresholds generalize modulo that sample (disclosed limitation). The overlap zone itself is the D-038 finding restated on clean labels: scientific-semantic matching needs the adjudication layer; determinism buys the extremes only.');
