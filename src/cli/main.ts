#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { createApp, type AppOptions } from '../app/composition.js';
import { verifyBundle } from '../app/verify.js';
import { readFile } from 'node:fs/promises';
import { ingestSdm, ingestTextToSdm, ingestBytes, ingestSvgPlot, persistDatasetProfile, type TextIngestResult, type BytesIngestResult } from '../ingest/service.js';
import { FeedbackSignal, FeedbackSourceKind, ObjectRef, ResearchQuestion, ScientificGoalType, newId, runProgress } from '../domain/index.js';
import type { ResearchRun } from '../domain/index.js';
import { STAGE_ORDER } from '../domain/run.js';
import { completionScript } from './completion.js';
import { HELP } from './help.js';
import { staleDistFiles } from './dist-freshness.js';
import { runGc } from './gc.js';
import { ink, log, marker, out, table, padColumns } from './term.js';
import { isActiveStatus, statusInk, watchLines } from './watch.js';
import { analyzeTrajectory } from '../app/supervisor.js';
import { buildLineageGraph } from '../app/lineage.js';
import { runTruthProfile, truthDisclosureLine } from '../app/truth-profile.js';
import { runCounterSearch, CounterSearchError } from '../server/counter-search.js';

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


function die(msg: string, code = 1, hint?: string): never {
  // Three-part error contract (NN/g + craft-spec §9): what happened, why it
  // matters here, and the single next action — on stderr so stdout stays clean.
  process.stderr.write(`${ink.err('far')} ${msg}\n`);
  if (hint !== undefined) process.stderr.write(`  ${ink.muted(`→ ${hint}`)}\n`);
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
const COMMAND_WORDS = new Set(['research', 'start', 'status', 'inspect', 'cancel', 'resume', 'export', 'feedback', 'runs', 'probe', 'data', 'info', 'agent', 'refine', '--live', '--evidence', '--hypotheses', '--plan', '--sources', '--source', '--content', '--target-kind', '--target-id']);

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
  const rid = raw ?? die(`${sub} requires a run id`, 2, `find one with: far runs`);
  if (!RUN_ID_RE.test(rid)) die(`invalid run id format: ${rid} (expected run_<26-char id>)`, 2, `copy the id from: far runs`);
  return rid;
};

const STAGE_STATE_INK: Record<string, (s: string) => string> = {
  done: ink.ok, failed: ink.err, running: ink.info, skipped: ink.muted, pending: ink.muted,
};

/**
 * Epistemic stage glyphs — the SAME four-signature the web workbench renders
 * (verified ✓ / refuted ✗ / weakened ▲ / not assessed —). One product, one
 * visual language across surfaces; plain ASCII under non-UTF8 terminals.
 */
const UNICODE_OK = (() => {
  // Node sets isTTY to true or leaves it undefined (never false) — the probe
  // must be === true so piped/redirected output falls back to ASCII glyphs.
  try { return new TextEncoder().encode('✓').length === 3 && process.stdout.isTTY === true; }
  catch { return false; }
})();
const STAGE_GLYPH: Record<string, string> = UNICODE_OK
  ? { done: '✓', failed: '✗', running: '●', skipped: '▲', pending: '—' }
  : { done: '+', failed: 'x', running: '>', skipped: '^', pending: '-' };

/**
 * Shared creation+execution path for `research start` and `far new` (B11): both must
 * behave identically after the question/domain/goal are known.
 */
const startRun = async (question: string, goalType: string, domain: string, route?: string): Promise<void> => {
  assertDistFresh();
  // --route offline|zai|dashscope|deepseek|universal: explicit model-route
  // control (R4-P1). 'offline' pins the deterministic offline dev wire — the
  // demo and acceptance path that needs no keys or network; live names resolve
  // through the registry. Absent -> product-layer default (UI route > env chain).
  const routeOpts: AppOptions = {};
  /** Narrowed after the registry lookup below: route is a valid registry name. */
  let routeOverride: 'zai' | 'dashscope' | 'deepseek' | 'universal' | 'offline' | undefined;
  if (route !== undefined) {
    if (route === 'offline') {
      routeOverride = 'offline';
      const { createOfflineDevProvider } = await import('../providers/offline.js');
      routeOpts.providerOverride = createOfflineDevProvider({
        id: 'mcfg_cli_offline', label: '离线开发路由 (CLI --route offline)',
        createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T00:00:00.000Z',
        wire: 'offline', baseUrl: 'https://offline.farlab.invalid/v1',
        modelId: 'farlab-offline-deterministic', apiKey: '', fallbackConfigIds: [],
      });
    } else {
      const { getProvider } = await import('../providers/index.js');
      const prov = getProvider(route);
      if (prov === undefined) die(`--route: unknown route "${route}" (offline | zai | dashscope | deepseek | universal)`, 2);
      routeOpts.providerOverride = prov;
      // getProvider(route) returned a provider above — the string is a registry name.
      routeOverride = route as 'zai' | 'dashscope' | 'deepseek' | 'universal';
    }
  }
  const app = await createApp(routeOpts);
  try {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: question, background: '', goalType,
      scope: { domain, phenomena: [question] },
      constraints: {}, createdAt: new Date().toISOString(),
    });
    // Pin the route ON THE RUN (routeOverride): resume executes in a new process
    // where routeOpts.providerOverride does not exist — without the persisted
    // field a --route zai run would silently fall to the workspace default on
    // resume (live-observed 2026-08-28: dead deepseek 402 default).
    const run = app.store.createRun(q, routeOverride !== undefined ? { routeOverride } : {});
    if (json()) jsonOutput({ runId: run.id, status: run.status });
    else out(`${marker()} ${ink.ok('created')} run ${ink.bold(run.id)} — executing pipeline (progress on stderr)`);
    const done = await app.orchestrator.execute(run.id);
    printRun(done);
    process.exitCode = done.status === 'completed' ? 0 : 1;
  } finally { app.close(); }
};

/**
 * B11 `far new` wizard prompts (TTY-only). Returns null when input ends before all
 * answers are given (EOF/Ctrl-D) — the caller converts that into a usage hint.
 */
