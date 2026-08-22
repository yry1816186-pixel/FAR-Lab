/**
 * Judge-variance measurement harness (Wave-9 D-029; north-star rediscovery-judge-variance).
 *
 * Two modes:
 *
 * --replay   OFFLINE, zero API calls. Takes every RECORDED historical decomposition of
 *            the same run (v1-degraded pass, v2-pass1 pass — the recorded ±0.5 F1 swing
 *            came from these differing decompositions × the OLD LLM matcher) and scores
 *            each one through the NEW deterministic matching layer against the FIXED GT.
 *            Reports, per task: F1 under [borderline=all-unmatched, all-matched] bounds,
 *            cross-decomposition swing under both bounds, borderline share, and the
 *            deterministic-decision share. This measures how much of the recorded ±0.5
 *            the v2.1 stack structurally removes: matching variance -> 0 by construction,
 *            GT decomposition variance -> 0 (fixed), leaving only agent-side decomposition
 *            drift, whose LIVE residual is measured by --live once a model route is funded.
 *
 * --live R   R full re-judges of the SAME completed runs through the identical
 *            rediscovery-judge.mjs pipeline (the one production evals use). Reports
 *            per-task F1 list, maxAbsSwing (target <0.15, stretch <0.08) and variance.
 *            Requires a funded model route (D-036).
 *
 * Usage: node eval/judge-variance.mjs --replay | --live 3
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TASKS, GT_REV, renderTopHypothesis, waitForTerminal } from './rediscovery-tasks.mjs';
import { thresholdMatch, finalizeCounts, MATCH_DEFAULTS } from './claim-match.mjs';
import { judgeRediscovery } from './rediscovery-judge.mjs';
import { maxAbsSwing, variance } from './stats.mjs';
import { loadLocalSecrets } from './load-secrets.mjs';
loadLocalSecrets(); // .far-run/secrets.env keys (names only in any output)

const RESULTS_DIR = resolve(process.cwd(), 'eval/results');
const REPLAY_SOURCES = ['rediscovery-v1-degraded.jsonl', 'rediscovery-v2-pass1.jsonl'];
const RUNS_FILE = join(RESULTS_DIR, 'rediscovery-runs.jsonl');
const MATCH = MATCH_DEFAULTS; // single source with the production pipeline (audit P1 #3)

const loadRecorded = () => {
  const byTask = new Map();
  for (const f of REPLAY_SOURCES) {
    const p = join(RESULTS_DIR, f);
    const text = readFileSync(p, 'utf8');
    for (const line of text.trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.error || !r.claims?.agent) continue;
      const list = byTask.get(r.task) ?? [];
      list.push({ source: f, agentClaims: r.claims.agent, recordedF1: r.f1 ?? null });
      byTask.set(r.task, list);
    }
  }
  return byTask;
};

/** Deterministic-layer bounds: F1 under borderline-all-unmatched / all-matched. */
const scoreWithBounds = (agentClaims, gtClaims) => {
  const m = thresholdMatch(agentClaims, gtClaims, MATCH);
  const detTotal = agentClaims.length + gtClaims.length;
  const adjudNo = m.borderline.map(() => ({ matched: false }));
  const adjudYes = m.borderline.map(() => ({ matched: true }));
  const cNo = finalizeCounts(agentClaims, gtClaims, m, adjudNo);
  const cYes = finalizeCounts(agentClaims, gtClaims, m, adjudYes);
  return {
    matcher: { ...MATCH, borderline: m.borderline.length },
    deterministicShare: detTotal > 0 ? 1 - m.borderline.length / detTotal : 1,
    f1Lower: Math.round(cNo.f1 * 1000) / 1000,
    f1Upper: Math.round(cYes.f1 * 1000) / 1000,
    recordedF1: null,
  };
};

const mode = process.argv.includes('--replay') ? 'replay' : process.argv.includes('--live') ? 'live' : null;
if (!mode) { console.error('usage: node eval/judge-variance.mjs --replay | --live <R>'); process.exit(1); }
mkdirSync(RESULTS_DIR, { recursive: true });

