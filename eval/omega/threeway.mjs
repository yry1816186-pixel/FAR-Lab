/**
 * Ω-ULTRA three-way benchmark harness (Wave 0 skeleton). See eval/omega/OMEGA-PROTOCOL.md.
 *
 * Legs: CURRENT (pinned bundle of live runs at a tagged baseline), REBUILT (same
 * procedure at current HEAD), NAKED (delegated to eval/baseline-direct.mjs, unchanged).
 *
 * Usage:
 *   node eval/omega/threeway.mjs status
 *   node eval/omega/threeway.mjs pin [--problems P1,P5] [--route zai] [--timeout-min 90]
 *   node eval/omega/threeway.mjs compare <anchorA.json> <anchorB.json>
 *   node eval/omega/threeway.mjs naked            # delegates to eval/baseline-direct.mjs
 *
 * Discipline: requires built dist/ and a live route key; refuses test doubles and any
 * silent offline fallback (exit 3 with the reason). Raw workspaces stay under
 * eval/results/omega/ (gitignored); only sanitized summaries are written to
 * eval/omega/anchors/ for commit.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ANCHORS_DIR = resolve(HERE, 'anchors');
const RESULTS_DIR = resolve(REPO, 'eval/results/omega');
const CLI = resolve(REPO, 'dist/cli/main.js');
const HARNESS_VERSION = 1;
const TERMINAL = new Set(['partial', 'completed', 'failed', 'cancelled']);
const COUNTER_RELATIONS = new Set(['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation']);

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
/**
 * --cli pins the pipeline entry to a DIFFERENT tree (ΩF-003 lesson: the CURRENT leg
 * must run an immutable build). --commit records that tree's commit in the anchor —
 * the harness commit stays separate, so anchor provenance is two-headed and honest.
 */
const CLI_FLAG = flag('--cli', null);
const cliPath = () => (CLI_FLAG ? resolve(REPO, CLI_FLAG) : CLI);

const die = (code, msg) => {
  console.error(`FATAL: ${msg}`);
  process.exit(code);
};

const gitOut = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

/** Route -> required env var(s). The legacy ZHIPU name is honored for zai (providers/index.ts). */
const ROUTE_KEYS = {
  zai: ['ZAI_API_KEY', 'ZHIPU_API_KEY'],
  dashscope: ['DASHSCOPE_API_KEY'],
  universal: ['FARLAB_UNIVERSAL_API_KEY'],
};
const assertLiveRoute = (route) => {
  if (route === 'deepseek') die(3, 'deepseek is BANNED in this project (user directive 2026-08-22)');
  const names = ROUTE_KEYS[route];
  if (!names) die(3, `unknown route '${route}' (zai | dashscope | universal)`);
  if (!names.some((n) => process.env[n])) die(3, `no live key for route '${route}' (checked env: ${names.join(', ')}) — pinning refuses offline doubles`);
};

const loadProblems = () => {
  const path = process.env.FARLAB_PROBLEMS
    ? resolve(process.cwd(), process.env.FARLAB_PROBLEMS)
    : resolve(REPO, 'eval/problems.json');
  return JSON.parse(readFileSync(path, 'utf8')).problems;
};

