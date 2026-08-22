#!/usr/bin/env node
import { createApp } from '../app/composition.js';
import { verifyBundle } from '../app/verify.js';
import { FeedbackSignal, FeedbackSourceKind, ObjectRef, ResearchQuestion, newId, runProgress } from '../domain/index.js';
import type { ResearchRun } from '../domain/index.js';
import { staleDistFiles } from './dist-freshness.js';
import { ink, marker, out, table, padColumns } from './term.js';

/** D-031: refuse to execute stages on a dist older than src (stale-build live incident). */
const assertDistFresh = (): void => {
  const stale = staleDistFiles();
  if (stale.length > 0) {
    die(
      `dist is stale relative to src (${stale.length} file(s): ${stale.slice(0, 3).join(', ')}${stale.length > 3 ? ' …' : ''}) — run npm run build first. Refusing to execute stale compiled behavior (D-031).`,
      3,
    );
  }
};

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
  far research feedback <run-id> --source <kind> --content <text> [--target-kind <kind> --target-id <id>] [--json]
                                                  Record feedback on a run (source: human_expert|new_literature|new_dataset|
                                                  tool_result|simulation|experiment|reviewer|verification_failure|
                                                  reproduction_failure); consumed causally by the revise stage
  far runs [--json]                              List runs
  far probe [provider] [--live] [--json]         Model-route health: config check by default
                                                  (key presence, never values); --live makes one
                                                  minimal real chat call per route (costs ~1 token)
  far data info [--json]                         Data footprint: runs, db size, artifacts, exports
  far verify <bundle-id> [--json]                Independently verify a reproducibility bundle
                                                  (exit 0=verified, 1=failed/degraded)

Exit codes: 0 ok, 1 runtime failure, 2 usage error. Diagnostics on stderr.`;

function die(msg: string, code = 1): never {
  process.stderr.write(`${ink.err('far')} ${msg}\n`);
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
const COMMAND_WORDS = new Set(['research', 'start', 'status', 'inspect', 'cancel', 'resume', 'export', 'feedback', 'runs', 'probe', 'data', 'info', '--live', '--evidence', '--hypotheses', '--plan', '--sources', '--source', '--content', '--target-kind', '--target-id']);

/**
 * Machine-mode output helper (WP2 F-005): --json consumers parse stdout as ONE JSON
 * document. A serialization crash mid-write would emit truncated JSON that looks like
 * valid EOF — surface the failure on stderr with a non-zero exit instead.
 */
const jsonOutput = (data: unknown): void => {
  try {
    process.stdout.write(JSON.stringify(data) + '\n');
  } catch (e) {
    process.stderr.write(`far: json serialization failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
};

/** run ids are prefix-branded; reject malformed args before store-layer use (WP2 F-003). */
const RUN_ID_RE = /^run_[0-9a-z]{20,32}$/;
const runIdArg = (raw: string | undefined, sub: string): string => {
  const rid = raw ?? die(`${sub} requires a run id`, 2);
  if (!RUN_ID_RE.test(rid)) die(`invalid run id format: ${rid} (expected run_<26-char id>)`, 2);
  return rid;
};

const STATUS_INK: Record<string, (s: string) => string> = {
  completed: ink.ok,
  running: ink.info,
  queued: ink.muted,
  partial: ink.warn,
  failed: ink.err,
  cancelled: ink.muted,
};
const statusInk = (s: string): ((x: string) => string) => STATUS_INK[s] ?? ((x) => x);
const STAGE_STATE_INK: Record<string, (s: string) => string> = {
  done: ink.ok, failed: ink.err, running: ink.info, skipped: ink.muted, pending: ink.muted,
};

const printRun = (run: ResearchRun, verbose = true) => {
  const p = runProgress(run);
  if (json()) {
    const { stages, ...rest } = run;
    jsonOutput({ ...rest, progress: p, stages: verbose ? stages : undefined });
  } else {
    out(`${marker()} ${ink.bold(`run ${run.id}`)}`);
    out(`  ${ink.bold('status')}: ${statusInk(run.status)(run.status)}  ${ink.bold('stage')}: ${run.currentStage}  ${ink.bold('progress')}: ${p.done}/${p.total} stages`);
    if (run.lastError) out(`  ${ink.err('lastError')}: ${ink.muted(run.lastError)}`);
    if (verbose) for (const s of run.stages) {
      const tone = STAGE_STATE_INK[s.state] ?? ((x: string) => x);
      const note = s.state === 'running' ? ` (attempt ${s.attempt})` : '';
      out(`    ${tone(padColumns(s.state, 8))} ${s.stage}${note}${s.error ? ` — ${ink.err(s.error)}` : ''}`);
    }
  }
};