const promptForRunSpec = async (): Promise<{ question: string; domain: string; goalType: string } | null> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // EOF closes the interface; a pending question() would otherwise hang forever.
  const closed = new Promise<never>((_, reject) => {
    rl.once('close', () => reject(new Error('__stdin_closed__')));
  });
  closed.catch(() => { /* observed only via Promise.race in ask(); pre-attach so it can never be unhandled */ });
  const ask = (query: string): Promise<string> => Promise.race([rl.question(query), closed]);
  const GOALS = ScientificGoalType.options.join('|');
  const VALID_GOALS = ScientificGoalType.options as readonly string[];
  try {
    let question = (await ask('研究问题（必填，一句话科学问题）: ')).trim();
    while (question.length === 0) question = (await ask(ink.warn('研究问题不能为空。研究问题（必填）: '))).trim();
    const domainRaw = (await ask('领域（回车=不限）: ')).trim();
    let goalRaw = (await ask(`目标类型（回车=explanatory；可选：${GOALS}）: `)).trim();
    while (goalRaw.length > 0 && !VALID_GOALS.includes(goalRaw)) {
      goalRaw = (await ask(ink.warn(`无效目标类型 "${goalRaw}"。可选：${GOALS}（回车=explanatory）: `))).trim();
    }
    return {
      question,
      domain: domainRaw.length === 0 ? 'unspecified' : domainRaw,
      goalType: goalRaw.length === 0 ? 'explanatory' : goalRaw,
    };
  } catch (e) {
    if (e instanceof Error && e.message === '__stdin_closed__') return null; // input ended mid-wizard
    throw e; // anything unexpected stays visible (fatal handler prints it)
  } finally {
    rl.close();
  }
};

const WATCH_TICK_MS = 2_000;

/**
 * B11 `research status --watch`: poll the real store and repaint in place until the run
 * reaches a final state. Stage counts and real events only — no invented percentages.
 */