/** Deterministic per-run snapshot mirroring W4 metrics 1–7 (no live Crossref leg here). */
const snapshotRun = async (dbPath, runId) => {
  const { isRepresentative } = await importDist();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const objects = (kind) =>
    db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  const runDoc = JSON.parse(db.prepare('SELECT doc FROM runs WHERE id=?').get(runId).doc);
  const sources = objects('source_document');
  const claims = objects('claim');
  const relations = objects('evidence_relation');
  const hypotheses = objects('hypothesis');
  const plans = objects('plan');
  const receipts = objects('receipt');
  const agentReports = objects('agent_report');
  const feedbackSignals = objects('feedback');
  const modelCalls = receipts.filter((r) => r.kind === 'model_call');
  const modes = {};
  for (const r of receipts) modes[r.executionMode ?? 'unknown'] = (modes[r.executionMode ?? 'unknown'] ?? 0) + 1;
  const reps = hypotheses.filter((h) => isRepresentative(h));
  const withSpec = reps.filter((h) => h.falsification);
  const completeSpecs = withSpec.filter((h) => h.falsification?.completenessCheck?.passed === true);
  // Kernel capability outputs (Ω ADR D5): debate verdicts are enrichment-layer objects —
  // they are reported as their own metric family, never merged into pipeline
  // evidence_relation counts (which stay verification-disciplined).
  const debateFindings = agentReports
    .filter((r) => r.capability === 'counter-evidence-debate')
    .flatMap((r) => Array.isArray(r.result?.verdicts) ? r.result.verdicts : [])
    .flatMap((v) => Array.isArray(v.counterFindings) ? v.counterFindings : []);
  const stages = (runDoc.stages ?? []).map((s) => ({ stage: s.stage, state: s.state, ...(s.error ? { reason: s.error } : {}) }));
  db.close();
  return {
    runId,
    status: runDoc.status ?? 'unknown',
    stages,
    metrics: {
      source_total: sources.length,
      source_verification_rate: sources.length
        ? sources.filter((s) => s.verification?.resolved === true && s.verification?.titleMatch === true).length / sources.length
        : null,
      claim_total: claims.length,
      claim_binding_rate: claims.length ? claims.filter((c) => c.bindingStatus === 'verified').length / claims.length : null,
      counter_evidence_relations: relations.filter((r) => COUNTER_RELATIONS.has(r.relation)).length,
      hypothesis_candidates: hypotheses.length,
      hypothesis_representatives: reps.length,
      falsification_completeness_rate: withSpec.length ? completeSpecs.length / withSpec.length : null,
      plan_present: plans.length > 0,
      receipts: receipts.length,
      model_calls: modelCalls.length,
      receipt_modes: modes,
      agent_reports: agentReports.length,
      debate_counter_findings: debateFindings.length,
      feedback_signals: feedbackSignals.length,
      debate_verdict_counts: agentReports
        .filter((r) => r.capability === 'counter-evidence-debate')
        .flatMap((r) => Array.isArray(r.result?.verdicts) ? r.result.verdicts : [])
        .reduce((acc, v) => { const k = String(v.verdict ?? 'unknown'); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
    },
    modelVersions: [...new Set(modelCalls.map((r) => r.modelVersion ?? r.modelId).filter(Boolean))],
  };
};

// dist helpers are imported lazily so `status`/`compare` stay offline-safe.
let distCache;
async function importDist() {
  if (!distCache) {
    if (!existsSync(CLI)) die(3, `dist not built (${CLI} missing) — run npm run build first`);
    distCache = { isRepresentative: (await import('../../dist/pipeline/stages/shared.js')).isRepresentative };
  }
  return distCache;
}

/** Launch one real pipeline run through the CLI into an isolated workspace; wait for terminal. */
const pinOne = async (problem, route, timeoutMin, workspaceDir) => {
  const dbPath = resolve(workspaceDir, 'far.db');
  const args = [
    cliPath(), 'research', 'start', problem.text,
    '--domain', problem.domain ?? 'general science',
    '--goal', problem.goalType ?? 'explanatory',
    '--route', route,
    '--json',
  ];
  const env = { ...process.env, FARLAB_DATA_DIR: workspaceDir };
  delete env.FARLAB_TEST_DOUBLE; // a pin must never inherit offline test doubles
  const t0 = Date.now();
  // cwd MUST be the CLI's own tree root: the D-031 freshness guard resolves src
  // relative to process.cwd(), so launching a worktree build from the harness repo
  // would compare that build against THIS tree's (differently-versioned) src.
  const cliCwd = resolve(dirname(cliPath()), '..', '..');
  const res = spawnSync('node', args, { encoding: 'utf8', env, cwd: cliCwd, timeout: timeoutMin * 60_000, stdio: ['ignore', 'pipe', 'inherit'] });
  const stdoutLine = (res.stdout ?? '').split('\n').find((l) => l.trim().startsWith('{'));
  let runId = null;
  if (stdoutLine) {
    try { runId = JSON.parse(stdoutLine).runId ?? null; } catch { /* reported verbatim below */ }
  }
  if (!runId) {
    return {
      problemId: problem.id, ok: false, error: {
        kind: 'launch_failed', exitCode: res.status, signal: res.signal,
        stdout: (res.stdout ?? '').slice(-500), stderr: (res.stderr ?? '').slice(-500),
      }, wallMs: Date.now() - t0,
    };
  }
  // The CLI may return before the orchestrator finishes; poll the isolated db for terminal.
  const deadline = Date.now() + timeoutMin * 60_000;
  for (;;) {
    if (existsSync(dbPath)) {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare('SELECT doc FROM runs WHERE id=?').get(runId);
      db.close();
      const status = row ? JSON.parse(row.doc).status : null;
      if (status && TERMINAL.has(status)) {
        return { problemId: problem.id, ok: true, snapshot: await snapshotRun(dbPath, runId), wallMs: Date.now() - t0 };
      }
    }
    if (Date.now() > deadline) {
      return { problemId: problem.id, ok: false, error: { kind: 'timeout', runId, waitedMin: timeoutMin }, wallMs: Date.now() - t0 };
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000); // sleep 10s without busy-wait
  }
};

const doPin = async () => {
  const route = flag('--route', 'zai');
  const timeoutMin = Number(flag('--timeout-min', '90'));
  const wanted = flag('--problems', null);
  const commitOverride = flag('--commit', null);
  assertLiveRoute(route);
  if (!existsSync(cliPath())) die(3, `dist not built (${cliPath()} missing) — run npm run build first`);
  const commit = commitOverride ?? gitOut(['rev-parse', 'HEAD']);
  const tag = (() => {
    if (commitOverride !== null) {
      try { return gitOut(['describe', '--tags', '--exact-match', commitOverride]); } catch { return null; }
    }
    try { return gitOut(['describe', '--tags', '--exact-match', 'HEAD']); } catch { return null; }
  })();
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);
  const bundleDir = resolve(RESULTS_DIR, `pin-${stamp}-${route}`);
  mkdirSync(bundleDir, { recursive: true });
  const problems = loadProblems().filter((p) => !wanted || wanted.split(',').includes(p.id));
  console.log(`[omega-pin] route=${route} commit=${commit.slice(0, 10)} tag=${tag ?? 'none'} problems=${problems.map((p) => p.id).join(',')}`);

  const results = [];
  for (const p of problems) {
    console.log(`[omega-pin] ${p.id}: starting (${p.text.slice(0, 60)}...)`);
    const out = await pinOne(p, route, timeoutMin, resolve(bundleDir, `ws-${p.id}`));
    results.push(out);
    console.log(`[omega-pin] ${p.id}: ok=${out.ok}${out.ok ? ` status=${out.snapshot.status} modelCalls=${out.snapshot.metrics.model_calls} wall=${Math.round(out.wallMs / 1000)}s` : ` error=${out.error.kind}`}`);
  }

  const anchor = {
    schemaVersion: 1,
    harnessVersion: HARNESS_VERSION,
    leg: tag === 'omega-baseline-w0' ? 'CURRENT' : 'REBUILT-candidate',
    pinnedAt: new Date().toISOString(),
    gitCommit: commit,
    gitTag: tag,
    route,
    problemsFile: process.env.FARLAB_PROBLEMS ?? 'eval/problems.json',
    cli: {
      path: CLI_FLAG ?? 'dist/cli/main.js',
      argv: ['research', 'start', '<q>', '--domain', '<d>', '--goal', '<g>', '--route', route, '--json'],
    },
    results,
  };
  const anchorPath = resolve(ANCHORS_DIR, `${stamp}-${route}-${commit.slice(0, 7)}.json`);
  mkdirSync(ANCHORS_DIR, { recursive: true });
  writeFileSync(anchorPath, JSON.stringify(anchor, null, 2) + '\n', 'utf8');
  const dbSha = results.filter((r) => r.ok).map((r) => `${r.problemId}:${r.snapshot.runId}`).join(' ');
  console.log(`[omega-pin] anchor -> ${anchorPath}`);
  console.log(`[omega-pin] runIds: ${dbSha || '(none)'}`);
  console.log(`[omega-pin] raw workspaces (gitignored): ${bundleDir}`);
  const failures = results.filter((r) => !r.ok || !['completed', 'partial'].includes(r.snapshot?.status ?? 'failed'));
  if (failures.length) console.error(`[omega-pin] ${failures.length} problem(s) not completed — reported verbatim above (W4 rule: a failure is a real result)`);
};

const doStatus = () => {
  const anchors = existsSync(ANCHORS_DIR) ? readdirSync(ANCHORS_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  console.log(`anchors: ${anchors.length}`);
  for (const f of anchors) {
    const a = JSON.parse(readFileSync(resolve(ANCHORS_DIR, f), 'utf8'));
    const per = a.results.map((r) => `${r.problemId}:${r.ok ? r.snapshot.status : `ERR:${r.error.kind}`}`).join(' ');
    console.log(`  ${f} leg=${a.leg} commit=${a.gitCommit.slice(0, 7)} route=${a.route} [${per}]`);
  }
  const naked = resolve(REPO, 'eval/results/baseline-direct.jsonl');
  console.log(`naked leg (baseline-direct.jsonl): ${existsSync(naked) ? `${readFileSync(naked, 'utf8').trim().split('\n').length} records` : 'ABSENT'}`);
  const rebuilt = anchors.filter((f) => !JSON.parse(readFileSync(resolve(ANCHORS_DIR, f), 'utf8')).leg.startsWith('CURRENT'));
  console.log(`rebuilt anchors: ${rebuilt.length}`);
};

const doCompare = () => {
  const [aPath, bPath] = argv.slice(1);
  if (!aPath || !bPath) die(2, 'compare <anchorA.json> <anchorB.json>');
  const load = (p) => JSON.parse(readFileSync(p.startsWith('eval/') || p.startsWith('.') ? resolve(REPO, p) : p, 'utf8'));
  const A = load(aPath);
  const B = load(bPath);
  console.log(`A: leg=${A.leg} commit=${A.gitCommit.slice(0, 7)} route=${A.route} at=${A.pinnedAt}`);
  console.log(`B: leg=${B.leg} commit=${B.gitCommit.slice(0, 7)} route=${B.route} at=${B.pinnedAt}`);
  if (A.route !== B.route) console.log('DISCLOSED: routes differ between anchors — cross-route numbers are NOT comparable (PROTOCOL ADDENDUM rule)');
  const bBy = Object.fromEntries(B.results.map((r) => [r.problemId, r]));
  for (const ra of A.results) {
    const rb = bBy[ra.problemId];
    if (!rb) { console.log(`${ra.problemId}: MISSING in B`); continue; }
    console.log(`${ra.problemId}: A=${ra.ok ? ra.snapshot.status : `ERR:${ra.error.kind}`} B=${rb.ok ? rb.snapshot.status : `ERR:${rb.error.kind}`}`);
    if (ra.ok && rb.ok) {
      const keys = Object.keys(ra.snapshot.metrics).filter((k) => typeof ra.snapshot.metrics[k] === 'number');
      for (const k of keys) {
        const va = ra.snapshot.metrics[k];
        const vb = rb.snapshot.metrics[k];
        if (va !== vb) console.log(`    ${k}: ${va} -> ${vb} (${vb > va ? '+' : ''}${(vb - va).toFixed?.(4) ?? vb - va})`);
      }
    }
  }
};

const doNaked = () => {
  const env = { ...process.env };
  if (!env.FARLAB_BASELINE_PROVIDER) env.FARLAB_BASELINE_PROVIDER = 'glm';
  const res = spawnSync('node', [resolve(REPO, 'eval/baseline-direct.mjs')], { stdio: 'inherit', env });
  process.exit(res.status ?? 1);
};

const doSnapshot = async () => {
  // Derive an anchor bundle from an ALREADY-terminal run workspace (the pin path may
  // have crashed after the run itself completed; the run data is the evidence).
  const dbPath = flag('--db', null);
  const runId = flag('--run', 'auto');
  const route = flag('--route', 'zai');
  const leg = flag('--leg', 'CURRENT');
  // The anchor's git fields must describe the tree the RUN executed on, not the tree
  // deriving the bundle — post-hoc derivations pass --commit/--tag explicitly.
  const commit = flag('--commit', null) ?? gitOut(['rev-parse', 'HEAD']);
  const tag = flag('--tag', null) ?? (() => { try { return gitOut(['describe', '--tags', '--exact-match', 'HEAD']); } catch { return null; } })();
  if (!dbPath) die(2, 'snapshot --db <workspace>/far.db [--run <id|auto>] [--route zai] [--leg CURRENT|REBUILT] [--commit <sha>] [--tag <tag>] [--problem P5]');
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  const rows = db.prepare('SELECT id, doc FROM runs').all();
  db.close();
  const pick = runId === 'auto' ? rows.at(-1) : rows.find((r) => r.id === runId);
  if (!pick) die(3, `run not found (${runId}) in ${dbPath}`);
  const doc = JSON.parse(pick.doc);
  if (!TERMINAL.has(doc.status ?? '')) die(3, `run ${pick.id} not terminal (status=${doc.status}) — snapshot refuses non-final state`);
  const snapshot = await snapshotRun(resolve(dbPath), pick.id);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);
  const anchor = {
    schemaVersion: 1,
    harnessVersion: HARNESS_VERSION,
    leg,
    pinnedAt: new Date().toISOString(),
    derivedFrom: { dbPath, note: 'snapshot of a completed run workspace (post-hoc bundle derivation)' },
    gitCommit: commit,
    gitTag: tag,
    route,
    problemsFile: process.env.FARLAB_PROBLEMS ?? 'eval/problems.json',
    results: [{ problemId: flag('--problem', 'unknown'), ok: true, snapshot, wallMs: null }],
  };
  const anchorPath = resolve(ANCHORS_DIR, `${stamp}-${route}-${commit.slice(0, 7)}.json`);
  mkdirSync(ANCHORS_DIR, { recursive: true });
  writeFileSync(anchorPath, JSON.stringify(anchor, null, 2) + '\n', 'utf8');
  console.log(`[omega-snapshot] anchor -> ${anchorPath}`);
  console.log(`[omega-snapshot] run=${pick.id} status=${snapshot.status} modelCalls=${snapshot.metrics.model_calls} modes=${JSON.stringify(snapshot.metrics.receipt_modes)}`);
};

if (cmd === 'pin') await doPin();
else if (cmd === 'snapshot') await doSnapshot();
else if (cmd === 'status') doStatus();
else if (cmd === 'compare') doCompare();
else if (cmd === 'naked') doNaked();
else {
  console.error('usage: node eval/omega/threeway.mjs status | pin [--problems P1,P5] [--route zai] [--timeout-min 90] [--cli <dist/main.js>] [--commit <sha>] | snapshot --db <ws>/far.db [--run <id|auto>] [--leg CURRENT] [--route zai] [--problem P5] [--commit <sha>] [--tag <tag>] | compare <a> <b> | naked');
  process.exit(2);
}
