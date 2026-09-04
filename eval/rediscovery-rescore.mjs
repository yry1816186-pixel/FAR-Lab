/** FA-SCI-01 re-score after the cdiff GT fix (0aeeb6d): deterministic threshold
 *  match of the STORED agent decompositions against the CURRENT fixed GT, with
 *  borderline-band bounds (all-matched = upper, none = lower). No LLM calls —
 *  borderline pairs needing live 5-vote adjudication are counted, not guessed. */
import { readFileSync, writeFileSync } from 'node:fs';
import { TASKS } from './rediscovery-tasks.mjs';
import { thresholdMatch, finalizeCounts, MATCH_DEFAULTS } from './claim-match.mjs';

const rows = readFileSync('eval/results/rediscovery.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const byTask = new Map(rows.map((r) => [r.task, r]));
const out = [];
for (const t of TASKS) {
  const prev = byTask.get(t.id);
  if (prev === undefined) continue;
  const agentClaims = prev.claims.agent;
  const gtNow = t.gtClaims.map((c) => (typeof c === 'string' ? c : c.text));
  const gtOld = prev.claims.gt;
  const gtChanged = JSON.stringify(gtOld) !== JSON.stringify(gtNow);
  const m = thresholdMatch(agentClaims, gtNow, MATCH_DEFAULTS);
  const mk = (all) => finalizeCounts(agentClaims, gtNow, m, m.borderline.map(() => ({ matched: all })));
  const upper = mk(true);
  const lower = mk(false);
  out.push({
    task: t.id,
    runId: prev.runId,
    gtChanged,
    agentClaims: agentClaims.length,
    gtClaims: gtNow.length,
    borderline: m.borderline.length,
    prevF1: prev.f1,
    f1Lower: Number(lower.f1.toFixed(3)),
    f1Upper: Number(upper.f1.toFixed(3)),
    precisionBounds: [Number(lower.precision.toFixed(3)), Number(upper.precision.toFixed(3))],
    recallBounds: [Number(lower.recall.toFixed(3)), Number(upper.recall.toFixed(3))],
    matcher: { version: 'v2.3-fixed-gt+tfidf+5p5v', ...MATCH_DEFAULTS },
    rescoredAt: new Date().toISOString(),
    note: 'deterministic re-score of stored decomposition vs current GT; borderline pairs await live 5-vote adjudication (bounds shown)',
  });
}
writeFileSync('eval/results/rediscovery-rescore.json', JSON.stringify({ gtRevAtRescore: 'post-0aeeb6d-fix', tasks: out }, null, 2) + '\n');
for (const o of out) console.log(`${o.task} gtChanged=${o.gtChanged} borderline=${o.borderline} prevF1=${o.prevF1} -> [${o.f1Lower}, ${o.f1Upper}]`);
const mean = (f) => Number((out.reduce((s, o) => s + f(o), 0) / out.length).toFixed(3));
console.log(`\nmean F1: prev=${(out.reduce((s, o) => s + o.prevF1, 0) / out.length).toFixed(3)} lower=${mean((o) => o.f1Lower)} upper=${mean((o) => o.f1Upper)} (N=${out.length})`);
