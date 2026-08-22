/**
 * W-G/F-A offline replay: run the anchored-counter-query repair over EVERY historical
 * run's real counter queries + question text in .far-run/far.db and report the anchor
 * pass-rate before/after. Zero API calls; deterministic.
 * Usage: node spikes/waveg-anchor-replay.mjs
 */
const { openDb } = await import('../dist/persistence/db.js');
const { Store } = await import('../dist/persistence/store.js');
const { anchorContainment, anchorCounterQueries, COUNTER_ANCHOR_MIN } = await import('../dist/pipeline/stages/retrieve.js');

const db = openDb('.far-run/far.db');
const store = new Store(db);
const runs = store.listRuns(10_000);
let checked = 0;
let passBefore = 0;
let passAfter = 0;
const samples = [];
for (const { id } of runs) {
  const question = store.getObject('question', store.getRun(id)?.questionId ?? '');
  const corp = store.listObjects('corpus_snapshot', id).at(-1);
  if (!question || !corp) continue;
  const anchorText = `${question.text} ${question.background ?? ''}`;
  const counterQueries = corp.queries.filter((q) => q.purpose === 'counter_evidence').map((q) => q.text);
  if (counterQueries.length < 2) continue;
  checked += 1;
  const pair = [counterQueries[0], counterQueries[1]];
  for (const q of pair) if (anchorContainment(q, anchorText) >= COUNTER_ANCHOR_MIN) passBefore += 1;
  const repaired = anchorCounterQueries(pair, anchorText);
  for (const q of repaired) if (anchorContainment(q, anchorText) >= COUNTER_ANCHOR_MIN) passAfter += 1;
  if (samples.length < 3 && pair[0] !== repaired[0]) {
    samples.push({ before: pair[0], after: repaired[0] });
  }
}
console.log(`runs with 2+ counter queries: ${checked} (${checked * 2} queries)`);
console.log(`anchor pass-rate BEFORE repair: ${passBefore}/${checked * 2} = ${checked ? (passBefore / (checked * 2)).toFixed(3) : 'n/a'}`);
console.log(`anchor pass-rate AFTER  repair: ${passAfter}/${checked * 2} = ${checked ? (passAfter / (checked * 2)).toFixed(3) : 'n/a'}`);
console.log('sample repairs:');
for (const s of samples) console.log(`  - "${s.before}"\n    + "${s.after}"`);
db.close();
