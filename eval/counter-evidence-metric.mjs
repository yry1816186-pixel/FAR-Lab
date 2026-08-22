/**
 * counter-evidence-substantive-hit (north-star metric, Wave-9 definition + backfill).
 *
 * DEFINITION (primary/strict): of the claim->hypothesis relations the pipeline labels
 * as counter signal (pipelineLabel in {contradicts, weakens} — the operational form of
 * "counter-evidence seats whose relation ..."), the fraction that survive BLIND
 * same-family re-judging with a counter-family label (judgeLabel in {contradicts,
 * weakens}). SECONDARY (disclosed): +qualifies (any limiting signal bounds the
 * hypothesis — substantive for revision, but not unambiguous counter evidence).
 * Misses decompose into inverted (judge=supports) and empty (judge=unrelated) —
 * different failure modes with different remedies.
 *
 * Computed OFFLINE from recorded blind re-judge files (zero API calls, deterministic
 * pure function of the jsonl inputs). Wilson intervals always reported (n is small).
 *
 * Usage: node eval/counter-evidence-metric.mjs spikes/output/relation-precision.jsonl ...
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wilsonInterval } from './stats.mjs';

const COUNTER_FAMILY = new Set(['contradicts', 'weakens']);
const LIMITING = new Set(['contradicts', 'weakens', 'qualifies']);

export const evaluate = (rows, label) => {
  const counter = rows.filter((r) => COUNTER_FAMILY.has(r.pipelineLabel));
  const strict = counter.filter((r) => COUNTER_FAMILY.has(r.judgeLabel)).length;
  const limiting = counter.filter((r) => LIMITING.has(r.judgeLabel)).length;
  const inverted = counter.filter((r) => r.judgeLabel === 'supports').length;
  const empty = counter.filter((r) => r.judgeLabel === 'unrelated').length;
  return {
    label,
    counterLabeled: counter.length,
    strictHit: strict,
    strictRate: counter.length > 0 ? strict / counter.length : null,
    strictWilson: counter.length > 0 ? wilsonInterval(strict, counter.length) : null,
    limitingHit: limiting,
    limitingRate: counter.length > 0 ? limiting / counter.length : null,
    missDecomposition: { inverted, empty, otherQualifies: limiting - strict },
  };
};

// CLI body runs only when executed directly — importing this module (tests, composition)
// must not parse argv or exit.
const runAsCli = import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href;
if (runAsCli) {
const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: node eval/counter-evidence-metric.mjs <re-judge.jsonl> [...]'); process.exit(1); }
const results = [];
for (const f of files) {
  const rows = readFileSync(resolve(process.cwd(), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  results.push(evaluate(rows, f));
}
for (const r of results) {
  console.log(`== ${r.label}`);
  console.log(`   counter-labeled relations: ${r.counterLabeled}`);
  if (r.counterLabeled === 0) { console.log('   (none sampled — metric undefined on this file)'); continue; }
  const w = r.strictWilson;
  console.log(`   strict  hit ${r.strictHit}/${r.counterLabeled} = ${r.strictRate.toFixed(3)}  (Wilson 95% [${w.lo.toFixed(3)}, ${w.hi.toFixed(3)}])`);
  console.log(`   limiting hit ${r.limitingHit}/${r.counterLabeled} = ${r.limitingRate.toFixed(3)}`);
  console.log(`   miss decomposition: inverted(supports) ${r.missDecomposition.inverted}, empty(unrelated) ${r.missDecomposition.empty}, qualifies-only ${r.missDecomposition.otherQualifies}`);
}
console.log('\nProtocol: strict = judge in {contradicts,weakens}; limiting = +qualifies; misses decompose into inverted vs empty (different remedies).');
console.log('Small-n honesty: Wilson intervals are wide; treat point estimates as directional until larger samples exist.');
}