const watchRun = async (rid: string): Promise<void> => {
  const app = await createApp();
  // Default SIGINT terminates without running the finally below; exit cleanly instead
  // (130 = 128 + SIGINT convention) after closing the db handle.
  const onSigint = (): void => { app.close(); process.exit(130); };
  process.on('SIGINT', onSigint);
  process.stdout.write('\u001b[?25l'); // hide cursor while repainting
  let painted = 0;
  try {
    for (;;) {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${rid}`);
      const lease = app.store.getRunLease(rid);
      const live = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
      const last = app.store.listEvents(rid).at(-1) ?? null;
      const lines = watchLines({
        run, lease, leaseLive: live,
        lastEvent: last === null ? null : { at: last.at, type: last.type, stage: last.stage },
        now: new Date().toISOString(),
      });
      if (painted > 0) { // move up over the previous frame, clear each line, redraw
        process.stdout.write(`\u001b[${painted}A`);
        for (let i = 0; i < painted; i += 1) process.stdout.write('\u001b[2K\u001b[1B');
        process.stdout.write(`\u001b[${painted}A`);
      }
      for (const line of lines) process.stdout.write(`${line}\n`);
      painted = lines.length;
      if (!isActiveStatus(run.status)) return; // final state: leave the last frame on screen
      await new Promise<void>((resolve) => setTimeout(resolve, WATCH_TICK_MS));
    }
  } finally {
    process.stdout.write('\u001b[?25h'); // restore cursor
    process.off('SIGINT', onSigint);
    app.close();
  }
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
      const glyph = STAGE_GLYPH[s.state] ?? '·';
      const note = s.state === 'running' ? ` (attempt ${s.attempt})` : '';
      out(`    ${tone(`${glyph} ${padColumns(s.state, 8)}`)} ${s.stage}${note}${s.error ? ` — ${ink.err(s.error)}` : ''}`);
    }
  }
};

const main = async (): Promise<void> => {
  // .env hydration (dotenv semantics: real env wins; missing file no-op) — before any
  // command dispatch so every process.env consumer sees the credential surface the
  // docs promise. Key names/values are never printed. FAR_DOTENV=off disables
  // (hermetic test vacuums / deliberate keyless runs).
  if (process.env.FAR_DOTENV !== 'off') {
    const { hydrateEnvFromDotEnv } = await import('../platform/dotenv.js');
    hydrateEnvFromDotEnv(process.env, path.resolve(process.cwd(), '.env'));
  }
  // Network plane (proxy/CA) is BOOT-time-only in Node's fetch — if the
  // hydrated env carries FARLAB_HTTP(S)_PROXY / FARLAB_CA_CERT that this
  // process was not started with, re-exec once with the Node-native env set.
  // `far probe net` is exempt (it reports on the CURRENT process honestly).
  if (process.argv[3] !== 'net') {
    const { ensureNetworkEnvAtBoot } = await import('../shared/net-env.js');
    if (ensureNetworkEnvAtBoot()) return;
  }
  const [, , cmd, sub] = process.argv;
  if (!cmd || flag('--help') || flag('-h') || cmd === 'help') { console.log(HELP); return; }

  if (cmd === 'serve') {
    // Headless/SSH entry (R2-03): a thin RUN-SURFACE wrapper over the canonical
    // server modules (src/server/main.ts semantics: PORT/HOST env, graceful
    // SIGINT/SIGTERM, automations on unless disabled). No second server —
    // createApiServer is the one and only HTTP owner.
    const portArg = arg('--port');
    let port = 8787;
    if (portArg !== undefined) {
      port = Number.parseInt(portArg, 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) die(`invalid --port "${portArg}" (must be an integer 0-65535; 0 = ephemeral)`, 2);
    }
    const host = arg('--host') ?? process.env.HOST ?? '127.0.0.1';
    const automationsOff = arg('--automations') === 'off';
    const { createApiServer } = await import('../server/api.js');
    const serveApp = await createApp(
      arg('--data-dir') !== undefined ? { dataDir: arg('--data-dir') } : process.env.FARLAB_DATA_DIR !== undefined ? { dataDir: process.env.FARLAB_DATA_DIR } : {},
    );
    const api = createApiServer(serveApp, {
      port,
      host,
      automations: { enabled: !automationsOff && process.env.FARLAB_AUTOMATIONS !== 'off' },
    });
    try {
      const actualPort = await api.start();
      out(`far serve listening on http://${host}:${actualPort} (api base: /api/v1, data: ${serveApp.dataDir})`);
    } catch (e) {
      process.stderr.write(`far serve: failed to listen on ${host}:${port}: ${e instanceof Error ? e.message : String(e)}\n`);
      serveApp.close();
      process.exitCode = 1;
      return;
    }
    let shuttingDown = false;
    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      log(`far serve: ${signal} received — closing server and database`);
      void api.stop().then(() => {
        serveApp.close();
        process.exit(0);
      });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    return; // the http server keeps the event loop alive
  }

  if (cmd === 'experiment') {
    // EEL surface (D-081/P3): scheduler as a user-operable command. Own module so this
    // router stays a one-line hook.
    const { experimentCommand } = await import('./experiment.js');
    const args = process.argv.slice(4).filter((x) => !x.startsWith('--') && x !== sub);
    const result = await experimentCommand(sub, {
      dataDir: arg('--data-dir') ?? '.far-run',
      positional: args[0],
      flag,
      arg,
    });
    if (json() && result.json !== undefined) jsonOutput(result.json);
    else if (result.text !== undefined) out(result.text);
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }

  if (cmd === 'protocol') {
    // Paradigm-honest execution ledger (slice 3): the human-attested protocol
    // surface (show/record). Own module so this router stays a one-line hook.
    const { protocolCommand } = await import('./protocol.js');
    const args = process.argv.slice(4).filter((x) => !x.startsWith('--') && x !== sub);
    const result = await protocolCommand(sub, {
      dataDir: arg('--data-dir') ?? '.far-run',
      positional: args[0],
      flag,
      arg,
    });
    if (json() && result.json !== undefined) jsonOutput(result.json);
    else if (result.text !== undefined) out(result.text);
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }

  if (cmd === 'campaign') {
    // RU-8 campaign surface: preregistered multi-experiment decision campaigns.
    const { campaignCommand } = await import('./campaign.js');
    const args = process.argv.slice(4).filter((x) => !x.startsWith('--') && x !== sub);
    const result = await campaignCommand(sub, {
      dataDir: arg('--data-dir') ?? '.far-run',
      positional: args[0],
      flag, arg,
    });
    if (json() && result.json !== undefined) jsonOutput(result.json);
    else if (result.text !== undefined) out(result.text);
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }

    if (cmd === 'agent') {
    // Agent-harness surface (H1): refinement capability. Own module so this router
    // stays a one-line hook.
    const { agentCommand } = await import('./agent.js');
    const args = process.argv.slice(4).filter((x) => !x.startsWith('--') && x !== sub);
    const result = await agentCommand(sub, {
      dataDir: arg('--data-dir') ?? '.far-run',
      positional: args[0],
      flag,
      arg,
    });
    if (json() && result.json !== undefined) jsonOutput(result.json);
    else if (result.text !== undefined) out(result.text);
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }

  if (cmd === 'completion') {
    // B11: static completion script from the real command tree — print to stdout so
    // users pipe it into their profile (`far completion bash >> ~/.bashrc`).
    const shell = positional(3);
    if (!shell) die('completion requires a shell: far completion <bash|zsh|pwsh>', 2);
    try {
      out(completionScript(shell));
    } catch (e) {
      die(e instanceof Error ? e.message : String(e), 2);
    }
    return;
  }

  if (cmd === 'new') {
    // B11: interactive wizard — TTY-only; the creation+execution path is IDENTICAL to
    // `research start` (shared startRun helper). Non-interactive users get a pointer.
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      die('far new is an interactive wizard and needs a terminal — non-interactive use: far research start "<question>" [--domain <d>] [--goal <type>]', 2);
    }
    const stray = positional(3);
    if (stray !== undefined) die(`far new takes no arguments (got "${stray}") — it is an interactive wizard`, 2);
    const spec = await promptForRunSpec();
    if (spec === null) die('interactive input ended before the wizard completed — non-interactive use: far research start "<question>"', 2);
    await startRun(spec.question, spec.goalType, spec.domain);
    return;
  }

  if (cmd === 'runs') {
    const app = await createApp();
    const runs = app.store.listRuns();
    if (json()) jsonOutput(runs);
    else if (runs.length === 0) out(ink.muted('(no runs yet — create one: far research start "<question>")'));
    else table(
      ['run', 'status', 'stage', 'question', 'created'],
      runs.map((r) => [r.id, statusInk(r.status)(r.status), r.currentStage, (r.questionText ?? '').slice(0, 46), r.createdAt]),
    );
    app.close();
    return;
  }

  if (cmd === 'probe' && process.argv[3] === 'net') {
    // Network plane (extensibility lane): honest proxy/CA status + a REAL
    // loopback self-test (local TLS server + local CONNECT proxy; a child
    // process started with the researcher's env fetches through the tunnel).
    // Never contacts external networks.
    const { probeNetwork } = await import('../shared/net-env.js');
    const r = await probeNetwork();
    if (json()) {
      out(JSON.stringify(r, null, 2));
    } else {
      out(`${marker()} network plane probe`);
      out(`  proxy configured : ${r.proxyConfigured ? 'yes' : 'no'}`);
      if (r.proxyConfigured) {
        out(`  https proxy      : ${r.proxy.https ?? '(none)'}`);
        out(`  http proxy       : ${r.proxy.http ?? '(none)'}`);
        out(`  no-proxy         : ${r.proxy.noProxy ?? '(default)'}`);
        out(`  engaged at boot  : ${r.envProxyEngaged ? 'yes' : 'no — this process was started without the env; long-running entrypoints re-exec once to apply it'}`);
      }
      out(`  custom CA        : ${r.caConfigured ? r.caFile! : 'no'}`);
      if (r.caValid !== undefined) out(`  CA valid         : ${r.caValid.ok ? 'yes' : `NO — ${r.caValid.reason}`}`);
      out(`  self-test        : ${r.selfTest.ok ? ink.ok('PASS') : ink.err('FAIL')} — ${r.selfTest.detail}`);
      for (const n of r.notes) out(`  note             : ${n}`);
    }
    process.exitCode = r.selfTest.ok || (!r.proxyConfigured && r.caConfigured && r.caValid?.ok === true) ? 0 : 1;
    return;
  }

  if (cmd === 'mcp') {
    // MCP integrations from the CLI (extensibility lane): add (disabled, review-first),
    // list, enable/disable, probe (REAL initialize + tools/list round trip, persisted
    // as lastTest). Same store and same McpManager the server/settings use.
    const subCmd = process.argv[3];
    const app = await createApp();
    try {
      const integrations = app.store.listObjects('tool_integration', '__none__').filter((i) => i.kind === 'mcp_server');
      const { ToolIntegrationSchema, integrationSemanticIssues, newId } = await import('../domain/index.js');
      if (subCmd === 'list') {
        if (integrations.length === 0) { out(ink.muted('(no MCP servers — add one: far mcp add <label> --command <cmd>)')); return; }
        if (json()) jsonOutput(integrations.map(({ enabled: en, id, label: l, transport, riskClass, lastTest }) => ({ id, label: l, enabled: en, transport, riskClass, lastTest })));
        else table(
          ['id', 'label', 'enabled', 'transport', 'risk', 'last test'],
          integrations.map((i) => [
            i.id, i.label, i.enabled ? 'yes' : 'no', i.transport, i.riskClass,
            i.lastTest === undefined ? ink.muted('never') : `${i.lastTest.ok ? ink.ok('ok') : ink.err('fail')} ${i.lastTest.summary.slice(0, 46)}`,
          ]),
        );
        return;
      }
      if (subCmd === 'add') {
        const label = positional(4);
        if (label === undefined) die('usage: far mcp add <label> --command <cmd> [--args a,b,c] [--env K=V,…] | --url <https://…> [--risk read|edit|execute|destructive] [--prefix <p>] [--timeout-ms <n>]', 2);
        const command = arg('--command');
        const url = arg('--url');
        const argsRaw = arg('--args');
        const envRaw = arg('--env');
        const risk = (arg('--risk') ?? 'execute') as 'read' | 'edit' | 'execute' | 'destructive';
        if (command === undefined && url === undefined) die('provide --command <cmd> (stdio) or --url <https://…> (streamable-http)', 2);
        const draft = {
          kind: 'mcp_server' as const, label, enabled: false,
          ...(command !== undefined
            ? { transport: 'stdio' as const, command, args: argsRaw !== undefined ? argsRaw.split(',').map((a) => a.trim()).filter((a) => a.length > 0) : [] }
            : { transport: 'http' as const, url: url! }),
          env: envRaw !== undefined
            ? Object.fromEntries(
                envRaw.split(',')
                  .map((kv): [string, string] => { const i = kv.indexOf('='); return i < 0 ? [kv.trim(), ''] : [kv.slice(0, i).trim(), kv.slice(i + 1)]; })
                  .filter(([k]) => k.length > 0),
              )
            : {},
          headers: {},
          ...(arg('--prefix') !== undefined ? { toolNamePrefix: arg('--prefix')! } : {}),
          riskClass: risk,
          ...(arg('--timeout-ms') !== undefined ? { timeoutMs: Number(arg('--timeout-ms')) } : {}),
        };
        const parsed = ToolIntegrationSchema.safeParse({ ...draft, id: newId('tint'), createdBy: 'researcher', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (!parsed.success) die(`invalid MCP integration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ')}`, 2);
        const semantic = integrationSemanticIssues(parsed.data);
        if (semantic.length > 0) die(`invalid MCP integration: ${semantic.join('; ')}`, 2);
        app.store.putObject('tool_integration', parsed.data);
        out(`${marker()} staged MCP server '${label}' (${parsed.data.id}) ${ink.muted('— disabled by default; review then: far mcp enable ' + parsed.data.id)}`);
        return;
      }
      if (subCmd === 'enable' || subCmd === 'disable') {
        const idOrLabel = positional(4);
        if (idOrLabel === undefined) die(`usage: far mcp ${subCmd} <id|label>`, 2);
        const target = integrations.find((i) => i.id === idOrLabel || i.label === idOrLabel);
        if (target === undefined) die(`MCP server not found: ${idOrLabel}`, 2);
        const updated = ToolIntegrationSchema.parse({ ...target, enabled: subCmd === 'enable', updatedAt: new Date().toISOString() });
        app.store.putObject('tool_integration', updated);
        out(`${marker()} ${subCmd === 'enable' ? 'enabled' : 'disabled'} MCP server '${updated.label}'`);
        return;
      }
      if (subCmd === 'probe') {
        const idOrLabel = positional(4);
        if (idOrLabel === undefined) die('usage: far mcp probe <id|label>', 2);
        const target = integrations.find((i) => i.id === idOrLabel || i.label === idOrLabel);
        if (target === undefined) die(`MCP server not found: ${idOrLabel}`, 2);
        log(`probing '${target.label}' — real initialize + tools/list round trip …`);
        const { McpManager } = await import('../agent/mcp-manager.js');
        const manager = new McpManager({ listServers: () => [target] });
        try {
          const record = await manager.testIntegration(target);
          app.store.putObject('tool_integration', ToolIntegrationSchema.parse({ ...target, lastTest: record, updatedAt: new Date().toISOString() }));
          if (json()) jsonOutput(record);
          else out(`${record.ok ? ink.ok('PASS') : ink.err('FAIL')} ${record.summary}`);
          process.exitCode = record.ok ? 0 : 1;
        } finally {
          await manager.close();
        }
        return;
      }
      die(`usage: far mcp <list|add|enable|disable|probe> [args]`, 2);
    } finally {
      app.close();
    }
  }

  if (cmd === 'plugin') {
    // Plugin CLI (extensibility lane): local-directory import (same expansion the
    // settings UI uses — everything lands DISABLED for review) + list.
    const subCmd = process.argv[3];
    const app = await createApp();
    try {
      if (subCmd === 'install') {
        const dir = positional(4);
        if (dir === undefined) die('usage: far plugin install <dir>  (a local directory holding far-plugin.json)', 2);
        const { importPlugin, PluginImportError } = await import('../plugins/import.js');
        let staged;
        try {
          staged = importPlugin({ dir, reviewed: true });
        } catch (e) {
          if (e instanceof PluginImportError) die(`plugin import failed: ${e.message}`, 2);
          throw e;
        }
        for (const integration of staged.integrations) app.store.putObject('tool_integration', integration);
        out(`${marker()} staged plugin ${staged.manifest.name}@${staged.manifest.version}: ${staged.integrations.length} integration(s), all DISABLED`);
        for (const w of staged.warnings) log(`  warning: ${w}`);
        out(ink.muted('  review in 设置→工具 (or far mcp list / enable), then enable.'));
        return;
      }
      if (subCmd === 'list') {
        const all = app.store.listObjects('tool_integration', '__none__');
        const fromPlugins = all.filter((i) => i.createdBy === 'plugin_import');
        if (fromPlugins.length === 0) { out(ink.muted('(no plugin-imported integrations — install one: far plugin install <dir>)')); return; }
        if (json()) jsonOutput(fromPlugins);
        else table(
          ['id', 'label', 'kind', 'enabled', 'plugin'],
          fromPlugins.map((i) => [i.id, i.label, i.kind, i.enabled ? 'yes' : 'no', i.provenance?.pluginId ?? '—']),
        );
        return;
      }
      die('usage: far plugin <install|list> [args]', 2);
    } finally {
      app.close();
    }
  }

  if (cmd === 'probe') {
    // Route health (D-060 phase-3). Config mode never touches the network; --live makes
    // ONE minimal chat call per route (explicit user action — no ambient probing).
    const { listProviders } = await import('../providers/index.js');
    const { createZaiProvider } = await import('../providers/zai.js');
    const { createDashScopeProvider } = await import('../providers/dashscope.js');
    const wanted = positional(3);
    const all = listProviders().filter((p) => wanted === undefined || p.name === wanted);
    if (all.length === 0) die(`unknown provider: ${wanted}`, 2);
    // Env candidates per provider — must mirror the adapter's REAL resolution chain
    // (zai.ts reads ZAI_API_KEY then legacy ZHIPU_API_KEY), not a display string.
    const ENV_CANDIDATES: Record<string, string[]> = {
      zai: ['ZAI_API_KEY', 'ZHIPU_API_KEY'],
      dashscope: ['DASHSCOPE_API_KEY'],
    };
    const results: Array<Record<string, unknown>> = [];
    for (const p of all) {
      const entry: Record<string, unknown> = {
        provider: p.name, kind: p.kind, model: p.modelId, baseUrl: p.baseUrl, apiKeyEnvVar: p.apiKeyEnvVar,
      };
      const candidates = ENV_CANDIDATES[p.name] ?? [];
      const key = candidates.map((n) => process.env[n] ?? '').find((v) => v.length > 0) ?? '';
      if (p.kind !== 'live') {
        entry.status = 'test-only';
      } else if (key.length === 0) {
        entry.status = 'missing-key';
      } else if (!flag('--live')) {
        entry.status = 'key-present';
      } else {
        // --live goes through the provider's own structuredCall so the probe hits the
        // SAME wire the pipeline uses (anthropic vs openai) — a hand-rolled OpenAI-style
        // fetch against an anthropic-wire baseUrl would always 404 and lie about health.
        try {
          const provider = p.name === 'dashscope' ? createDashScopeProvider({ apiKey: key }) : createZaiProvider({ apiKey: key });
          const result = await provider.structuredCall(
            {
              task: 'model route connectivity probe',
              userPayload: { instruction: 'Reply with exactly the JSON object {"ok":true} and nothing else.' },
              outputKind: 'json',
              maxTokens: 16,
              purpose: 'cli-probe-live',
            },
            (raw: unknown) => raw,
          );
          if (result.ok) {
            entry.status = 'ready';
            entry.latencyMs = result.receipt?.latencyMs;
          } else {
            entry.status = result.error?.kind === 'rate_limited' || result.error?.kind === 'quota_exceeded' ? 'blocked' : 'unreachable';
            entry.detail = JSON.stringify(result.error ?? {}).slice(0, 200); // honest cause, key never echoed
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

  if (cmd === 'probe-custom') {
    // B12-G1 CLI half: probe user-defined model-config routes (mcfg_*), which
    // `far probe` deliberately does not cover. Reads the same store the server's
    // testModelConfig uses; --live reuses createCustomProvider so the wire matches
    // the pipeline exactly. Config mode reports key presence only — never values.
    const { maskApiKey } = await import('../domain/index.js');
    const { createApp } = await import('../app/composition.js');
    const app = await createApp();
    try {
      // model_config objects are workspace-scoped (run_id='__none__' sentinel) — same convention as the server.
      const configs = app.store.listObjects('model_config', '__none__');
      const activeId = app.store.getMeta('activeModelConfigId');
      const wanted = positional(3);
      const selected = wanted === undefined ? configs : configs.filter((c) => c.id === wanted);
      if (wanted !== undefined && selected.length === 0) die(`model config not found: ${wanted}`, 2);
      const results: Array<Record<string, unknown>> = [];
      for (const cfg of selected) {
        const entry: Record<string, unknown> = {
          provider: cfg.id,
          label: cfg.label,
          kind: 'custom',
          model: cfg.modelId,
          baseUrl: cfg.baseUrl,
          wire: cfg.wire,
          apiKeyMasked: maskApiKey(cfg.apiKey),
          active: activeId === cfg.id,
        };
        if (cfg.apiKey.length === 0) {
          entry.status = 'missing-key';
        } else if (!flag('--live')) {
          entry.status = 'key-present';
        } else {
          try {
            const { createCustomProvider } = await import('../providers/custom.js');
            const provider = createCustomProvider(cfg);
            const result = await provider.structuredCall(
              {
                task: 'model route connectivity probe',
                userPayload: { instruction: 'Reply with exactly the JSON object {"ok":true} and nothing else.' },
                outputKind: 'json',
                maxTokens: 16,
                purpose: 'cli-probe-custom-live',
              },
              (raw: unknown) => raw,
            );
            if (result.ok) {
              entry.status = 'ready';
              entry.latencyMs = result.receipt?.latencyMs;
            } else {
              entry.status = result.error?.kind === 'rate_limited' || result.error?.kind === 'quota_exceeded' ? 'blocked' : 'unreachable';
              entry.detail = JSON.stringify(result.error ?? {}).slice(0, 200);
            }
          } catch (e) {
            entry.status = 'unreachable';
            entry.detail = e instanceof Error ? e.message : String(e);
          }
        }
        results.push(entry);
      }
      if (configs.length === 0 && wanted === undefined) {
        out(ink.muted('(no custom model configs — create one in the web workbench Settings or via POST /api/v1/model-configs)'));
      }
      if (json()) jsonOutput(results);
      else for (const r of results) {
        const tone = r.status === 'ready' ? ink.ok : r.status === 'key-present' ? ink.info : ink.err;
        out(`${padColumns(String(r.provider), 24)} ${tone(padColumns(String(r.status), 12))} model=${String(r.model)}${r.active ? ink.info(' [active]') : ''}${r.latencyMs !== undefined ? `  ${String(r.latencyMs)}ms` : ''}${r.detail !== undefined ? `\n  ${ink.muted(String(r.detail))}` : ''}`);
      }
      const bad = results.filter((r) => r.status === 'missing-key' || r.status === 'blocked' || r.status === 'unreachable');
      if (bad.length > 0) process.exitCode = 1;
    } finally { app.close(); }
    return;
  }

  if (cmd === 'data' && sub === 'obs') {
    // Reliability observability snapshot (workstream 2026-08-24): one sample of
    // process/storage state + per-run recovery phases + workspace error profile.
    const path = await import('node:path');
    const { sampleProcess, sampleStorage, errorProfileForRun, formatCorrelation } = await import('../app/observability.js');
    const { recoveryStateForRun } = await import('../app/recovery-state.js');
    const dataDir = path.resolve(process.env.FARLAB_DATA_DIR ?? '.far-run');
    const app = await createApp({ dataDir });
    try {
      const proc = sampleProcess();
      const storage = sampleStorage(app.store, dataDir);
      const runs = app.store.listRuns(50);
      const phases: Record<string, string[]> = {};
      const errorProfile: Record<string, number> = {};
      for (const r of runs) {
        const doc = app.store.getRun(r.id);
        if (doc === null) continue;
        const state = recoveryStateForRun(app.store, doc);
        (phases[state.phase] ??= []).push(r.id);
        for (const [cat, n] of Object.entries(errorProfileForRun(app.store, r.id))) {
          errorProfile[cat] = (errorProfile[cat] ?? 0) + n;
        }
      }
      if (json()) jsonOutput({ process: proc, storage, phases, errorProfile });
      else {
        console.log(`process: pid=${proc.pid} up=${(proc.uptimeMs / 1000).toFixed(1)}s rss=${proc.rssMb}MB heap=${proc.heapUsedMb}/${proc.heapTotalMb}MB handles=${proc.activeHandles}`);
        console.log(`storage: db=${storage.dbBytes}B wal=${storage.walBytes}B artifacts=${storage.artifactBlobs} blobs (${storage.artifactsBytes}B)${storage.orphanTemps > 0 ? ` +${storage.orphanTemps} ORPHAN TEMPS (far gc --apply sweeps)` : ''}`);
        console.log(`state: runs=${storage.runs} events=${storage.events} objects=${storage.objects} receipts=${storage.receipts}`);
        for (const [phase, ids] of Object.entries(phases)) {
          const shown = ids.slice(0, 3).join(', ');
          console.log(`  ${phase}: ${ids.length}${ids.length > 0 ? ` (${shown}${ids.length > 3 ? ' …' : ''})` : ''}`);
        }
        if (Object.keys(errorProfile).length > 0) console.log(`errors: ${Object.entries(errorProfile).map(([c, n]) => `${c}=${n}`).join(' ')}`);
        console.log(`correlation format: ${formatCorrelation({ runId: 'run_x', stage: 'rank', stageAttempt: 1 })}`);
      }
    } finally { app.close(); }
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
  if (cmd === 'ingest') {
    // MULTIMODAL (2026-08-24): deterministic scientific-artifact understanding.
    // Text-family files parse into an SDM (or dataset profile); xlsx supplements
    // profile through the binary router; PDFs are refused honestly (text-layer
    // collection is a web-client pdfjs capability, not a zod-only core one).
    const target = process.argv[3];
    if (target === undefined) die('usage: far ingest <file.(md|tex|csv|tsv|json|xlsx|docx|pptx|epub|html|svg|txt|log|ipynb|py|ts|js|xml)>', 2);
    if (/\.pdf$/i.test(target)) die('far ingest: PDF text-layer collection runs in the web client (pdfjs-dist) — use the workbench upload or POST /api/v1/ingest {kind:"pdf_text"}; the zod-only core cannot collect PDF text', 2);
    const base = path.basename(target);
    // SVG plots digitize deterministically and persist a re-verifiable points
    // artifact — they need the store at parse time, so they take a dedicated path.
    if (/\.svg$/i.test(target)) {
      let svgText: string;
      try {
        svgText = await readFile(target, 'utf8');
      } catch (e) {
        die(`cannot read ${target}: ${e instanceof Error ? e.message : String(e)}`, 1);
      }
      const app = await createApp({});
      try {
        const r = await ingestSvgPlot(app.artifacts, base, svgText);
        if (!r.ok) die(`far ingest: ${r.reason}`, 2);
        const f = r.outcome.sdm.figures[0];
        const axes = f !== undefined && f.perception.axes !== undefined ? f.perception.axes.map((a) => `${a.kind}:${a.range !== undefined ? `[${a.range[0]}, ${a.range[1]}]` : '?'}${a.scale !== undefined ? ` (${a.scale})` : ''}`).join(' ') : '';
        console.log(`${base}: svg-plot-v1 — ${f !== undefined ? f.perception.status : 'unknown'}`);
        console.log(`  series=${r.points.series.length} points=${r.points.series.reduce((n, sr) => n + sr.points.length, 0)} ${axes}`);
        for (const w of r.outcome.sdm.diagnostics.warnings.slice(0, 6)) console.log(`  note: ${w}`);
        console.log(`  artifact: ${r.outcome.artifactRef}`);
        if (r.pointsRef !== undefined) console.log(`  points:   ${r.pointsRef}`);
      } finally { app.close(); }
      return;
    }
    let routed: Exclude<TextIngestResult, null> | BytesIngestResult;
    if (/\.(xlsx|xlsm|docx|pptx|epub)$/i.test(target)) {
      let bytes: Buffer;
      try {
        bytes = await readFile(target);
      } catch (e) {
        die(`cannot read ${target}: ${e instanceof Error ? e.message : String(e)}`, 1);
      }
      routed = ingestBytes(base, bytes);
    } else {
      let text: string;
      try {
        text = await readFile(target, 'utf8');
      } catch (e) {
        die(`cannot read ${target}: ${e instanceof Error ? e.message : String(e)}`, 1);
      }
      const t = ingestTextToSdm(base, text);
      routed = t === null
        ? { type: 'refused', reason: `unsupported file kind: ${base} — supported: .md .tex .csv .tsv .json .xlsx .docx .pptx .epub .html .svg .txt .log .ipynb .py .ts .js .xml (JATS/TEI)` }
        : t;
    }
    if (routed.type === 'refused') die(`far ingest: ${routed.reason}`, 2);
    const app = await createApp({});
    try {
      if (routed.type === 'dataset') {
        const artifactRef = await persistDatasetProfile(app.artifacts, routed.profile);
        console.log(`${base}: dataset profile — ${routed.profile.rowCount} rows × ${routed.profile.columnCount} cols (${routed.profile.format})`);
        console.log(`  columns: ${routed.profile.columns.map((c) => `${c.name}(${c.inferredType}${c.missingCount > 0 ? `, miss ${c.missingCount}` : ''})`).join(' ')}`);
        for (const w of routed.profile.diagnostics.warnings.slice(0, 6)) console.log(`  note: ${w}`);
        console.log(`  artifact: ${artifactRef}`);
      } else {
        const out = await ingestSdm(app.artifacts, routed.doc);
        const c = { b: out.sdm.blocks.length, f: out.sdm.figures.length, t: out.sdm.tables.length, e: out.sdm.equations.length, c: out.sdm.citations.length, x: out.sdm.xrefs.filter((x) => x.status === 'resolved').length };
        console.log(`${base}: ${out.sdm.extractor.name} — ${out.sdm.diagnostics.parseStatus}`);
        console.log(`  blocks=${c.b} figures=${c.f} tables=${c.t} equations=${c.e} citations=${c.c} xrefsResolved=${c.x}`);
        for (const w of out.sdm.diagnostics.warnings.slice(0, 6)) console.log(`  note: ${w}`);
        console.log(`  artifact: ${out.artifactRef}`);
      }
    } finally { app.close(); }
    return;
  }
  if (cmd === 'inspect') {
    // RU-12 GO-2: time-travel projection of a run AS OF an event seq (or latest).
    const runId = process.argv[3];
    if (runId === undefined || !/^run_[a-z0-9]+$/.test(runId)) die('usage: far inspect <runId> [seq]', 2);
    const seqRaw = process.argv[4];
    const app = await createApp({});
    try {
      const run = app.store.getRun(runId);
      if (run === null) die(`run not found: ${runId}`, 1);
      const events = app.store.listEvents(runId);
      const seq = seqRaw !== undefined ? Number(seqRaw) : events.length > 0 ? events[events.length - 1]!.seq : 0;
      if (!Number.isInteger(seq) || seq < 0) die('seq must be a non-negative integer', 2);
      const state = app.store.stateAtSeq(runId, seq);
      if (json()) {
        jsonOutput({ runId, seq: state.seq, stage: state.stage, questionId: state.questionId, objectIdsByKind: state.objectIdsByKind, eventCount: state.events.length });
      } else {
        console.log(`run ${runId} @seq ${state.seq} (stage: ${state.stage ?? 'n/a'}, events: ${state.events.length})`);
        for (const [kind, ids] of Object.entries(state.objectIdsByKind)) console.log(`  ${kind}: ${ids.length}`);
        const tail = state.events.slice(-5);
        for (const e of tail) console.log(`  #${e.seq} ${e.type}${e.stage !== undefined ? ` (${e.stage})` : ''}`);
      }
    } finally { app.close(); }
    return;
  }

  if (cmd === 'memory') {
    // Re-audit queue: memory search surface (the substrate had no consumer
    // outside generation). Reads only; trust labels always travel with items.
    const query = process.argv[3];
    if (query === undefined || query.trim().length === 0) die('usage: far memory <query> [--kind <k>]', 2);
    const flagIdx = process.argv.indexOf('--kind');
    const kind = flagIdx >= 0 ? process.argv[flagIdx + 1] : undefined;
    if (kind !== undefined && !/^(episodic|semantic|experiment_outcome|profile)$/.test(kind)) die(`invalid kind: ${kind}`, 2);
    const app = await createApp({});
    try {
      const hits = app.store.searchMemory({
        query,
        ...(kind !== undefined ? { kinds: [kind as 'episodic' | 'semantic' | 'experiment_outcome' | 'profile'] } : {}),
        limit: 20,
      });
      if (json()) {
        jsonOutput(hits.map((h) => ({ id: h.id, kind: h.kind, title: h.title, trustClass: h.trustClass, status: h.status })));
      } else {
        if (hits.length === 0) console.log('no memory items match');
        for (const h of hits) console.log(`[${h.kind}/${h.trustClass}] ${h.title.slice(0, 100)}`);
      }
    } finally { app.close(); }
    return;
  }

  if (cmd === 'backup') {
    // RU-7.1 production caller (re-audit fix): VACUUM INTO snapshot — the
    // WAL-copy trap (plain file copy silently loses recent WAL commits) is
    // structurally avoided. Refuses to overwrite; drill in docs/backup-restore.md.
    const path = await import('node:path');
    const args = (await import('node:util')).parseArgs({ allowPositionals: true, args: process.argv.slice(3) });
    const dataDir = path.resolve(process.env.FARLAB_DATA_DIR ?? '.far-run');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = typeof args.positionals[0] === 'string'
      ? path.resolve(String(args.positionals[0]))
      : path.join(dataDir, 'backup', `far-${stamp}.db`);
    const fs = await import('node:fs');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const app = await createApp({ dataDir });
    try {
      app.store.backupTo(dest);
    } catch (e) {
      die(e instanceof Error ? e.message : String(e), 1);
    } finally { app.close(); }
    const bytes = fs.statSync(dest).size;
    console.log(`backup written: ${dest} (${bytes} B)`);
    if (!json()) console.log('restore drill: see docs/backup-restore.md');
    return;
  }

  if (cmd === 'data') die('data requires a subcommand: info | obs', 2);

  if (cmd === 'gc') {
    const app = await createApp();
    try {
      const report = runGc(app, { apply: flag('--apply') });
      if (json()) jsonOutput(report);
      else {
        out(`artifacts: ${report.totalBlobs} blob(s), ${report.referenced} referenced`);
        if (report.unreferenced.length === 0) {
          out('gc: nothing to sweep — every blob is referenced.');
        } else {
          out(`gc: ${report.unreferenced.length} unreferenced blob(s), ${report.unreferencedBytes} B${report.apply ? ' — removed:' : ' (dry-run; pass --apply to delete):'}`);
          for (const h of report.unreferenced.slice(0, 20)) out(`  sha256:${h}`);
          if (report.unreferenced.length > 20) out(`  … +${report.unreferenced.length - 20} more`);
        }
      }
    } finally { app.close(); }
    return;
  }

  if (cmd === 'verify') {
    const bundleId = positional(3);
    // The natural mistake is passing the export file path (export prints one);
    // verify reads the store by bundle ID — redirect with the usable form.
    if (bundleId !== undefined && /[\\/]/.test(bundleId)) {
      const guess = bundleId.split(/[\\/]/).pop() ?? '';
      const cleaned = guess.replace(/\.bundle\.json$/i, '');
      die(`verify takes a bundle id, not a file path (got "${bundleId}")`, 2,
        /^bnd_[0-9a-z]+$/.test(cleaned) ? `try: far verify ${cleaned}` : 'list one with: far research export <run-id> --format bundle');
    }
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
    await startRun(question, arg('--goal') ?? 'explanatory', arg('--domain') ?? 'unspecified', arg('--route'));
    return;
  }

  const runId = positional(4);
  const NEEDS_RUN = ['status', 'inspect', 'cancel', 'resume', 'export', 'lineage', 'supervise', 'fork', 'counter-search'] as const;
  if (sub !== undefined && (NEEDS_RUN as readonly string[]).includes(sub) && !runId) {
    // Same three-part error contract as the malformed-id path: what happened,
    // plus the single next action.
    die(`${sub} requires a run id`, 2, 'find one with: far runs');
  }
  const rid: string = runIdArg(runId, sub ?? 'command');

  if (sub === 'status') {
    if (flag('--watch')) {
      // B11 live view: TTY-only repaint loop. --json consumers should poll the plain
      // snapshot form instead — a streaming JSON protocol is a different contract.
      if (process.stdout.isTTY !== true) die('--watch needs an interactive terminal (TTY) — plain `far research status <run-id>` prints one snapshot', 2);
      if (json()) die('--watch renders a live TTY view and cannot be combined with --json — poll `far research status <run-id> --json` instead', 2);
      await watchRun(rid);
      return;
    }
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      // W8 S1: real lease state — a status='running' run with no live lease is frozen
      // (recoverable via `far research resume <id>`: expired leases are reclaimable).
      const lease = app.store.getRunLease(rid);
      const live = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
      // §5.5 execution truth: deterministic receipt-derived class, visible on the
      // same surface researchers already use to judge a run.
      const truth = runTruthProfile(app.store, rid);
      if (json()) {
        // single JSON object for machine consumers (two blobs would break JSON.parse(stdout))
        const { stages, ...rest } = run;
        jsonOutput({ ...rest, progress: runProgress(run), stages, lease: { holder: lease.holder, expiresAt: lease.expiresAt, live }, truth });
      } else {
        printRun(run);
        out(`  ${ink.bold('lease')}: ${lease.holder === null ? 'none' : `${lease.holder} (expires ${lease.expiresAt})`}${run.status === 'running' && !live ? `  ${ink.warn('[FROZEN — resume to recover]')}` : ''}`);
        out(`  ${truthDisclosureLine(truth)}`);
      }
    } finally { app.close(); }
    return;
  }

  if (sub === 'counter-search') {
    // §5.2 counter-evidence loop closure: execute one researcher-directed
    // counter-evidence search into the run's corpus (live sources, receipts,
    // append-only corpus versioning). Same server capability as the API route.
    const query = arg('--query');
    if (query === undefined || query.trim().length < 4) die('counter-search requires --query "<missing counter-evidence search>" (min 4 chars)', 2);
    const app = await createApp();
    try {
      const outcome = await runCounterSearch(app, rid, { query });
      if (json()) jsonOutput(outcome);
      else {
        out(`${marker()} counter-search → ${outcome.added.length} 个新来源（重复跳过 ${outcome.duplicatesSkipped}，失败族 ${outcome.familyFailures.length}）`);
        for (const a of outcome.added) out(`  + [${a.family}] ${a.title.slice(0, 90)}`);
        out(`  ${ink.muted(outcome.note)}`);
        if (outcome.familyFailures.length > 0) for (const f of outcome.familyFailures) out(`  ${ink.err('family failed')}: ${f.family} — ${f.reason.slice(0, 120)}`);
      }
    } catch (e) {
      if (e instanceof CounterSearchError) die(e.message, e.status === 404 ? 4 : 2);
      throw e;
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

  if (sub === 'lineage' || sub === 'supervise') {
    // AVO fusion G2/G3 CLI projections: the trajectory graph and the live
    // supervisor analysis. Both read-only; --json is the stable contract.
    const app = await createApp();
    try {
      const run = app.store.getRun(rid);
      if (!run) die(`run not found: ${runId}`);
      if (sub === 'lineage') {
        const graph = buildLineageGraph({ store: app.store, rootRunId: rid });
        if (json()) jsonOutput(graph);
        else {
          out(ink.bold(`lineage of ${rid} — ${graph.nodes.length} nodes, ${graph.edges.length} edges`));
          const byKind = new Map<string, number>();
          for (const n of graph.nodes) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
          for (const [kind, count] of [...byKind.entries()].sort()) console.log(`  ${kind}: ${count}`);
          const counter = graph.edges.filter((e) => e.kind === 'counter_evidence');
          console.log(`  ${ink.warn('counter-evidence edges')}: ${counter.length}`);
          for (const e of graph.edges.filter((x) => x.kind === 'revised_into')) console.log(`  revision chain: ${e.from} -> ${e.to}`);
        }
      } else {
        const obs = analyzeTrajectory({ store: app.store, runId: rid });
        if (json()) jsonOutput(obs);
        else if (obs.signals.length === 0) out(`${ink.ok('healthy')} — no supervisor signals on this trajectory`);
        else
          for (const s of obs.signals) {
            const sev = s.severity === 'high' ? ink.err(s.severity) : s.severity === 'medium' ? ink.warn(s.severity) : s.severity;
            console.log(`${marker()} [${sev}] ${s.kind}: ${s.recommendation.rationale}`);
            console.log(`    action hint: ${s.recommendation.action}`);
          }
      }
    } finally { app.close(); }
    return;
  }

  if (sub === 'fork') {
    // RU-2 branch writer CLI surface: fork a settled run so a researcher can
    // branch the trajectory (alternative direction, what-if revision) from
    // the terminal. The API path is POST /runs/:id/fork — same store writer.
    const app = await createApp();
    try {
      if (!app.store.getRun(rid)) die(`run not found: ${runId}`);
      const reason = arg('--reason') ?? 'forked via far research fork';
      const fork = app.store.forkRun(rid, { reason });
      if (json()) jsonOutput({ run: { id: fork.id, parentRunId: fork.parentRunId, status: fork.status }, reason });
      else out(`${marker()} ${ink.ok('forked')} ${rid} -> ${fork.id}  (${ink.muted(reason)})`);
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
      // A typo'd stage name must never silently run the whole pipeline (adversarial
      // round-2): the old `as never` cast made an unmatched name a full resume.
      if (stopAfter !== undefined && !(STAGE_ORDER as readonly string[]).includes(stopAfter)) {
        die(`unknown --stop-after stage '${stopAfter}' — valid stages: ${STAGE_ORDER.join(', ')}`, 2);
      }
      if (stopAfter !== undefined) {
        // Crash guard (mirror of scopeProposal's): a stop-after run tagged 'parking:*'
        // before execution is never watchdog-adopted if this CLI dies before the park.
        const tagged = app.store.getRun(rid);
        if (tagged !== null && !tagged.tags.includes('parking:cli-stop-after')) {
          app.store.updateRun({ ...tagged, tags: [...tagged.tags, 'parking:cli-stop-after'] });
        }
      }
      const run = await app.orchestrator.execute(rid, stopAfter !== undefined ? { stopAfter: stopAfter as (typeof STAGE_ORDER)[number] } : undefined);
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
      if (format === 'package') {
        // 07→03 handoff 2026-08-25: delegate to the lane-07 engine (no reimplementation).
        // Same contract as scripts/export-manuscript.mjs: paper+report from the stored
        // bundle, deterministic figures/tables/bib, MANIFEST sha256, RO-Crate 1.1.
        const { buildReproducibilityPackage } = await import('../report/package.js');
        const formatsRaw = arg('--formats');
        try {
          const result = await buildReproducibilityPackage(
            { store: app.store, artifacts: app.artifacts }, rid,
            { outDir, ...(formatsRaw !== undefined ? { formats: formatsRaw.split(',').map((f) => f.trim()).filter(Boolean) } : {}) },
          );
          if (json()) {
            jsonOutput({ dir: result.dir, bundleId: result.bundleId, runId: result.runId, files: result.files.length, paperIncluded: result.paperIncluded, citations: result.citations, pandoc: result.pandoc });
          } else {
            out(`package written: ${result.dir} (${result.files.length} files · paper ${result.paperIncluded ? 'included' : 'absent'} · citations: ${result.citations ? `${result.citations.citedKeys.length} cited inline, ${result.citations.unresolved.length} unresolved, ${result.citations.uncited.length} uncited` : 'n/a'} · pandoc ${result.pandoc.version === null ? 'absent' : `v${result.pandoc.version}: produced [${result.pandoc.produced.join(', ')}]`})`);
        for (const u of result.pandoc.unavailable) out(ink.muted(`  pandoc unavailable: ${u.format} — ${u.reason}`));
          }
        } catch (e) {
          die(e instanceof Error ? e.message : String(e), 1, 'the export stage must run first: far research resume <id>');
        }
      } else if (format === 'bundle') {
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