if (mode === 'replay') {
  const byTask = loadRecorded();
  const out = { mode: 'replay', gtRev: GT_REV, sources: REPLAY_SOURCES, generated: new Date().toISOString(), tasks: [] };
  for (const t of TASKS) {
    const passes = byTask.get(t.id) ?? [];
    if (passes.length === 0) { out.tasks.push({ task: t.id, skipped: true, reason: 'no recorded decomposition' }); continue; }
    const scored = passes.map((p) => ({ source: p.source, agentClaims: p.agentClaims.length, ...scoreWithBounds(p.agentClaims, t.gtClaims), recordedV1F1: p.recordedF1 }));
    out.tasks.push({
      task: t.id, gtClaims: t.gtClaims.length, recordedPasses: scored.length,
      swingLower: Math.round(maxAbsSwing(scored.map((s) => s.f1Lower)) * 1000) / 1000,
      swingUpper: Math.round(maxAbsSwing(scored.map((s) => s.f1Upper)) * 1000) / 1000,
      recordedV1Swing: Math.round(maxAbsSwing(scored.map((s) => s.recordedV1F1 ?? 0)) * 1000) / 1000,
      passes: scored,
    });
  }
  const withPasses = out.tasks.filter((t) => !t.skipped);
  const summary = {
    tasksMeasured: withPasses.length,
    medianDeterministicShare: withPasses.length
      ? withPasses.flatMap((t) => t.passes.map((p) => p.deterministicShare)).sort((a, b) => a - b)[Math.floor(withPasses.flatMap((t) => t.passes).length / 2)]
      : null,
    maxCrossDecompositionSwingLower: withPasses.length ? Math.max(...withPasses.map((t) => t.swingLower)) : null,
    maxCrossDecompositionSwingUpper: withPasses.length ? Math.max(...withPasses.map((t) => t.swingUpper)) : null,
    v1RecordedLLMMatcherSwingForComparison: 0.5,
  };
  out.summary = summary;
  const outFile = join(RESULTS_DIR, 'judge-variance-replay.json');
  writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ summary: out.summary, v1RecordedLLMMatcherSwing: out.summary.v1RecordedLLMMatcherSwingForComparison, outFile }, null, 2));
  process.exit(0);
}

// --live R: identical pipeline R times over the same completed runs.
// Provider route: default deepseek; FARLAB_JUDGE_PROVIDER=dashscope uses the
// Qwen/Bailian route (the competition-mandated family) — EITHER funded route
// unblocks the live measurement (D-036 three-way unblock, made real in code).
const R = Number(process.argv.find((a, i) => process.argv[i - 1] === '--live') ?? 3);
const PROVIDER = process.env.FARLAB_JUDGE_PROVIDER ?? 'deepseek';
let provider;
if (PROVIDER === 'dashscope') {
  const { createDashScopeProvider } = await import('../dist/providers/dashscope.js');
  provider = createDashScopeProvider({ totalTimeoutMs: 300_000 });
} else if (PROVIDER === 'deepseek') {
  const { makeProvider } = await import('./lib.mjs');
  provider = makeProvider();
} else {
  console.error(`FATAL: unknown FARLAB_JUDGE_PROVIDER '${PROVIDER}' (deepseek|dashscope)`);
  process.exit(1);
}
if (!provider.liveReady) { console.error(`FATAL: ${PROVIDER} route not live-ready (missing API key?)`); process.exit(1); }
const runs = readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byTask = new Map(TASKS.map((t) => [t.id, t]));
const out = { mode: 'live', gtRev: GT_REV, repeats: R, judgeRoute: { provider: PROVIDER, modelId: provider.modelId }, generated: new Date().toISOString(), tasks: [] };
for (const r of runs) {
  const t = byTask.get(r.task);
  if (!t || !r.runId) continue;
  const status = waitForTerminal(r.runId);
  if (status !== 'completed') { out.tasks.push({ task: r.task, skipped: true, reason: `status ${status}` }); continue; }
  const { text } = renderTopHypothesis(r.runId);
  if (text === null) { out.tasks.push({ task: r.task, skipped: true, reason: 'no top hypothesis' }); continue; }
  const f1s = [];
  const detail = [];
  for (let i = 0; i < R; i += 1) {
    const res = await judgeRediscovery({ agentText: text, gtClaims: t.gtClaims, call: (req, validate) => provider.structuredCall(req, validate) });
    if (!res.ok) { detail.push({ repeat: i + 1, error: res.error }); continue; }
    f1s.push(res.f1);
    detail.push({ repeat: i + 1, f1: res.f1, decomposition: res.decomposition, borderline: res.matcher.borderline });
    console.log(`[judge-variance] ${r.task} #${i + 1}: F1=${res.f1.toFixed(3)} (agent ${res.agentClaims.length} claims, borderline ${res.matcher.borderline})`);
  }
  if (f1s.length === 0) { out.tasks.push({ task: r.task, error: 'all repeats failed', detail }); continue; }
  out.tasks.push({
    task: r.task, gtClaims: t.gtClaims.length, repeatsOk: f1s.length,
    f1s, maxAbsSwing: Math.round(maxAbsSwing(f1s) * 1000) / 1000,
    variance: Math.round(variance(f1s) * 1e6) / 1e6, detail,
  });
}
const measured = out.tasks.filter((t) => t.f1s);
out.summary = {
  tasksMeasured: measured.length,
  worstTaskSwing: measured.length ? Math.max(...measured.map((t) => t.maxAbsSwing)) : null,
  allUnderTarget015: measured.length > 0 && measured.every((t) => t.maxAbsSwing < 0.15),
  allUnderStretch008: measured.length > 0 && measured.every((t) => t.maxAbsSwing < 0.08),
};
const outFile = join(RESULTS_DIR, `judge-variance-live-R${R}.json`);
writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ summary: out.summary, outFile }, null, 2));
