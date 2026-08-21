#!/usr/bin/env node
import { createApp } from '../app/composition.js';
import { ResearchQuestion, newId, runProgress } from '../domain/index.js';
import type { ResearchRun } from '../domain/index.js';

const HELP = `far — FAR-Lab research workbench (XH-202619 Track 1 Direction 1A)

Usage:
  far research start <question text> [--domain <d>] [--goal <type>] [--json]
      Create a research run from a real scientific question and execute the full pipeline.
      --goal: explanatory|predictive|interventional|methodological|exploratory (default explanatory)
  far research status <run-id> [--json]          Show run status/stages/progress (no invented percentages)
  far research inspect <run-id> --evidence|--hypotheses|--plan|--sources [--json]
  far research cancel <run-id>                   Request cancellation (checked between stage operations)
  far research resume <run-id> [--stop-after <stage>] [--json]
                                                  Resume a partial/failed run from its persisted checkpoint
  far research export <run-id> --format report|bundle [--out <dir>] [--json]
                                                  Export human report / reproducibility bundle to --out (default .far-run/exports)
  far runs [--json]                              List runs

Exit codes: 0 ok, 1 runtime failure, 2 usage error. Diagnostics on stderr.`;

function die(msg: string, code = 1): never {
  process.stderr.write(`far: ${msg}\n`);
  process.exitCode = code;
  throw new Error('__exit__');
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(name);
const json = () => flag('--json');
const positional = (after: number): string | undefined => {
  const rest = process.argv.slice(after).filter((a) => !a.startsWith('--') && !COMMAND_WORDS.has(a));
  return rest[0];
};
const COMMAND_WORDS = new Set(['research', 'start', 'status', 'inspect', 'cancel', 'resume', 'export', 'runs', '--evidence', '--hypotheses', '--plan', '--sources']);

const printRun = (run: ResearchRun, verbose = true) => {
  const p = runProgress(run);
  if (json()) {
    const { stages, ...rest } = run;
    console.log(JSON.stringify({ ...rest, progress: p, stages: verbose ? stages : undefined }, null, 2));
  } else {
    console.log(`run ${run.id}`);
    console.log(`  status: ${run.status}  stage: ${run.currentStage}  progress: ${p.done}/${p.total} stages`);
    if (run.lastError) console.log(`  lastError: ${run.lastError}`);
    if (verbose) for (const s of run.stages) {
      const note = s.state === 'running' ? ` (attempt ${s.attempt})` : '';
      console.log(`    ${s.state.padEnd(8)} ${s.stage}${note}${s.error ? ` — ${s.error}` : ''}`);
    }
  }
};

const main = async (): Promise<void> => {
  const [, , cmd, sub] = process.argv;
  if (!cmd || flag('--help') || flag('-h') || cmd === 'help') { console.log(HELP); return; }

  if (cmd === 'runs') {
    const app = await createApp();
    const runs = app.store.listRuns();
    if (json()) console.log(JSON.stringify(runs, null, 2));
    else for (const r of runs) console.log(`${r.id}  ${r.status.padEnd(10)} ${r.currentStage.padEnd(20)} ${r.createdAt}`);
    app.close();
    return;
  }

  if (cmd !== 'research' || !sub) die(`unknown command. See: far --help`, 2);

  if (sub === 'start') {
    const question = positional(4);
    if (!question) die('research start requires a question text', 2);
    const goalType = arg('--goal') ?? 'explanatory';
    const domain = arg('--domain') ?? 'unspecified';
    const app = await createApp();
    try {
      const q = ResearchQuestion.parse({
        id: newId('q'), text: question, background: '', goalType,
        scope: { domain, phenomena: [question] },
        constraints: {}, createdAt: new Date().toISOString(),
      });
      const run = app.store.createRun(q);
      if (json()) console.log(JSON.stringify({ runId: run.id, status: run.status }));
      else console.log(`created run ${run.id}`);
      const done = await app.orchestrator.execute(run.id);
      printRun(done);
      process.exitCode = done.status === 'completed' ? 0 : 1;
    } finally { app.close(); }
    return;
  }

  const runId = positional(4);
  const NEEDS_RUN = ['status', 'inspect', 'cancel', 'resume', 'export'] as const;
  if (sub !== undefined && (NEEDS_RUN as readonly string[]).includes(sub) && !runId) die(`${sub} requires a run id`, 2);
  const rid: string = runId ?? die(`${sub} requires a run id`, 2);

  if (sub === 'status') {
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      printRun(run);
    } finally { app.close(); }
    return;
  }

  if (sub === 'inspect') {
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      if (flag('--sources')) {
        const docs = app.store.listObjects('source_document', run.id);
        if (json()) console.log(JSON.stringify(docs, null, 2));
        else for (const d of docs) console.log(`${d.id} [${d.family}] ${(d.title ?? '').slice(0, 80)} depth=${d.contentDepth} verified=${d.verification?.resolved ?? 'not-checked'}`);
      } else if (flag('--evidence')) {
        const claims = app.store.listObjects('claim', run.id);
        const rels = app.store.listObjects('evidence_relation', run.id);
        if (json()) console.log(JSON.stringify({ claims, relations: rels }, null, 2));
        else {
          for (const c of claims) console.log(`[${c.bindingStatus}] ${c.text.slice(0, 100)}`);
          for (const r of rels) console.log(`(${r.relation}) claim=${r.claimId ?? '-'} hyp=${r.targetHypothesisId ?? '-'} :: ${r.rationale.slice(0, 80)}`);
        }
      } else if (flag('--hypotheses')) {
        const hyps = app.store.listObjects('hypothesis', run.id);
        const scores = app.store.listObjects('scorecard', run.id);
        if (json()) console.log(JSON.stringify({ hypotheses: hyps, scorecards: scores }, null, 2));
        else {
          for (const h of hyps) console.log(`${h.clusterKey ? `[cluster ${h.clusterKey.slice(0, 12)}]` : ''} ${h.statement.slice(0, 100)} (testability=${h.testability}, novelty=${h.noveltyLabel})`);
          for (const s of scores) console.log(`scorecard hyp=${s.hypothesisId} rank=${s.rank}/${s.rankedOutOf}`);
        }
      } else if (flag('--plan')) {
        const plans = app.store.listObjects('plan', run.id);
        if (plans.length === 0) console.log('(no plan yet)');
        else if (json()) console.log(JSON.stringify(plans, null, 2));
        else for (const p of plans) {
          console.log(`objective: ${p.objective}`);
          console.log(`executabilityCheck: ${p.executabilityCheck?.passed ? 'PASS' : `FAIL missing=${p.executabilityCheck?.missing.join('; ')}`}`);
          for (const s of p.steps) console.log(`  - [${s.kind}] ${s.title}: ${s.method.slice(0, 90)}`);
        }
      } else {
        die('inspect requires one of --sources --evidence --hypotheses --plan', 2);
      }
    } finally { app.close(); }
    return;
  }

  if (sub === 'cancel') {
    const app = await createApp();
    try {
      const ok = app.orchestrator.cancel(rid);
      if (!ok) die(`no active run to cancel: ${runId}`);
      app.store.appendEvent(rid, { type: 'run_cancelled', detail: { via: 'cli' } });
      console.log(`cancellation requested for ${runId} (takes effect between stage operations)`);
    } finally { app.close(); }
    return;
  }

  if (sub === 'resume') {
    const app = await createApp();
    try {
      const stopAfter = arg('--stop-after');
      const run = await app.orchestrator.execute(rid, stopAfter ? { stopAfter: stopAfter as never } : undefined);
      printRun(run);
      process.exitCode = run.status === 'completed' ? 0 : 1;
    } finally { app.close(); }
    return;
  }

  if (sub === 'export') {
    const format = arg('--format') ?? 'report';
    const outDir = arg('--out') ?? '.far-run/exports';
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      const fs = await import('node:fs');
      fs.mkdirSync(outDir, { recursive: true });
      if (format === 'bundle') {
        const bundles = app.store.listObjects('bundle', run.id);
        if (bundles.length === 0) die('no bundle stored for this run — run the export stage first (far research resume <id>)');
        const b = bundles[0]!;
        const file = `${outDir}/${b.id}.bundle.json`;
        fs.writeFileSync(file, JSON.stringify(b, null, 2));
        console.log(json() ? JSON.stringify({ file, bundleId: b.id }) : `bundle written: ${file}`);
      } else {
        const reportReceipt = app.store.listObjects('receipt', run.id).find((r) => r.kind === 'export');
        const reports = app.store.listObjects('bundle', run.id);
        if (reportReceipt && reports.length === 0) { /* report stored in artifacts */ }
        const artifactsDir = `${app.dataDir}/artifacts`;
        // the export stage writes the report into the artifact store; find it via the bundle's finalArtifactHashes
        const bundle = app.store.listObjects('bundle', run.id)[0];
        if (!bundle) die('export stage has not produced artifacts yet — run: far research resume <id>');
        const first = bundle.finalArtifactHashes[0];
        if (!first) die('bundle has no report artifact hash');
        const content = await app.artifacts.get(first);
        if (content === null) die(`report artifact missing in store (${first.slice(0, 16)}…): ${artifactsDir}`);
        const file = `${outDir}/${run.id}.report.md`;
        fs.writeFileSync(file, content);
        console.log(json() ? JSON.stringify({ file }) : `report written: ${file}`);
      }
    } finally { app.close(); }
    return;
  }

  die(`unknown subcommand: ${sub}. See: far --help`, 2);
};

try { await main(); } catch (e) {
  if (!(e instanceof Error && e.message === '__exit__')) {
    process.stderr.write(`far: fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
