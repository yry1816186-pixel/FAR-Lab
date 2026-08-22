/**
 * EV1 judge seed-agreement re-analysis (Wave-9 offline; zero API calls).
 *
 * The EV1 3-seed judge study (llm-judge-ev1{,-s2,-s3}.jsonl) disclosed only a
 * descriptive "+/-1-2pt seed swing" (D-022 audit). This upgrades that disclosure with
 * the Wave-9 statistics tier: krippendorff alpha (ordinal, 3 raters = 3 seeds) per
 * dimension, per-system mean +/- seeded bootstrap CI, and the Wilson interval on
 * exact-agreement rate. Pure function of the recorded files; same data as D-022.
 *
 * Usage: node eval/ev1-judge-agreement.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { krippendorffAlpha, bootstrapMeanCI, wilsonInterval } from './stats.mjs';

const FILES = ['llm-judge-ev1.jsonl', 'llm-judge-ev1-s2.jsonl', 'llm-judge-ev1-s3.jsonl'];
const rawSeeds = FILES.map((f) => readFileSync(join(resolve(process.cwd(), 'eval/results'), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
// fail-closed on real judge failures; honest skips (e.g. P5 abstention: farlab produced
// 0 lists) are excluded per-seed and the exclusion is recorded in the report
const skippedNote = [];
const SEEDS = rawSeeds.map((rows, i) => {
  const hardFail = rows.find((r) => r.judge_ok === false || r.judge_error);
  if (hardFail) { console.error(`FATAL: judge row failed in ${FILES[i]} (${hardFail.problemId}) — refuse to aggregate`); process.exit(1); }
  const kept = rows.filter((r) => !r.skipped);
  for (const r of rows.filter((x) => x.skipped)) skippedNote.push(`${FILES[i]}:${r.problemId} (${r.reason})`);
  return kept;
});
const problems = SEEDS[0].map((r) => r.problemId);
if (SEEDS.some((rows) => rows.map((r) => r.problemId).join() !== problems.join())) { console.error('FATAL: problem mismatch across seeds'); process.exit(1); }
const DIMS = ['hypothesis_quality', 'counter_evidence_coverage'];
const SYSTEMS = ['farlab', 'direct', 'rag'];
const report = { study: 'EV1 3-seed judge agreement (Wave-9 re-analysis)', sources: FILES, stats: 'krippendorff ordinal (raters=seeds) + seeded bootstrap + Wilson', generated: new Date().toISOString(), dimensions: {} };
report.exclusions = skippedNote;

for (const dim of DIMS) {
  // raters = seeds, items = (problem, system); cells = 1-5 Likert
  const raters = SEEDS.map((rows) => {
    const byKey = new Map();
    for (const r of rows) for (const [system, s] of Object.entries(r.scores)) byKey.set(`${r.problemId}|${system}`, s[dim]);
    return byKey;
  });
  const items = [];
  for (const p of problems) for (const s of SYSTEMS) items.push(`${p}|${s}`);
  const asRaterArrays = raters.map((m) => items.map((k) => m.get(k) ?? null));
  const alpha = krippendorffAlpha(asRaterArrays, 'ordinal');
  let exact = 0;
  for (const k of items) {
    const vals = raters.map((m) => m.get(k));
    if (vals.every((v) => v === vals[0])) exact += 1;
  }
  const perSystem = SYSTEMS.map((sys) => {
    const means = SEEDS.map((rows) => {
      const scores = rows.filter((r) => r.scores[sys]).map((r) => r.scores[sys][dim]);
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    });
    return { system: sys, seedMeans: means.map((m) => Math.round(m * 1000) / 1000), aggregateMean: Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 1000) / 1000, ci: bootstrapMeanCI(means, { seed: 20260822, iters: 5000 }) };
  });
  report.dimensions[dim] = {
    krippendorffOrdinal: alpha,
    exactAgreementAll3Seeds: { k: exact, n: items.length, ...wilsonInterval(exact, items.length) },
    perSystem,
    note: 'raters = the 3 judge seeds; items = 6 problems x 3 systems; alpha is the inter-seed reliability of the judge step itself',
  };
  console.log(`== ${dim}`);
  console.log(`   krippendorff alpha (ordinal, 3 seeds): ${alpha.alpha.toFixed(3)} (${alpha.nPairs} pairs)`);
  console.log(`   exact 3-seed agreement: ${exact}/${items.length} (Wilson ${report.dimensions[dim].exactAgreementAll3Seeds.lo.toFixed(3)}..${report.dimensions[dim].exactAgreementAll3Seeds.hi.toFixed(3)})`);
  for (const ps of perSystem) console.log(`   ${ps.system.padEnd(7)}: seed means ${ps.seedMeans.join('/')} aggregate ${ps.aggregateMean} CI [${ps.ci.lo.toFixed(2)}, ${ps.ci.hi.toFixed(2)}]`);
}
const out = join(resolve(process.cwd(), 'eval/results'), 'ev1-judge-agreement.json');
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`\nDONE -> ${out}`);
