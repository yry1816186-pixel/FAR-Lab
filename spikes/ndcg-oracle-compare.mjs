/**
 * W6 metric-oracle comparison: our eval/retrieval-baseline.mjs ndcgAtK vs
 * pytrec_eval (BEIR's own oracle) over identical fixtures + seeded-random cases.
 * Exit 0 iff every case matches to 1e-9.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ndcgAtK } from '../eval/retrieval-baseline.mjs';

const oracleLines = readFileSync(resolve(process.cwd(), 'spikes/output/ndcg-oracle-pytrec.jsonl'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));
const randomCases = JSON.parse(readFileSync(resolve(process.cwd(), 'spikes/output/ndcg-random-cases.json'), 'utf8'));

const fixed = [
  { name: 'ideal_abc_k3', ranked: ['a', 'b', 'c'], qrels: { a: 3, b: 2, c: 1 }, k: 3 },
  { name: 'ideal_abc_k10', ranked: ['a', 'b', 'c'], qrels: { a: 3, b: 2, c: 1 }, k: 10 },
  { name: 'reversed_k3', ranked: ['c', 'b', 'a'], qrels: { a: 3, b: 2, c: 1 }, k: 3 },
  { name: 'late_hit_xa_k2', ranked: ['x', 'a'], qrels: { a: 3, b: 2, c: 1 }, k: 2 },
  { name: 'early_hit_ax_k2', ranked: ['a', 'x'], qrels: { a: 3, b: 2, c: 1 }, k: 2 },
  { name: 'no_relevant', ranked: ['x', 'y'], qrels: { a: 1 }, k: 2 },
  { name: 'empty_qrels', ranked: ['x', 'y'], qrels: {}, k: 2 },
];

const all = [...fixed, ...randomCases];
const oracleByName = new Map(oracleLines.map((o) => [o.name, o.pytrec_ndcg]));

let mismatches = 0;
for (const c of all) {
  const ours = ndcgAtK(c.ranked, c.qrels, c.k);
  const oracle = oracleByName.get(c.name);
  if (oracle === undefined) { console.log(`MISSING-ORACLE ${c.name}`); mismatches += 1; continue; }
  const ok = Math.abs(ours - oracle) < 1e-9;
  if (!ok) { mismatches += 1; console.log(`MISMATCH ${c.name}: ours=${ours} oracle=${oracle}`); }
}
console.log(`cases=${all.length} mismatches=${mismatches}`);
process.exit(mismatches === 0 ? 0 : 1);
