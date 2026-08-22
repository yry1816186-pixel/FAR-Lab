/**
 * Wave-9 D-039 helper (one-shot): dump every claim's TF-IDF best counterpart across
 * the recorded v1 decompositions vs the FIXED GT, for MAIN-AGENT semantic annotation
 * (match / no-match). Output: eval/claim-pair-gold-pending.jsonl — annotated by hand
 * into eval/claim-pair-gold.jsonl (label source: 'main-agent'), then consumed by
 * eval/claim-match-calibrate.mjs v2 for gold-grounded threshold selection.
 *
 * Zero API calls. Rerunning regenerates the SAME pending file (pure function of the
 * recorded data + fixed GT).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contentTokens, tfidfCosine } from './claim-match.mjs';
import { TASKS, GT_REV } from './rediscovery-tasks.mjs';

const SRC = resolve(process.cwd(), 'eval/results/rediscovery-v1-degraded.jsonl');
const OUT = resolve(process.cwd(), 'eval/claim-pair-gold-pending.jsonl');
const gtByTask = new Map(TASKS.map((t) => [t.id, t.gtClaims]));
const rows = readFileSync(SRC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.claims?.agent);

const lines = [];
for (const r of rows) {
  const gt = gtByTask.get(r.task);
  const sides = [
    { side: 'agent', list: r.claims.agent, other: gt },
    { side: 'gt', list: gt, other: r.claims.agent },
  ];
  for (const { side, list, other } of sides) {
    const all = [...list.map(contentTokens), ...other.map(contentTokens)];
    const sim = tfidfCosine(all);
    list.forEach((c, i) => {
      let bj = -1; let bs = 0;
      for (let j = 0; j < other.length; j += 1) { const v = sim(i, list.length + j); if (v > bs) { bs = v; bj = j; } }
      lines.push(JSON.stringify({
        task: r.task, side, i, bestJ: bj,
        bestSim: Math.round(bs * 1000) / 1000,
        claim: c, counterpart: other[bj] ?? null,
        gtRev: GT_REV, src: 'rediscovery-v1-degraded.jsonl',
      }));
    });
  }
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${lines.length} pending pairs -> ${OUT}`);
