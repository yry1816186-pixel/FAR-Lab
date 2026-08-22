/**
 * Statistics-tier report generator (Wave-9 evaluation-matrix tier 3).
 *
 * Runs the deterministic statistics layer over RECORDED eval artifacts (zero API
 * calls, pure function of the result files + fixed seeds) and emits
 * eval/results/stats-report.json. Demonstrates every tier-3 statistic on real data:
 *   - bootstrap CI on aggregate metrics (rediscovery mean F1)
 *   - exact paired permutation test on same-task before/after judge passes
 *   - MDE decision gate (REAL / NOT_SIGNIFICANT / INSUFFICIENT_N with warnings)
 *   - Wilson intervals on proportion metrics (claim-match precision)
 *   - Cohen's kappa between judge passes (judge-noise probe)
 * Rationale (statistics-line scout 2026-08-22): paired-permutation is the standard
 * answer for before/after on small N (Miller arXiv:2411.00640 Eq.7; statsforevals);
 * ALL randomness seeded (lm-eval/FastChat discipline; openai/evals + inspect_ai's
 * unseeded bootstrap is the recorded negative example).
 *
 * Usage: node eval/stats-report.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { bootstrapMeanCI, pairedPermutationTest, wilsonInterval, cohensKappa, krippendorffAlpha, pooledStderr, clusterStderr, decideDeltaReality } from './stats.mjs';

const RESULTS = resolve(process.cwd(), 'eval/results');
const SEED = 20260822; // recorded with the report; same seed -> identical report

const readJsonl = (name) => {
  const p = join(RESULTS, name);
  if (!existsSync(p)) return null; // absent file -> section omitted
  // corrupt file -> fail visibly (a silently shrunk report is worse than no report)
  const text = readFileSync(p, 'utf8');
  return text.trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`corrupt jsonl ${name}: ${e instanceof Error ? e.message : String(e)}`, { cause: e }); }
  });
};

const report = { generatedFor: 'wave9-statistics-tier', seed: SEED, deterministic: 'same seed -> identical report', sections: {} };

// --- 1. rediscovery mean F1: bootstrap CI over the recorded (v1, unhardened) pass ---
const v1 = readJsonl('rediscovery-v1-degraded.jsonl');
if (v1) {
  const f1s = v1.filter((r) => typeof r.f1 === 'number').map((r) => r.f1);
  const v2p1 = readJsonl('rediscovery-v2-pass1.jsonl');
  const v2ByTask = new Map((v2p1 ?? []).filter((r) => typeof r.f1 === 'number').map((r) => [r.task, r.f1]));
  const sharedTasks = v1.filter((r) => typeof r.f1 === 'number' && v2ByTask.has(r.task));
  const section = {
    meanF1Bootstrap: { ...bootstrapMeanCI(f1s, { seed: SEED }), note: 'v1 unhardened judge pass; F1 values are the recorded ones' },
  };
  // --- 2. exact paired permutation: same tasks, two recorded judge passes ---
  if (sharedTasks.length >= 2) {
    const before = sharedTasks.map((r) => r.f1);
    const after = sharedTasks.map((r) => v2ByTask.get(r.task));
    const diffs = before.map((b, i) => b - after[i]);
    const ci = bootstrapMeanCI(diffs, { seed: SEED });
    const perm = pairedPermutationTest(before, after, { seed: SEED });
    section.sameTaskTwoPassDelta = {
      n: sharedTasks.length,
      tasks: sharedTasks.map((r) => r.task),
      before, after,
      meanDelta: ci.mean,
      deltaCI: { lo: ci.lo, hi: ci.hi },
      exactPairedPermutation: { pValue: perm.pValue, mode: perm.mode },
      decision: decideDeltaReality({ delta: Math.abs(ci.mean), ciLo: ci.lo, ciHi: ci.hi, pValue: perm.pValue, mde: 0.15, n: sharedTasks.length }),
      note: 'the two passes are UNHARDENED v1-era judge runs — this demonstrates the statistic, it is NOT a pipeline before/after claim',
    };
  }
  report.sections.rediscovery = section;
}

// --- 3. claim-match proportions with Wilson intervals (gold set) ---
try {
  const gold = readFileSync(resolve(process.cwd(), 'eval/claim-pair-gold.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const n = gold.length; const pos = gold.filter((g) => g.label).length;
  const detYes = gold.filter((g) => g.bestSim >= 0.40);
  const detYesTrue = detYes.filter((g) => g.label).length;
  report.sections.goldClaimMatching = {
    prevalenceWilson: wilsonInterval(pos, n),
    calibratedDetYes: { k: detYesTrue, n: detYes.length, precisionWilson: detYes.length ? wilsonInterval(detYesTrue, detYes.length) : null },
    note: 'gold set 104 pairs; deterministic-yes precision = 1.0 by zero-error calibration constraint',
  };
} catch { /* gold not present -> section omitted */ }

// --- 4. agreement probes: decomposition-count kappa AND krippendorff alpha (nominal) ---
if (v1) {
  const v2p1 = readJsonl('rediscovery-v2-pass1.jsonl');
  if (v2p1) {
    const v2Counts = new Map(v2p1.filter((r) => r.claims?.agent).map((r) => [r.task, r.claims.agent.length]));
    const shared = v1.filter((r) => r.claims?.agent && v2Counts.has(r.task));
    if (shared.length >= 2) {
      const a = shared.map((r) => String(r.claims.agent.length));
      const b = shared.map((r) => String(v2Counts.get(r.task)));
      report.sections.decompositionAgreement = {
        kappa: cohensKappa(a, b),
        krippendorffNominal: krippendorffAlpha([a, b], 'nominal'),
        note: 'claim-count agreement between two recorded decomposition passes (coarse buckets); low agreement = decomposition noise the v2.1 median + fixed protocol target',
      };
    }
  }
}

// --- 5. cluster SE + pooled SE across domain families ---
if (v1) {
  const scored = v1.filter((r) => typeof r.f1 === 'number');
  const families = { oncology: [], microbiology: [], 'molecular biology': [] };
  const familyOf = { 'egfr-tki-resistance': 'oncology', 'crc-ici-failure': 'oncology', 'antibiotic-cdiff': 'microbiology', 'arg-plasmid-transfer': 'microbiology', 'crispr-offtarget': 'molecular biology' };
  for (const r of scored) { const f = familyOf[r.task]; if (f) families[f].push(r.f1); }
  const clusters = Object.entries(families).filter(([, c]) => c.length > 0);
  const clusterVals = clusters.map(([, c]) => c);
  // per-family mean/stderr feed the pooled SE (lm-eval pooled_sample_stderr pattern)
  const groupStats = clusters.map(([name, vals]) => {
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (vals.length - 1)) : 0;
    return { name, mean, stderr: sd / Math.sqrt(vals.length), n: vals.length };
  });
  report.sections.clusterStderr = {
    ...clusterStderr(clusterVals),
    perFamily: groupStats,
    pooledAcrossFamilies: pooledStderr(groupStats),
    note: 'F1 scores clustered by domain family; cluster-robust SE (Miller Eq.4/8) + pooled SE of the size-weighted family mean (lm-eval pooled_sample_stderr)',
  };
}

const out = join(RESULTS, 'stats-report.json');
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log(`\nDONE -> ${out}`);