const main = async (): Promise<void> => {
  const [, , cmd, sub] = process.argv;
  if (!cmd || flag('--help') || flag('-h') || cmd === 'help') { console.log(HELP); return; }

  if (cmd === 'runs') {
    const app = await createApp();
    const runs = app.store.listRuns();
    if (json()) jsonOutput(runs);
    else if (runs.length === 0) out(ink.muted('(no runs yet — create one: far research start "<question>")'));
    else table(
      ['run', 'status', 'stage', 'created'],
      runs.map((r) => [r.id, statusInk(r.status)(r.status), r.currentStage, r.createdAt]),
    );
    app.close();
    return;
  }

  if (cmd === 'probe') {
    // Route health (D-060 phase-3). Config mode never touches the network; --live makes
    // ONE minimal chat call per route (explicit user action — no ambient probing).
    const { listProviders } = await import('../providers/index.js');
    const wanted = positional(3);
    const all = listProviders().filter((p) => wanted === undefined || p.name === wanted);
    if (all.length === 0) die(`unknown provider: ${wanted}`, 2);
    const results: Array<Record<string, unknown>> = [];
    for (const p of all) {
      const entry: Record<string, unknown> = {
        provider: p.name, kind: p.kind, model: p.modelId, baseUrl: p.baseUrl, apiKeyEnvVar: p.apiKeyEnvVar,
      };
      const key = p.apiKeyEnvVar.startsWith('(') ? '' : (process.env[p.apiKeyEnvVar] ?? '');
      if (p.kind !== 'live') {
        entry.status = 'test-only';
      } else if (key.length === 0) {
        entry.status = 'missing-key';
      } else if (!flag('--live')) {
        entry.status = 'key-present';
      } else {
        try {
          const res = await fetch(`${p.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: p.modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
            signal: AbortSignal.timeout(20_000),
          });
          const bodyText = await res.text();
          if (res.ok) {
            entry.status = 'ready';
            entry.httpStatus = res.status;
          } else {
            entry.status = 'blocked';
            entry.httpStatus = res.status;
            entry.detail = bodyText.slice(0, 200); // honest cause (401/402/429 …), key never echoed
          }
        } catch (e) {
          entry.status = 'unreachable';
          entry.detail = e instanceof Error ? e.message : String(e);
        }
      }
      results.push(entry);
    }
    if (json()) jsonOutput(results);
    else for (const r of results) {
      const tone = r.status === 'ready' ? ink.ok : r.status === 'key-present' ? ink.info : ink.err;
      out(`${padColumns(String(r.provider), 10)} ${tone(padColumns(String(r.status), 12))} model=${String(r.model)}${r.httpStatus !== undefined ? `  http=${r.httpStatus}` : ''}${r.detail !== undefined ? `\n  ${ink.muted(String(r.detail))}` : ''}`);
    }
    const bad = results.filter((r) => r.status === 'missing-key' || r.status === 'blocked' || r.status === 'unreachable');
    if (bad.length > 0 && (flag('--live') || all.some((p) => p.kind === 'live' && wanted !== undefined))) process.exitCode = 1;
    return;
  }

  if (cmd === 'data' && sub === 'info') {
    // Data footprint (read-only, honest numbers from the real directory).
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dataDir = path.resolve(process.env.FARLAB_DATA_DIR ?? '.far-run');
    const sizeOf = (p: string): number => { try { return fs.statSync(p).size; } catch { return -1; } };
    const dirStats = (d: string): { files: number; bytes: number } => {
      // Recursive walk: the artifact store is sharded (artifacts/ab/cdef…), so a
      // flat readdir would count directories as 0-byte entries on Windows.
      let files = 0;
      let bytes = 0;
      const walk = (dir: string): void => {
        let list: string[];
        try { list = fs.readdirSync(dir); } catch { return; }
        for (const f of list) {
          const p = path.join(dir, f);
          try {
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else { files += 1; bytes += st.size; }
          } catch { /* racing deletion — skip this entry */ }
        }
      };
      walk(d);
      return { files, bytes };
    };
    const db = path.join(dataDir, 'far.db');
    const artifacts = dirStats(path.join(dataDir, 'artifacts'));
    const exportsDir = dirStats(path.join(dataDir, 'exports'));
    const app = await createApp({ dataDir });
    let runsByStatus: Record<string, number>;
    try {
      runsByStatus = app.store.listRuns().reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
    } finally { app.close(); }
    const info = {
      dataDir, runsByStatus, totalRuns: Object.values(runsByStatus).reduce((a, b) => a + b, 0),
      dbBytes: sizeOf(db), dbWalBytes: sizeOf(`${db}-wal`), dbShmBytes: sizeOf(`${db}-shm`),
      artifacts, exports: exportsDir,
    };
    if (json()) jsonOutput(info);
    else {
      console.log(`data dir: ${info.dataDir}`);
      console.log(`runs: ${info.totalRuns} (${Object.entries(runsByStatus).map(([s, n]) => `${s}=${n}`).join(' ') || 'none'})`);
      console.log(`db: ${info.dbBytes < 0 ? 'missing' : `${info.dbBytes} B`}${info.dbWalBytes >= 0 ? ` (+wal ${info.dbWalBytes} B)` : ''}`);
      console.log(`artifacts: ${artifacts.files} files, ${artifacts.bytes} B`);
      console.log(`exports: ${exportsDir.files} files, ${exportsDir.bytes} B`);
    }
    return;
  }
  if (cmd === 'data') die('data requires a subcommand: info', 2);

  if (cmd === 'verify') {
    const bundleId = positional(3);
    if (!bundleId) die('verify requires a bundle id', 2);
    const app = await createApp();
    try {
      const report = await verifyBundle(bundleId, { store: app.store, artifacts: app.artifacts });
      if (json()) jsonOutput(report);
      else {
        out(`bundle ${report.bundleId} (run ${report.runId}) — declared evidence level: ${report.declaredEvidenceLevel}`);
        out(`verdict: ${ink.bold(report.verdict)} (${report.checks.filter((c) => c.passed).length}/${report.checks.length} checks passed)`);
        for (const c of report.checks) out(`  ${c.passed ? ink.ok('PASS') : ink.err('FAIL')}  ${c.name} — ${c.detail}`);
        if (report.replayGuidance) out(`\n${report.replayGuidance}`);
      }
      process.exitCode = report.verdict === 'verified' ? 0 : 1;
    } finally { app.close(); }
    return;
  }

  if (cmd !== 'research' || !sub) die(`unknown command. See: far --help`, 2);

  if (sub === 'start') {
    const question = positional(4);
    if (!question) die('research start requires a question text', 2);
    assertDistFresh();
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
      if (json()) jsonOutput({ runId: run.id, status: run.status });
      else out(`${marker()} ${ink.ok('created')} run ${ink.bold(run.id)} — executing pipeline (progress on stderr)`);
      const done = await app.orchestrator.execute(run.id);
      printRun(done);
      process.exitCode = done.status === 'completed' ? 0 : 1;
    } finally { app.close(); }
    return;
  }

  const runId = positional(4);
  const NEEDS_RUN = ['status', 'inspect', 'cancel', 'resume', 'export'] as const;
  if (sub !== undefined && (NEEDS_RUN as readonly string[]).includes(sub) && !runId) die(`${sub} requires a run id`, 2);
  const rid: string = runIdArg(runId, sub ?? 'command');

  if (sub === 'status') {
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      // W8 S1: real lease state — a status='running' run with no live lease is frozen
      // (recoverable via `far research resume <id>`: expired leases are reclaimable).
      const lease = app.store.getRunLease(rid);
      const live = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
      if (json()) {
        // single JSON object for machine consumers (two blobs would break JSON.parse(stdout))
        const { stages, ...rest } = run;
        jsonOutput({ ...rest, progress: runProgress(run), stages, lease: { holder: lease.holder, expiresAt: lease.expiresAt, live } });
      } else {
        printRun(run);
        out(`  ${ink.bold('lease')}: ${lease.holder === null ? 'none' : `${lease.holder} (expires ${lease.expiresAt})`}${run.status === 'running' && !live ? `  ${ink.warn('[FROZEN — resume to recover]')}` : ''}`);
      }
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
        if (json()) jsonOutput(docs);
        else for (const d of docs) console.log(`${d.id} [${d.family}] ${(d.title ?? '').slice(0, 80)} depth=${d.contentDepth} verified=${d.verification?.resolved ?? 'not-checked'}`);
      } else if (flag('--evidence')) {
        const claims = app.store.listObjects('claim', run.id);
        const rels = app.store.listObjects('evidence_relation', run.id);
        if (json()) jsonOutput({ claims, relations: rels });
        else {
          for (const c of claims) console.log(`[${c.bindingStatus}] ${c.text.slice(0, 100)}`);
          for (const r of rels) console.log(`(${r.relation}) claim=${r.claimId ?? '-'} hyp=${r.targetHypothesisId ?? '-'} :: ${r.rationale.slice(0, 80)}`);
        }
      } else if (flag('--hypotheses')) {
        const hyps = app.store.listObjects('hypothesis', run.id);
        const scores = app.store.listObjects('scorecard', run.id);
        if (json()) jsonOutput({ hypotheses: hyps, scorecards: scores });
        else {
          for (const h of hyps) console.log(`${h.clusterKey ? `[cluster ${h.clusterKey.slice(0, 12)}]` : ''} ${h.statement.slice(0, 100)} (testability=${h.testability}, novelty=${h.noveltyLabel})`);
          for (const s of scores) console.log(`scorecard hyp=${s.hypothesisId} rank=${s.rank}/${s.rankedOutOf}`);
        }
      } else if (flag('--plan')) {
        const plans = app.store.listObjects('plan', run.id);
        if (plans.length === 0) console.log('(no plan yet)');
        else if (json()) jsonOutput(plans);
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
      out(`${marker()} ${ink.warn('cancellation requested')} for ${runId} (takes effect between stage operations)`);
    } finally { app.close(); }
    return;
  }

  if (sub === 'resume') {
    assertDistFresh();
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
        const b = bundles[bundles.length - 1]!; // latest bundle (revisions may supersede earlier exports)
        const file = `${outDir}/${b.id}.bundle.json`;
        fs.writeFileSync(file, JSON.stringify(b, null, 2));
        console.log(json() ? JSON.stringify({ file, bundleId: b.id }) : `bundle written: ${file}`);
      } else {
        const reportReceipt = app.store.listObjects('receipt', run.id).find((r) => r.kind === 'export');
        const reports = app.store.listObjects('bundle', run.id);
        if (reportReceipt && reports.length === 0) { /* report stored in artifacts */ }
        const artifactsDir = `${app.dataDir}/artifacts`;
        // the export stage writes the report into the artifact store; find it via the bundle's finalArtifactHashes
        const bundle = app.store.listObjects('bundle', run.id).at(-1);
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

  if (sub === 'feedback') {
    // W2: record external/human feedback as a persisted FeedbackSignal; the revise
    // stage consumes it causally on the next pipeline pass (never re-prompt-and-replace).
    const source = arg('--source');
    const content = arg('--content');
    if (!source || !content) die('research feedback requires --source <kind> and --content <text>', 2);
    const parsedSource = FeedbackSourceKind.safeParse(source);
    if (!parsedSource.success) die(`invalid --source "${source}" — must be one of: ${FeedbackSourceKind.options.join(', ')}`, 2);
    const targetKind = arg('--target-kind');
    const targetId = arg('--target-id');
    if ((targetKind !== undefined) !== (targetId !== undefined)) die('--target-kind and --target-id must be given together', 2);
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      let target: ObjectRef | undefined;
      if (targetKind !== undefined && targetId !== undefined) {
        const ref = ObjectRef.safeParse({ kind: targetKind, id: targetId });
        if (!ref.success) die(`invalid --target-kind "${targetKind}"`, 2);
        // fail-closed: a targeted signal must point at an object that actually exists
        const STORE_KINDS = { hypothesis: 'hypothesis', plan: 'plan', claim: 'claim', question: 'question', evidence_relation: 'evidence_relation' } as const;
        const kind = STORE_KINDS[ref.data.kind as keyof typeof STORE_KINDS];
        if (kind !== undefined && app.store.getObject(kind, ref.data.id) === null) die(`${ref.data.kind} not found: ${ref.data.id}`, 2);
        target = ref.data;
      }
      const signal = FeedbackSignal.parse({
        id: newId('fbk'), runId: rid, source: parsedSource.data, content,
        ...(target ? { target } : {}),
        provenance: `cli:far research feedback (source=${parsedSource.data}, recorded at terminal)`,
        receivedAt: new Date().toISOString(),
      });
      app.store.putObject('feedback', signal);
      app.store.appendEvent(rid, { type: 'feedback_received', detail: { feedbackId: signal.id, source: signal.source, via: 'cli' } });
      if (json()) jsonOutput({ recorded: true, feedbackId: signal.id, runId: rid, source: signal.source, receivedAt: signal.receivedAt });
      else out(`${marker()} ${ink.ok('feedback recorded')} ${signal.id} on run ${rid} (source=${parsedSource.data}); awaiting causal revision`);
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
