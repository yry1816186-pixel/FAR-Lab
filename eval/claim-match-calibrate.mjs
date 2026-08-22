/**
 * Offline threshold calibration for the deterministic claim matcher (no API calls).
 *
 * Inputs: the RECORDED v1 judge outputs (eval/results/rediscovery-v1-degraded.jsonl
 * carries per-task claim sets + the LLM's matched counts). We sweep (high, low)
 * thresholds, report per-task deterministic counts vs the recorded LLM counts, and
 * the size of the borderline band (adjudication cost proxy). The chosen thresholds
 * minimize count discrepancy while keeping the borderline band small.
 *
 * Usage: node eval/claim-match-calibrate.mjs [results.jsonl]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contentTokens, tfidfCosine, thresholdMatch, finalizeCounts } from './claim-match.mjs';

const FILE = resolve(process.cwd(), process.argv[2] ?? 'eval/results/rediscovery-v1-degraded.jsonl');
const records = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.claims?.agent && r.claims?.gt);

const GRID_HIGH = [0.35, 0.40, 0.45, 0.50, 0.55];
const GRID_LOW = [0.10, 0.15, 0.20, 0.25];

const scoreThresholds = (high, low) => {
  let totalAbsDiff = 0;
  let totalBorderline = 0;
  let totalPairs = 0;
  const perTask = [];
  for (const r of records) {
    const agent = r.claims.agent;
    const gt = r.claims.gt;
    const m = thresholdMatch(agent, gt, { high, low });
    const counts = finalizeCounts(agent, gt, m, m.borderline.map((b) => ({ matched: b.bestSim >= (high + low) / 2 }))); // midpoint adjudication for calibration only
    const diff = Math.abs(counts.agentMatched - r.agentMatched) + Math.abs(counts.gtMatched - r.gtMatched);
    totalAbsDiff += diff;
    totalBorderline += m.borderline.length;
    totalPairs += agent.length + gt.length;
    perTask.push({ task: r.task, det: `${counts.agentMatched}/${counts.gtMatched}`, llm: `${r.agentMatched}/${r.gtMatched}`, diff, borderline: m.borderline.length });
  }
  return { high, low, totalAbsDiff, totalBorderline, borderPct: Math.round((100 * totalBorderline) / totalPairs), perTask };
};

console.log(`calibrating on ${records.length} tasks from ${FILE}\n`);
const rows = [];
for (const high of GRID_HIGH) for (const low of GRID_LOW) if (low < high) rows.push(scoreThresholds(high, low));
rows.sort((a, b) => (a.totalAbsDiff - b.totalAbsDiff) || (a.borderPct - b.borderPct));
console.log('high  low   | Σ|Δcounts| | borderline% | per-task det-vs-llm');
for (const r of rows.slice(0, 8)) {
  console.log(
    `${r.high.toFixed(2)} ${r.low.toFixed(2)} |    ${String(r.totalAbsDiff).padStart(3)}     |    ${String(r.borderPct).padStart(3)}%      | ` +
    r.perTask.map((t) => `${t.task.slice(0, 10)} det=${t.det} llm=${t.llm}`).join('  '),
  );
}

// similarity sanity: the near-paraphrase pair from arg-plasmid, and an unrelated pair
const paraphrase = [ 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.', 'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.' ];
const unrelated = [ 'Antibiotics disrupt the gut microbiota.', 'Off-target editing arises because the Cas9-guide RNA complex tolerates sequence mismatches.' ];
const sim12 = tfidfCosine([contentTokens(paraphrase[0]), contentTokens(paraphrase[1]), contentTokens(unrelated[0]), contentTokens(unrelated[1])]);
console.log(`\nparaphrase-pair tfidf-cosine: ${sim12(0, 1).toFixed(3)} (expect HIGH side)`);
console.log(`unrelated-pair tfidf-cosine: ${sim12(2, 3).toFixed(3)} (expect LOW side)`);
