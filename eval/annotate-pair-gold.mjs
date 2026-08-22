/**
 * Wave-9 D-039: apply the MAIN-AGENT semantic annotations to the pending pair list,
 * producing eval/claim-pair-gold.jsonl — the gold standard for deterministic-matcher
 * threshold calibration. One-shot; the TRUE_PAIR indices below refer to the line
 * numbers (1-based) of eval/claim-pair-gold-pending.jsonl in file order.
 *
 * Annotation protocol (main agent, 2026-08-22, all 104 pairs read in full):
 *   label=true  — claim and its TF-IDF BEST counterpart assert substantially the same
 *                 scientific finding (same entity/mechanism/direction; synonyms count;
 *                 vague-but-covering counts; two sides of one causal fact count).
 *   label=false — unrelated, topic-overlap-only, different mechanism layer/entity,
 *                 operationalized predictions/correlations/interventions ABOUT a
 *                 mechanism rather than the mechanistic claim itself, or the best
 *                 counterpart is simply the wrong counterpart (matcher ranking error —
 *                 exactly what the gold set must expose).
 * Consistency rules applied: comparative mechanistic statements count (#44/#56);
 * interventional/quantitative predictions never count (#7/#8/#53); correlation-
 * with-outcome never counts as the mechanism claim (#49/#57).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRUE_PAIRS = new Set([
  1, 4, 5, 6, 18, 19, 22, 24, 26, 34, 37, 38, 39, 44, 48, 56, 60, 61,
  64, 65, 66, 75, 76, 77, 81, 85, 86, 98,
]);

const SRC = resolve(process.cwd(), 'eval/claim-pair-gold-pending.jsonl');
const OUT = resolve(process.cwd(), 'eval/claim-pair-gold.jsonl');
const rows = readFileSync(SRC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (rows.length !== 104) { console.error(`FATAL: expected 104 pending pairs, got ${rows.length}`); process.exit(1); }
const out = rows.map((r, idx) => ({
  ...r,
  label: TRUE_PAIRS.has(idx + 1),
  annotator: 'main-agent',
  annotatedAt: '2026-08-22',
  protocol:
    'true = best counterpart asserts substantially the same finding (synonyms/vague-covering/two-sides-of-one-fact count); false = topic-overlap-only, different mechanism layer, operationalized prediction/correlation/intervention, or wrong-best counterpart',
}));
writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
const pos = out.filter((r) => r.label).length;
const sims = out.filter((r) => r.label).map((r) => r.bestSim);
console.log(`gold written: ${out.length} pairs, ${pos} true / ${out.length - pos} false`);
console.log(`true-pair bestSim range: ${Math.min(...sims)} .. ${Math.max(...sims)}`);
const falseMax = Math.max(...out.filter((r) => !r.label).map((r) => r.bestSim));
console.log(`false-pair bestSim max: ${falseMax}`);
