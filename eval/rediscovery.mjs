/**
 * Rediscovery evaluation slice (W-EV2/Wave-3 #3) — FIRE-Bench DESIGN adaptation.
 *
 * Mechanism extracted from the FIRE-Bench paper (arXiv 2602.02905, ICML 2026):
 * ground an agent's output against a PUBLISHED/ESTABLISHED finding via atomic-claim
 * decomposition + set matching (P/R/F1) — objective ground truth, no quality-judge
 * circularity. The official repo has NO LICENSE (code unusable; we implement our own
 * harness) and the HF dataset (Apache-2.0) is unreachable from this environment, so
 * this seed set is AUTHORED IN-REPO from textbook-established findings (disclosed);
 * importing the HF task set is a documented extension once network allows.
 *
 * Scope honesty: FAR-Lab is Direction-A (hypothesis + plan, no experiment execution).
 * The scored artifact is the TOP HYPOTHESIS (statement + mechanism + predictions +
 * falsification expectation) of a real research start run — rediscovery at hypothesis
 * level. NOT comparable to official FIRE-Bench agent scores (full-cycle, executed).
 *
 * Judge v2.3 (2026-08-29 variance-stabilization): FIXED ground-truth claims (rediscovery-tasks.mjs,
 * GT_REV) + agent-side fixed-granularity 5-pass-median decomposition + deterministic
 * TF-IDF threshold matching (low recalibrated 0.12→0.10 on a new below-floor gold batch)
 * + 5-vote LLM adjudication ONLY for the borderline band (pipeline single-sourced in
 * rediscovery-judge.mjs). Variance budget and offline/live measurement: eval/judge-variance.mjs.
 *
 * Usage: node eval/rediscovery.mjs [--skip-runs] [--sample N]
 * Env: FARLAB_JUDGE_PROVIDER=zai|dashscope (deepseek banned 2026-08-22; default zai); key via env or .far-run/secrets.env.
 * Writes eval/results/rediscovery.jsonl (+ -runs.jsonl).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { TASKS, renderTopHypothesis, waitForTerminal, GT_REV } from './rediscovery-tasks.mjs';
import { judgeRediscovery } from './rediscovery-judge.mjs';
import { loadLocalSecrets } from './load-secrets.mjs';
loadLocalSecrets(); // .far-run/secrets.env keys (names only in any output)
import { createZaiProvider } from '../dist/providers/zai.js';
import { createDashScopeProvider } from '../dist/providers/dashscope.js';

// Judge + run-generation provider (deepseek BANNED by user directive 2026-08-22).
// Default 'zai' = PRODUCTION src provider: Anthropic Messages wire on
// open.bigmodel.cn, glm-5.3 (the funded model) — used for BOTH judging and,
// via FARLAB_MODEL_PROVIDER=zai, main-pipeline run generation.
const PROVIDER = process.env.FARLAB_JUDGE_PROVIDER ?? 'zai';
const PIPELINE_PROVIDER = { zai: 'zai', dashscope: 'dashscope' }[PROVIDER] ?? null;
const farRunEnv = () => (PIPELINE_PROVIDER
  ? { ...process.env, FARLAB_MODEL_PROVIDER: PIPELINE_PROVIDER, ...(PIPELINE_PROVIDER === 'zai' ? { FARLAB_ZAI_MODEL: process.env.FARLAB_ZAI_MODEL ?? 'glm-5.3' } : {}) }
  : null);
const makeLiveProvider = () => {
  if (PROVIDER === 'zai') {
    process.env.ZAI_API_KEY ??= process.env.ZHIPU_API_KEY; // secrets.env may use either name
    return createZaiProvider({ totalTimeoutMs: 300_000, model: process.env.FARLAB_ZAI_MODEL ?? 'glm-5.3' });
  }
  if (PROVIDER === 'dashscope') return createDashScopeProvider({ totalTimeoutMs: 300_000 });
  die(`unknown FARLAB_JUDGE_PROVIDER '${PROVIDER}' (zai|dashscope; deepseek banned by user directive)`);
};

const RESULTS_DIR = resolve(process.cwd(), 'eval/results');
const OUT = join(RESULTS_DIR, 'rediscovery.jsonl');
const RUNS_FILE = join(RESULTS_DIR, 'rediscovery-runs.jsonl');
const SKIP_RUNS = process.argv.includes('--skip-runs');
const RUNS_ONLY = process.argv.includes('--runs-only'); // generate missing runs, skip judging (quota discipline)
const SAMPLE_N = Number(process.env.REDISCOVERY_N ?? 5);

const die = (msg) => { console.error('FATAL: ' + msg); process.exit(1); };
const provider = makeLiveProvider();
if (!provider.liveReady) die(`${PROVIDER} route not live-ready (missing API key?)`);

const sample = TASKS.slice(0, SAMPLE_N);
mkdirSync(RESULTS_DIR, { recursive: true });

const farRun = (t) => {
  const env = farRunEnv();
  if (!env) die(`run generation unavailable on PROVIDER='${PROVIDER}': the main pipeline (OpenAI-protocol providers only) has no funded route for this account; glm serves JUDGING only. Rerun with --skip-runs to judge existing runs.`);
  const stdout = execFileSync('node', [
    'dist/cli/main.js', 'research', 'start', t.question,
    '--domain', t.domain, '--goal', t.goal, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30 * 60_000, env });
  const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
  return JSON.parse(line ?? '{}');
};

// phase 1: runs (the CLI may return at creation while a detached engine keeps
// executing — each run waits for its terminal state before being recorded)
if (!SKIP_RUNS) {
  const prior = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const done = new Set(prior.filter((r) => r.runId).map((r) => r.task));
  for (const t of sample) {
    if (done.has(t.id)) { console.log(`[rediscovery] ${t.id}: run exists, skipping`); continue; }
    console.log(`[rediscovery] starting run for ${t.id}`);
    try {
      const r = farRun(t);
      const finalStatus = waitForTerminal(r.runId);
      appendFileSync(RUNS_FILE, JSON.stringify({ task: t.id, runId: r.runId, status: finalStatus }) + '\n');
      console.log(`[rediscovery] ${t.id} -> ${r.runId} (${finalStatus})`);
    } catch (e) {
      appendFileSync(RUNS_FILE, JSON.stringify({ task: t.id, error: String(e.message).slice(0, 300), stderr: String(e.stderr ?? '').slice(0, 500) }) + '\n');
      console.error(`[rediscovery] ${t.id} RUN FAILED: ${e.message}`);
    }
  }
}

// phase 2: score (each run waits for its terminal state before rendering — the CLI
// returns at creation while a detached engine keeps executing; judging an unfinished
// run would render a mid-pipeline hypothesis)
if (RUNS_ONLY) {
  console.log('[rediscovery] --runs-only: generation complete, scoring skipped (quota discipline)');
  process.exit(0);
}
const runs = existsSync(RUNS_FILE) ? readFileSync(RUNS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const byTask = new Map(TASKS.map((t) => [t.id, t]));
const records = [];
for (const r of runs) {
  const t = byTask.get(r.task);
  if (!t || !r.runId) continue;
  const status = waitForTerminal(r.runId);
  if (status !== 'completed') { records.push({ task: r.task, runId: r.runId, skipped: true, reason: `run terminal status: ${status}` }); console.log(`[rediscovery] ${r.task}: skipped (status ${status})`); continue; }
  const { text } = renderTopHypothesis(r.runId);
  if (text === null) { records.push({ task: r.task, skipped: true, reason: 'no top hypothesis' }); continue; }
  const res = await judgeRediscovery({
    agentText: text,
    gtClaims: t.gtClaims,
    // Judge configuration restored to its CALIBRATED shape (2026-08-29 drift fix):
    // the 0.58-era measurement ran before the product transport disabled default
    // thinking; the new default changed judge decomposition granularity (F1 0.58→0.03
    // on IDENTICAL frozen artifacts) and thinking-enabled votes then failed on their
    // small budgets. This wrapper re-enables thinking via the sanctioned reasoning
    // route at the 'low' gear and raises every judge call's ceiling so thinking fits
    // alongside the answer — instrument restoration, not metric tuning.
    call: (req, validate) => provider.structuredCall(
      { ...req, reasoning: { style: 'thinking_budget', gear: 'low' }, maxTokens: Math.max(req.maxTokens ?? 0, 16_000) },
      validate,
    ),
  });
  if (!res.ok) {
    records.push({ task: r.task, runId: r.runId, error: `${res.error.stage}: ${res.error.message}`.slice(0, 300) });
    console.error(`[rediscovery] judge error ${r.task}: ${res.error.stage}: ${res.error.message}`);
    continue;
  }
  records.push({
    task: r.task, runId: r.runId, judge: provider.modelId, judgeRoute: PROVIDER, temperature: 0, gtRev: GT_REV,
    matcher: res.matcher,
    decomposition: res.decomposition,
    agentClaims: res.agentClaims.length, gtClaims: t.gtClaims.length,
    agentMatched: res.counts.agentMatched, gtMatched: res.counts.gtMatched,
    precision: Math.round(res.counts.precision * 1000) / 1000,
    recall: Math.round(res.counts.recall * 1000) / 1000,
    f1: res.f1,
    adjudications: res.adjudications,
    adjudicationVotes: res.adjudicationVotes,
    scoredUnscored: res.scoredUnscored,
    claims: { agent: res.agentClaims, gt: t.gtClaims },
    topHypothesis: text,
  });
  console.log(`[rediscovery] ${r.task}: P=${res.counts.precision.toFixed(2)} R=${res.counts.recall.toFixed(2)} F1=${res.f1.toFixed(2)} (${res.counts.agentMatched}/${res.agentClaims.length} agent, ${res.counts.gtMatched}/${t.gtClaims.length} gt, borderline ${res.matcher.borderline})`);
}
writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const scored = records.filter((r) => r.f1 !== undefined);
if (scored.length > 0) {
  const mean = (f) => scored.reduce((a, r) => a + r[f], 0) / scored.length;
  console.log(`\n[rediscovery] means over ${scored.length} tasks: P=${mean('precision').toFixed(2)} R=${mean('recall').toFixed(2)} F1=${mean('f1').toFixed(2)}`);
}
console.log(`DONE -> ${OUT}`);
