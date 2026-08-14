// src/cli/commands/research.ts
// far research start "<question>" — run the Track-1A vertical slice under the
// persistent run lifecycle (ground → generate 3-5 hypotheses → critique → score
// → plan → ResearchRun), with checkpointed progress, SIGINT cancellation, and
// `far research status/resume` for observability across process restarts.
//
// Default offline_replay profile (zero key, synthetic fixtures → RECORDED_REPLAY mode).
// Live: --profile competition_aliyun_qwen + FAR_DASHSCOPE_API_KEY (real Qwen + real retrieval).
//
// Honesty: the offline path proves the pipeline wiring (real citation binding,
// deterministic scoring, Pareto front, plan design) — NOT any scientific truth.
// The synthetic demo docs are clearly labeled [SYNTHETIC DEMO].

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLlmGateway, type LlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import { createCompetitionQwenGateway } from '../../llm_gateway/competition_gateway.ts';
import { createReplayAdapter } from '../../retrieval/index.ts';
import {
  runResearch,
  STAGE_LIFECYCLE_STATE,
  RESEARCH_STAGE_IDS,
  type ResearchGroundingOptions,
} from '../../research/orchestrator.ts';
import {
  RunStore,
  DEFAULT_RUNS_ROOT,
  executeResearchRun,
  addRunEventListener,
  cancelRun,
  type ResearchRunEvent,
  type RunCheckpoint,
} from '../../research/run_lifecycle.ts';
import { ResearchabilityBlockedError } from '../../research/researchability_gate.ts';
import { buildFeedbackSignal, compareResearchPlans } from '../../research/revision.ts';
import { applyFeedbackToRun } from '../../research/application.ts';
import { verifyResearchRunDeterministic } from '../../research/verification.ts';
import { computeRunMetrics } from '../../research/evaluation/metrics.ts';
import { runAllBaselines } from '../../research/evaluation/baseline.ts';
import { exportResearchBundle, researchBundleSha256 } from '../../research/export_bundle.ts';
import { runPlanExperiment, isLandscapeObservation } from '../../research/experiment.ts';
import { loadExoplanetReplayRows } from '../../research/adapters/exoplanet_replay.ts';
import { parseResearchRunJson, FeedbackInputZod } from '../../research/schemas.ts';
import type { ResearchRun } from '../../research/types.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../research/research_fixtures.ts';
import type { DocumentSource, RetrievalAdapter } from '../../retrieval/types.ts';

/** Parsed options for the research command. */
export interface ResearchArgs {
  readonly question: string;
  readonly sources: readonly DocumentSource[];
  readonly maxPerQuery: number;
  readonly profile: 'auto' | 'offline_replay' | 'competition_aliyun_qwen';
  readonly target: number;
  readonly json: boolean;
  readonly out: string | null;
}

const VALID_SOURCES: readonly DocumentSource[] = ['openalex', 'arxiv', 'crossref'];

/** The live model API key from the environment (undefined/empty when absent). */
export function liveApiKey(): string | undefined {
  const key = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  return key !== undefined && key !== '' ? key : undefined;
}

/** Actionable guidance printed when a live model is required but no key exists. */
export const NO_KEY_GUIDANCE = [
  'far research: no model API key found — the research loop needs a live model, and',
  'answering an arbitrary question from synthetic fixtures would be fabricated science.',
  '',
  '  get a key  : https://bailian.console.aliyun.com/  then set DASHSCOPE_API_KEY (or put it in .env)',
  '  free, now  : far ground "<your question>"                              → real literature, no key needed',
  '  wiring demo: far research start "<q>" --profile offline_replay          → synthetic fixtures (explicit opt-in)',
  '',
].join('\n');

/**
 * Resolve the `auto` profile default (2026-08-14 UX fix): live when a key
 * exists, fail closed with guidance otherwise. Explicit profiles pass through
 * (the caller enforces the key for the live one).
 */
export function resolveAutoProfile(
  profile: 'auto' | 'offline_replay' | 'competition_aliyun_qwen',
): 'offline_replay' | 'competition_aliyun_qwen' | 'missing-key' {
  if (profile === 'offline_replay') return 'offline_replay';
  if (profile === 'competition_aliyun_qwen') {
    return liveApiKey() !== undefined ? 'competition_aliyun_qwen' : 'missing-key';
  }
  return liveApiKey() !== undefined ? 'competition_aliyun_qwen' : 'missing-key';
}

/** Human label for the execution mode line printed before a run starts. */
export function modeLine(profile: 'offline_replay' | 'competition_aliyun_qwen'): string {
  return profile === 'competition_aliyun_qwen'
    ? 'mode: LIVE — real model (competition_aliyun_qwen) + real literature retrieval'
    : 'mode: OFFLINE REPLAY — synthetic fixtures: hypotheses will NOT be about your question';
}

/** Parse `far research start` args. */
export function parseResearchArgs(args: readonly string[]): ResearchArgs {
  let question = '';
  let sources: readonly DocumentSource[] = ['openalex'];
  let maxPerQuery = 5;
  let profile: 'auto' | 'offline_replay' | 'competition_aliyun_qwen' = 'auto';
  let target = 3;
  let json = false;
  let out: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--source') {
      const v = args[++i];
      const list = (v ?? '').split(/[+,]/).map((s) => s.trim()).filter((s) => s.length > 0);
      if (list.length === 0 || list.some((s) => !VALID_SOURCES.includes(s as DocumentSource))) {
        throw new Error(
          `far research: --source must be openalex|arxiv|crossref (single or comma/+ separated, got: ${v ?? '<missing>'})`,
        );
      }
      sources = [...new Set(list)] as DocumentSource[];
      continue;
    }
    if (a === '--max-per-query') {
      const v = args[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 25) {
        throw new Error(`far research: --max-per-query must be 1..25 (got: ${v ?? '<missing>'})`);
      }
      maxPerQuery = n;
      continue;
    }
    if (a === '--profile') {
      const v = args[++i];
      if (v !== 'auto' && v !== 'offline_replay' && v !== 'competition_aliyun_qwen') {
        throw new Error(`far research: --profile must be auto|offline_replay|competition_aliyun_qwen (got: ${v ?? '<missing>'})`);
      }
      profile = v;
      continue;
    }
    if (a === '--target') {
      const v = args[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 3 || n > 5) {
        throw new Error(`far research: --target must be 3..5 (got: ${v ?? '<missing>'})`);
      }
      target = n;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--out') {
      out = args[++i] ?? null;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far research: unknown argument "${a}"`);
    }
    question = question === '' ? a : `${question} ${a}`;
  }
  return { question, sources, maxPerQuery, profile, target, json, out };
}

/**
 * Resolve the run store root: `FAR_RESEARCH_RUNS_DIR` when set, otherwise the
 * default `.far/research-runs`. Read at CALL time (not module load) so tests
 * can point each process/spawn at its own store root.
 */
export function resolveRunStore(env: NodeJS.ProcessEnv = process.env): RunStore {
  const override = env.FAR_RESEARCH_RUNS_DIR;
  return new RunStore(override !== undefined && override !== '' ? override : DEFAULT_RUNS_ROOT);
}

/** Render one lifecycle event as one concise stderr line (no spinner). */
function renderLifecycleEvent(event: ResearchRunEvent): void {
  switch (event.type) {
    case 'run_started':
      return; // the "run started: …" line is printed by the caller
    case 'run_resumed':
      process.stderr.write(`resuming from stage: ${event.fromStage ?? '(start)'}\n`);
      return;
    case 'state_changed':
      process.stderr.write(`state: ${event.from} → ${event.to}\n`);
      return;
    case 'stage_started':
      process.stderr.write(`[${STAGE_LIFECYCLE_STATE[event.stageId]}] ${event.stageId} …\n`);
      return;
    case 'stage_completed':
      process.stderr.write(`[${STAGE_LIFECYCLE_STATE[event.stageId]}] ${event.stageId} … done\n`);
      return;
    case 'run_completed':
      process.stderr.write(`run completed (runMode=${event.runMode})\n`);
      return;
    case 'run_failed':
    case 'run_cancelled':
      return; // rendered from the checkpoint by the exit paths below
  }
}

/** Shared arguments for the CLI lifecycle executor (start and resume). */
interface LifecycleRunArgs {
  readonly store: RunStore;
  readonly gateway: LlmGateway;
  readonly profile: 'offline_replay' | 'competition_aliyun_qwen';
  /**
   * Start: full grounding options (sources/maxPerQuery seed the checkpoint).
   * Resume: adapter only — the checkpoint already carries sources/maxPerQuery.
   */
  readonly grounding?: ResearchGroundingOptions;
  readonly target: number;
  readonly json: boolean;
  readonly out: string | null;
  /** New run (start); mutually exclusive with runId (resume). */
  readonly question?: string;
  readonly runId?: string;
}

/**
 * Execute one research run under the lifecycle driver with CLI-grade UX:
 * immediate `run started` line, one stderr line per event, first-SIGINT
 * cancellation (second SIGINT = default kill), and exit-code mapping
 * (0 / 1 pipeline / 3 gate refused / 130 cancelled).
 */
async function executeLifecycleRun(args: LifecycleRunArgs): Promise<number> {
  const { store } = args;
  const knownBefore = new Set(store.listRunIds());
  const execution = executeResearchRun({
    ...(args.question !== undefined ? { question: args.question } : {}),
    gateway: args.gateway,
    profile: args.profile,
    ...(args.grounding !== undefined ? { grounding: args.grounding } : {}),
    targetHypothesisCount: args.target,
    ...(args.runId !== undefined ? { runId: args.runId } : {}),
    store,
  });

  // The executor persists its first checkpoint synchronously before its first
  // await, so a NEW run's id is already on disk at this point. (Stage-1
  // started/changed events fire during that same synchronous prefix — the
  // "run started" line below is their human rendering.)
  const runId =
    args.runId !== undefined ? args.runId : store.listRunIds().find((id) => !knownBefore.has(id));
  let unsubscribe: (() => void) | null = null;
  let firstSigint = true;
  const onSigint = (): void => {
    if (firstSigint) {
      firstSigint = false;
      if (runId !== undefined) cancelRun(runId);
      process.stderr.write('cancelling at the next stage boundary (second Ctrl+C kills immediately)…\n');
      return;
    }
    // Second Ctrl+C: restore the default handler and re-raise.
    process.removeListener('SIGINT', onSigint);
    process.kill(process.pid, 'SIGINT');
  };
  process.on('SIGINT', onSigint);

  try {
    // The mode line comes FIRST so the user knows what kind of science this is
    // before any progress (replay fixtures vs live model must never be mistaken).
    process.stderr.write(`${modeLine(args.profile)}\n`);
    if (runId !== undefined) {
      process.stderr.write(
        `run started: ${runId} (progress checkpoints: ${store.checkpointPath(runId)} · status: far research status ${runId})\n`,
      );
      unsubscribe = addRunEventListener(runId, renderLifecycleEvent);
    }

    const run = await execution;

    if (args.out !== null) {
      const dir = dirname(args.out);
      if (dir !== '.' && dir !== '') {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(args.out, JSON.stringify(run, null, 2) + '\n', 'utf8');
      if (!args.json) {
        process.stderr.write(`  saved    : ${args.out} (far research inspect ${args.out})\n`);
      }
    }
    // The lifecycle already persisted the frozen run + checkpoint — say where.
    if (runId !== undefined) {
      process.stderr.write(
        `  run      : ${store.runPath(runId)} (auto-persisted · status: far research status ${runId})\n`,
      );
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    } else {
      renderHuman(args.profile, run);
    }
    return 0;
  } catch (err) {
    const cp = runId !== undefined ? safeLoadCheckpoint(store, runId) : null;
    if (cp !== null && cp.state === 'CANCELLED') {
      process.stderr.write(`run cancelled — resume with: far research resume ${runId}\n`);
      return 130;
    }
    if (err instanceof ResearchabilityBlockedError) {
      process.stderr.write(
        `far research: researchability gate REFUSED this question (${err.report.verdict})\n` +
          `  reasons: ${err.report.reasons.join('; ')}\n` +
          (err.report.safetyRisks.length > 0
            ? `  safety: ${err.report.safetyRisks.join('; ')}\n`
            : '') +
          '  no research pipeline was run; nothing was fabricated.\n',
      );
      return 3;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `far research: pipeline failed (state: FAILED · checkpoint: ${runId !== undefined ? store.checkpointPath(runId) : 'n/a'})\n` +
        `  error: ${message}\n` +
        (cp !== null && cp.state === 'FAILED' && cp.errorKind !== 'gate_refused' && runId !== undefined
          ? `  resume with: far research resume ${runId}\n`
          : ''),
    );
    return 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
    if (unsubscribe !== null) unsubscribe();
  }
}

/** Load a checkpoint without throwing (corruption → null; status reports it). */
function safeLoadCheckpoint(store: RunStore, runId: string): RunCheckpoint | null {
  try {
    return store.loadCheckpoint(runId);
  } catch {
    return null;
  }
}

/** Run `far research start`. */
export async function runResearchStart(args: readonly string[]): Promise<number> {
  let parsed: ResearchArgs;
  try {
    parsed = parseResearchArgs(args);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  if (parsed.question.trim().length === 0) {
    process.stderr.write(
      'far research start: missing question.\n  usage: far research start "<question>" [--source openalex|arxiv|crossref] [--max-per-query <n>] [--profile auto|offline_replay|competition_aliyun_qwen] [--target 3..5] [--json] [--out <file>]\n',
    );
    return 2;
  }

  // Build the gateway + grounding adapter for the chosen profile. Default is
  // `auto`: live when a key exists; without a key the run FAILS CLOSED with
  // actionable guidance — replaying synthetic fixtures at an arbitrary user
  // question answers it with unrelated canned science (2026-08-14 UX finding:
  // a no-key user asked about mRNA vaccines and got hot-Jupiter hypotheses).
  // The synthetic path stays available by explicit opt-in.
  const resolved = resolveAutoProfile(parsed.profile);
  if (resolved === 'missing-key') {
    process.stderr.write(NO_KEY_GUIDANCE);
    return 2;
  }
  const profile = resolved;
  let gateway: LlmGateway;
  let retrievalAdapter: RetrievalAdapter | undefined;
  if (profile === 'competition_aliyun_qwen') {
    gateway = createCompetitionQwenGateway({ apiKey: liveApiKey()! });
    // live retrieval: no injected adapter
  } else {
    gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    retrievalAdapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
  }

  return executeLifecycleRun({
    store: resolveRunStore(),
    gateway,
    profile,
    grounding: {
      ...(parsed.sources.length > 1
        ? { sources: parsed.sources }
        : { source: parsed.sources[0] ?? 'openalex' }),
      maxPerQuery: parsed.maxPerQuery,
      ...(retrievalAdapter !== undefined ? { adapter: retrievalAdapter } : {}),
    },
    target: parsed.target,
    json: parsed.json,
    out: parsed.out,
    question: parsed.question,
  });
}

/** Render the stage progress line, e.g. `3/8 [researchability_gate ✓ grounding ✓ …]`. */
function renderStageProgress(completedStages: readonly string[]): string {
  const marks = RESEARCH_STAGE_IDS.map((stage) =>
    completedStages.includes(stage) ? `${stage} ✓` : stage,
  );
  return `${completedStages.length}/${RESEARCH_STAGE_IDS.length} [${marks.join(' ')}]`;
}

/** Run `far research status <runId> [--json]` — print the on-disk checkpoint state. */
export function runResearchStatus(args: readonly string[]): number {
  const json = args.includes('--json');
  const runId = args.find((a) => !a.startsWith('--'));
  if (runId === undefined) {
    process.stderr.write('far research status: missing <runId>.\n  usage: far research status <runId> [--json]\n');
    return 2;
  }
  const store = resolveRunStore();
  let cp: RunCheckpoint | null;
  try {
    cp = store.loadCheckpoint(runId);
  } catch (err) {
    process.stderr.write(
      `far research status: checkpoint for ${runId} is unreadable: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  if (cp === null) {
    process.stderr.write(
      `far research status: no run ${runId} under ${store.rootDir}.\n  (runs are created by: far research start "<question>")\n`,
    );
    return 1;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(cp, null, 2)}\n`);
    return 0;
  }

  const run = store.loadRun(runId);
  const lines: string[] = [
    '',
    '  FAR-Lab · far research status',
    '  ─────────────────────────────────────────────────────────────────────',
    `  runId      : ${cp.runId}`,
    `  question   : ${cp.question}`,
    `  state      : ${cp.state}`,
    `  progress   : ${renderStageProgress(cp.completedStages)}`,
    `  startedAt  : ${cp.startedAt}`,
    `  updatedAt  : ${cp.updatedAt}`,
  ];
  if (cp.state === 'FAILED' || cp.state === 'CANCELLED') {
    lines.push(`  error      : ${cp.error ?? '(none recorded)'} (errorKind=${cp.errorKind ?? 'n/a'})`);
  }
  if (cp.state === 'COMPLETED') {
    lines.push(
      `  completedAt: ${cp.completedAt ?? 'n/a'}`,
      `  runMode    : ${run?.runMode ?? '(run file missing)'}`,
      `  run file   : ${store.runPath(runId)}`,
    );
  }
  lines.push('  ─────────────────────────────────────────────────────────────────────');
  if (cp.state === 'COMPLETED') {
    lines.push(`  next: far research inspect ${store.runPath(runId)} · far research evaluate ${store.runPath(runId)}`);
  } else {
    lines.push(`  next: far research resume ${cp.runId} · inspect the checkpoint: ${store.checkpointPath(runId)}`);
  }
  lines.push('');
  process.stdout.write(lines.join('\n'));
  return 0;
}

/** Run `far research resume <runId> [--profile ...] [--out <file>] [--json]`. */
export async function runResearchResume(args: readonly string[]): Promise<number> {
  const runId = args.find((a) => !a.startsWith('--'));
  if (runId === undefined) {
    process.stderr.write(
      'far research resume: missing <runId>.\n  usage: far research resume <runId> [--profile offline_replay|competition_aliyun_qwen] [--out <file>] [--json]\n',
    );
    return 2;
  }
  const outIdx = args.indexOf('--out');
  const outValue = outIdx !== -1 ? args[outIdx + 1] : undefined;
  const json = args.includes('--json');

  const store = resolveRunStore();
  let cp: RunCheckpoint | null;
  try {
    cp = store.loadCheckpoint(runId);
  } catch (err) {
    process.stderr.write(
      `far research resume: checkpoint for ${runId} is unreadable: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  if (cp === null) {
    process.stderr.write(
      `far research resume: no run ${runId} under ${store.rootDir}.\n  (runs are created by: far research start "<question>")\n`,
    );
    return 1;
  }
  if (cp.state === 'COMPLETED') {
    process.stderr.write(
      `far research resume: run ${runId} is already COMPLETED — inspect it: far research inspect ${store.runPath(runId)}\n`,
    );
    return 1;
  }

  // Profile: default = the checkpoint's own profile (resume keeps provenance);
  // an explicit --profile must match it (mixing replay/live halves mid-run
  // would produce dishonest mode provenance).
  const profileIdx = args.indexOf('--profile');
  const profileArg = profileIdx !== -1 ? args[profileIdx + 1] : undefined;
  if (profileArg !== undefined && profileArg !== cp.profile) {
    process.stderr.write(
      `far research resume: --profile ${profileArg} does not match the checkpoint profile "${cp.profile}" (resume keeps the run's provenance).\n`,
    );
    return 2;
  }
  const profile: 'offline_replay' | 'competition_aliyun_qwen' =
    cp.profile === 'offline_replay' ? 'offline_replay' : 'competition_aliyun_qwen';

  let gateway: LlmGateway;
  let retrievalAdapter: RetrievalAdapter | undefined;
  if (profile === 'competition_aliyun_qwen') {
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        'far research: profile competition_aliyun_qwen needs FAR_DASHSCOPE_API_KEY or DASHSCOPE_API_KEY set.\n  default offline_replay needs no key (synthetic fixtures, RECORDED_REPLAY mode).\n',
      );
      return 2;
    }
    gateway = createCompetitionQwenGateway({ apiKey });
  } else {
    gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    // Offline resume: re-inject the replay retrieval adapter (the corpus for
    // completed stages is reused from the checkpoint; incomplete retrieval
    // replays the same deterministic fixtures).
    retrievalAdapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
  }

  return executeLifecycleRun({
    store,
    gateway,
    profile,
    ...(retrievalAdapter !== undefined ? { grounding: { adapter: retrievalAdapter } } : {}),
    target: cp.target,
    json,
    out: outValue !== undefined ? outValue : null,
    runId,
  });
}

/** Render a compact human-readable summary. */
function renderHuman(profile: string, run: ResearchRun): void {
  const lines: string[] = [];
  if (profile === 'offline_replay') {
    lines.push(
      '',
      '  ╔═ OFFLINE REPLAY MODE (synthetic fixtures) ═══════════════════════════╗',
      '  ║ This run replays SYNTHETIC demo fixtures — NOT live science.         ║',
      '  ║ For a live run: far research start "<q>" --profile competition_aliyun_qwen ║',
      '  ╚══════════════════════════════════════════════════════════════════════╝',
    );
  }
  lines.push(
    '',
    '  FAR-Lab · far research (Track 1A: hypothesis generation + research plan)',
    '  ─────────────────────────────────────────────────────────────────────',
    `  question : ${run.question}`,
    `  run      : ${run.runId}`,
    `  gate     : ${run.gateReport.verdict}${run.gateReport.scope.domain !== null ? ` · domain=${run.gateReport.scope.domain}` : ''}${run.gateReport.requiresEthicsGate ? ' · ethics-gate required' : ''}`,
    `  runMode  : ${run.runMode}  (model=${run.modes.modelExecutionMode} · retrieval=${run.modes.retrievalExecutionMode} · experiment=${run.modes.experimentExecutionMode})`,
    `  receipts : ${run.stageReceipts.length} stage receipts · env git=${run.environment.gitCommit?.slice(0, 8) ?? 'n/a'}${run.environment.gitDirty === true ? ' (dirty)' : ''}`,
    `  corpus   : ${run.corpus.documentCount} docs · snapshot=${run.corpus.snapshotId.slice(0, 12)}…`,
    '  ─────────────────────────────────────────────────────────────────────',
  );

  lines.push('', '  Candidate hypotheses (mechanistically distinct):');
  for (const h of run.hypotheses) {
    const binding = run.bindings[h.id];
    const card = run.scorecards[h.id];
    const bindingTag = binding?.allBound === true ? 'bound' : `UNBOUND(${binding?.unbound.length ?? '?'})`;
    const primaryTag = run.plan.primaryHypothesisId === h.id ? ' ← PRIMARY' : '';
    lines.push(`    · ${h.id.slice(0, 8)}…  ${bindingTag}${primaryTag}`);
    lines.push(`        ${h.statement.slice(0, 96)}${h.statement.length > 96 ? '…' : ''}`);
    if (card !== undefined) {
      const grades = card.dimensions
        .map((d) => `${d.name.slice(0, 1).toUpperCase()}${d.name.slice(1)}:${d.grade}`)
        .join(' · ');
      lines.push(`        ${card.paretoOptimal ? '[Pareto-optimal] ' : ''}${grades}`);
    }
  }

  lines.push(
    '',
    '  Research plan (primary hypothesis selected deterministically):',
    `    objectives: ${run.plan.objectives.length} · statisticalMethods: ${run.plan.statisticalMethods.length}`,
    `    sampleSize: ${run.plan.sampleSizeRationale.slice(0, 80)}${run.plan.sampleSizeRationale.length > 80 ? '…' : ''}`,
    `    humanApprovalRequired: ${run.plan.humanApprovalRequired.length} step(s)`,
    '',
    '  red line: hypotheses are scored deterministically (falsifiability, evidence',
    '  coverage, counter-evidence) + independently critiqued; the model never emits',
    '  a single total score. Citations must bind to the grounding corpus.',
    '',
  );
  process.stdout.write(lines.join('\n'));
}

/** Run `far research inspect <file>` — print a saved ResearchRun. */
export function runResearchInspect(args: readonly string[]): number {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research inspect: missing <file>.\n  usage: far research inspect <run.json> [--json]\n');
    return 2;
  }
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    process.stderr.write(`far research inspect: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  const json = args.includes('--json');
  if (json) {
    process.stdout.write(raw);
    return 0;
  }
  const run = parseResearchRunJson(raw);
  renderHuman(run.runMode === 'LIVE' ? 'competition_aliyun_qwen' : 'offline_replay', run);
  return 0;
}

/**
 * Run `far research verify <run.json>` — independently re-compute the
 * DETERMINISTIC parts of a ResearchRun and check they match what was stored.
 *
 * This is a third-party verification of the deterministic layer only: citation
 * binding, deterministic scorecard dimensions, Pareto front, and primary-hypothesis
 * selection. It does NOT (and must not) claim to reproduce the LLM generation —
 * external model output is acknowledged as non-reproducible (directive §3.6).
 */
export function runResearchVerify(args: readonly string[]): number {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research verify: missing <run.json | bundle-dir>.\n  usage: far research verify <run.json|bundle-dir> [--json]\n');
    return 2;
  }
  const json = args.includes('--json');

  // Bundle dir: first verify file integrity against the manifest, then verify
  // the frozen run inside (deterministic recompute + tamper detection).
  let runPath = file;
  if (existsSync(join(file, 'manifest.json'))) {
    const integrity = verifyBundleIntegrity(file);
    if (integrity !== 0) return integrity;
    runPath = join(file, 'research-run.json');
  }

  let run: ResearchRun;
  try {
    run = parseResearchRunJson(readFileSync(runPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`far research verify: cannot read ${runPath}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const outcome = verifyResearchRunDeterministic(run);
  if (outcome.status === 'FAIL') {
    for (const f of outcome.failures) {
      process.stderr.write(`far research verify: ${f}\n`);
    }
    return 7;
  }

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          status: 'PASS',
          verified: [...outcome.verified],
          notVerifiable: [...outcome.notVerifiable],
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(
      'far research verify: PASS (deterministic layer recomputed and matches)\n' +
        `  verified: ${outcome.verified.join(' · ')}\n` +
        `  not independently recomputable (by design): ${outcome.notVerifiable.join(' · ')}\n`,
    );
  }
  return 0;
}

/** Run `far research compare <run.json> [--revision <a> <b>]`. */
export function runResearchCompare(args: readonly string[]): number {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research compare: missing <run.json>.\n  usage: far research compare <run.json> [--revision <a> <b>] [--json]\n');
    return 2;
  }

  let run: ResearchRun;
  try {
    run = parseResearchRunJson(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`far research compare: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  if (run.revisions.length === 0) {
    process.stderr.write('far research compare: the run has no revisions yet (apply feedback first: far research feedback <run.json> --file feedback.json)\n');
    return 1;
  }

  // Resolve the two plans to compare: default = first revision's before vs the
  // latest revision's after. --revision a b overrides (1-based numbers).
  const revIdx = args.indexOf('--revision');
  const resolved = ((): {
    before: ResearchRun['plan'] | null;
    after: ResearchRun['plan'] | null;
    label: string;
  } => {
    if (revIdx !== -1) {
      const a = Number(args[revIdx + 1]);
      const b = Number(args[revIdx + 2]);
      const revA = run.revisions.find((r) => r.number === a);
      const revB = run.revisions.find((r) => r.number === b);
      if (revA === undefined || revB === undefined) {
        process.stderr.write(`far research compare: revision numbers ${a}/${b} not found (have ${run.revisions.map((r) => r.number).join(',')})\n`);
        return { before: null, after: null, label: 'error' };
      }
      return {
        before: revA.beforePlan ?? revA.afterPlan,
        after: revB.afterPlan ?? revB.beforePlan,
        label: `revision ${a} before vs revision ${b} after`,
      };
    }
    const first = run.revisions[0]!;
    const last = run.revisions[run.revisions.length - 1]!;
    return {
      before: first.beforePlan ?? run.plan,
      after: last.afterPlan ?? run.plan,
      label: 'first-before vs latest-after',
    };
  })();
  if (resolved.before === null || resolved.after === null) {
    return 2;
  }
  const { before, after, label } = resolved;

  const diff = compareResearchPlans(before, after);
  const json = args.includes('--json');
  if (json) {
    process.stdout.write(`${JSON.stringify({ label, beforePlanId: before.primaryHypothesisId, afterPlanId: after.primaryHypothesisId, diff }, null, 2)}\n`);
    return 0;
  }

  const lines: string[] = [
    '',
    `  FAR-Lab · far research compare — ${label}`,
    `  run: ${run.runId} · revisions: ${run.revisions.length}`,
    '  ─────────────────────────────────────────────────────────────────────',
  ];
  if (diff.identical) {
    lines.push('  (no plan changes between the two frozen states — recorded honestly)');
  }
  if (diff.primaryHypothesisChanged) {
    lines.push(`  primary hypothesis: ${before.primaryHypothesisId.slice(0, 8)}… → ${after.primaryHypothesisId.slice(0, 8)}…`);
  }
  for (const c of diff.stringFieldChanges) {
    lines.push(`  [${c.field}] "${c.before.slice(0, 60)}…" → "${c.after.slice(0, 60)}…"`);
  }
  for (const [field, diffEntry] of Object.entries(diff.arrayFieldChanges)) {
    lines.push(`  [${field}] +${diffEntry.added.length} added · -${diffEntry.removed.length} removed · =${diffEntry.unchanged.length} unchanged`);
    for (const item of diffEntry.added.slice(0, 3)) lines.push(`      + ${item}`);
    for (const item of diffEntry.removed.slice(0, 3)) lines.push(`      - ${item}`);
  }
  lines.push(
    `  unchanged fields: ${diff.unchangedArrayFields.length} array fields (${diff.unchangedArrayFields.join(', ')})`,
    '',
    '  note: comparisons never force improvement — a revision may honestly make',
    '  the plan worse, narrower, or more uncertain.',
    '',
  );
  process.stdout.write(lines.join('\n'));
  return 0;
}

/** Verify bundle file integrity against the manifest (tamper detection). */
function verifyBundleIntegrity(bundleDir: string): number {
  let manifest: { files?: ReadonlyArray<{ path: string; sha256: string }>; runId?: unknown };
  try {
    manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8')) as typeof manifest;
  } catch (err) {
    process.stderr.write(`far research verify: cannot read manifest.json: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  if (!Array.isArray(manifest.files)) {
    process.stderr.write('far research verify: manifest.json malformed (missing files table)\n');
    return 1;
  }
  let failed = 0;
  for (const entry of manifest.files) {
    if (entry.path === 'manifest.json') continue;
    try {
      const actual = researchBundleSha256(readFileSync(join(bundleDir, entry.path), 'utf8'));
      if (actual !== entry.sha256) {
        process.stderr.write(`far research verify: TAMPERED ${entry.path}\n`);
        failed += 1;
      }
    } catch {
      process.stderr.write(`far research verify: MISSING ${entry.path}\n`);
      failed += 1;
    }
  }
  if (failed > 0) {
    process.stderr.write(`far research verify: bundle integrity FAIL (${failed} file(s) do not match manifest)\n`);
    return 7;
  }
  return 0;
}

/** Run `far research export <run.json> --out <bundle-dir>`. */
export function runResearchExport(args: readonly string[]): number {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research export: missing <run.json>.\n  usage: far research export <run.json> [--out <bundle-dir>]\n');
    return 2;
  }
  const outIdx = args.indexOf('--out');
  const outValue = outIdx !== -1 ? args[outIdx + 1] : undefined;
  if (outValue === undefined) {
    process.stderr.write('far research export: --out <bundle-dir> is required.\n');
    return 2;
  }

  let run: ResearchRun;
  try {
    run = parseResearchRunJson(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`far research export: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  if (typeof run.runId !== 'string' || !Array.isArray(run.hypotheses)) {
    process.stderr.write('far research export: file is not a valid ResearchRun (missing runId/hypotheses)\n');
    return 1;
  }

  try {
    const result = exportResearchBundle(run, outValue);
    const json = args.includes('--json');
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `far research export: bundle written to ${result.bundleDir}\n` +
          `  run       : ${run.runId} · runMode=${run.runMode} · git=${run.environment.gitCommit?.slice(0, 8) ?? 'n/a'}\n` +
          `  files     : ${result.filesWritten.join(', ')}\n` +
          `  manifest  : sha256=${result.manifestHash.slice(0, 16)}…\n` +
          `  verify    : node ${join(result.bundleDir, 'verify.mjs')}   (integrity, standalone)\n` +
          `              far research verify ${result.bundleDir}          (deterministic recompute, in-repo)\n`,
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(`far research export: failed — ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

/** Parse + validate a user-supplied feedback document (fail-closed). */
function parseFeedbackJson(raw: string): import('zod').infer<typeof FeedbackInputZod> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`feedback file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  const result = FeedbackInputZod.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`feedback file is invalid: ${details}`);
  }
  return result.data;
}

/** Run `far research feedback <run.json> --file feedback.json [--out <new.json>]`. */
export async function runResearchFeedback(args: readonly string[]): Promise<number> {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research feedback: missing <run.json>.\n  usage: far research feedback <run.json> --file feedback.json [--out <new.json>] [--profile offline_replay|competition_aliyun_qwen]\n');
    return 2;
  }
  const feedbackIdx = args.indexOf('--file');
  const feedbackPath = feedbackIdx !== -1 ? args[feedbackIdx + 1] : undefined;
  if (feedbackPath === undefined) {
    process.stderr.write('far research feedback: --file feedback.json is required.\n');
    return 2;
  }
  const outIdx = args.indexOf('--out');
  const outValue = outIdx !== -1 ? args[outIdx + 1] : undefined;
  const outPath = outValue !== undefined ? outValue : file;

  let run: ResearchRun;
  let feedbackRaw: string;
  try {
    run = parseResearchRunJson(readFileSync(file, 'utf8'));
    feedbackRaw = readFileSync(feedbackPath, 'utf8');
  } catch (err) {
    process.stderr.write(`far research feedback: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  // Profile: default follows the run's own provenance — a LIVE run's revision
  // comes from the live model (never silently from replay fixtures); an
  // explicit --profile overrides.
  const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : undefined;
  const profile = profileArg === 'competition_aliyun_qwen' || (profileArg === undefined && run.runMode === 'LIVE')
    ? 'competition_aliyun_qwen'
    : 'offline_replay';
  if (profile === 'competition_aliyun_qwen' && liveApiKey() === undefined) {
    process.stderr.write(
      'far research feedback: this run is LIVE — revising it needs DASHSCOPE_API_KEY in the environment.\n' +
        '  (pass --profile offline_replay only for synthetic wiring tests.)\n',
    );
    return 2;
  }

  const fb = parseFeedbackJson(feedbackRaw);
  const feedback = buildFeedbackSignal({
    source: fb.source,
    actor: fb.actor,
    text: fb.text,
    ...(fb.affectsHypothesisIds !== undefined
      ? { affectsHypothesisIds: fb.affectsHypothesisIds }
      : {}),
    ...(fb.changesScore !== undefined ? { changesScore: fb.changesScore } : {}),
    ...(fb.triggers !== undefined ? { triggers: fb.triggers } : {}),
  });

  // Single application service (§12.1): the CLI and the REST API apply feedback
  // through the same applyFeedbackToRun (plan rewrite + immutable revision).
  const gateway = profile === 'competition_aliyun_qwen'
    ? createCompetitionQwenGateway({ apiKey: process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? '' })
    : createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  const applied = await applyFeedbackToRun({ run, feedback, gateway, profile });
  const { updated, revision } = applied;
  const planChanges = [...applied.planChanges];
  const unresolvedConflicts = [...applied.unresolvedConflicts];
  const hypothesisChanges = revision.hypothesisChanges;

  const dir = dirname(outPath);
  if (dir !== '.' && dir !== '') {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  process.stdout.write(
    `far research feedback: revision #${revision.number} (${revision.id.slice(0, 8)}…)\n` +
      `  affectsHypotheses: ${hypothesisChanges.downgraded.length} · planChanges: ${planChanges.length} · unresolved: ${unresolvedConflicts.length}\n` +
      `  saved: ${outPath}\n`,
  );
  return 0;
}

/**
 * Run `far research analyze <run.json> [--live] [--out <new.json>] [--json]`.
 *
 * Phase 3 loop: executes the plan's first real analysis step against the NASA
 * Exoplanet Archive (live TAP fetch with --live; otherwise the committed REAL
 * sample in RECORDED_REPLAY mode), parses the output into an Observation,
 * converts it into a FeedbackSignal, and — when the feedback triggers a plan
 * rewrite — actually redesigns the plan and records an immutable revision.
 *
 * Honesty: nulls / small samples / non-significance are preserved in the
 * observation; a negative result is reported as a negative result.
 */
export async function runResearchAnalyze(args: readonly string[]): Promise<number> {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research analyze: missing <run.json>.\n  usage: far research analyze <run.json> [--live] [--out <new.json>] [--profile offline_replay|competition_aliyun_qwen] [--json]\n');
    return 2;
  }
  const outIdx = args.indexOf('--out');
  const outValue = outIdx !== -1 ? args[outIdx + 1] : undefined;
  const outPath = outValue !== undefined ? outValue : file;
  const live = args.includes('--live');
  const json = args.includes('--json');

  let run: ResearchRun;
  try {
    run = parseResearchRunJson(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`far research analyze: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  // Profile: default follows the run's own provenance (LIVE run → live model).
  const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : undefined;
  const profile = profileArg === 'competition_aliyun_qwen' || (profileArg === undefined && run.runMode === 'LIVE')
    ? 'competition_aliyun_qwen'
    : 'offline_replay';
  if (profile === 'competition_aliyun_qwen' && liveApiKey() === undefined) {
    process.stderr.write(
      'far research analyze: this run is LIVE — the revision step needs DASHSCOPE_API_KEY in the environment.\n' +
        '  (pass --profile offline_replay only for synthetic wiring tests.)\n',
    );
    return 2;
  }

  // 1. Execute the plan's first analysis step (live or committed-real replay).
  let experiment;
  try {
    const replay = live ? undefined : loadExoplanetReplayRows();
    experiment = await runPlanExperiment({
      run,
      ...(replay !== undefined ? { replayRows: replay.rows, replayCard: replay.card } : {}),
    });
  } catch (err) {
    process.stderr.write(
      `far research analyze: experiment failed (fail-closed): ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const { observation, feedback, updatedRun } = experiment;

  // 2. Apply the feedback through the shared application service (§12.1):
  //    plan rewrite when triggered + immutable revision.
  const gateway = profile === 'competition_aliyun_qwen'
    ? createCompetitionQwenGateway({ apiKey: process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? '' })
    : createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  const applied = await applyFeedbackToRun({ run: updatedRun, feedback, gateway, profile });
  const revision = applied.revision;
  const planChanges = [...applied.planChanges];
  const unresolvedConflicts = [...applied.unresolvedConflicts];
  const finalRun = applied.updated;

  const dir = dirname(outPath);
  if (dir !== '.' && dir !== '') {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outPath, JSON.stringify(finalRun, null, 2) + '\n', 'utf8');

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ observation, feedback, revisionId: revision.id, saved: outPath }, null, 2)}\n`,
    );
  } else {
    const headline =
      isLandscapeObservation(observation)
        ? `literature-landscape, docs=${observation.result.totalDocuments}, counterShare=${(observation.result.counterEvidenceShare * 100).toFixed(1)}%, mode=${observation.mode}`
        : `${observation.result.status}, n=${observation.result.n}, mode=${observation.mode}`;
    const resultLine =
      isLandscapeObservation(observation)
        ? `${observation.result.totalDocuments} docs · counter-evidence ${(observation.result.counterEvidenceShare * 100).toFixed(1)}% · fresh≤5y ${(observation.result.freshShare * 100).toFixed(1)}% · median year ${observation.result.medianPublicationYear ?? 'n/a'} · ${observation.result.sourceFamilies.join('+')}`
        : observation.result.summary;
    process.stdout.write(
      `far research analyze: observation collected (${headline})\n` +
        `  result    : ${resultLine}\n` +
        `  feedback  : ${feedback.text.slice(0, 160)}${feedback.text.length > 160 ? '…' : ''}\n` +
        `  triggers  : ${feedback.triggers.join(', ')} · changesScore=${feedback.changesScore}\n` +
        `  revision  : #${revision.number} (${revision.id.slice(0, 8)}…) · planChanges=${planChanges.length} · unresolved=${unresolvedConflicts.length}\n` +
        `  runMode   : ${finalRun.runMode} (experiment=${finalRun.modes.experimentExecutionMode})\n` +
        `  saved     : ${outPath}   (compare: far research compare ${outPath})\n`,
    );
  }
  return 0;
}

/**
 * Run `far research evaluate <run.json> [--json]`.
 *
 * Program-computed evaluation metrics (§14.3) + deterministic recompute. The
 * frozen evaluation set (src/research/evaluation/frozen_eval_set.json) maps the
 * question to its evidence profile; metrics are computed from the frozen run —
 * never hand-edited. Human-rubric metrics are listed, not faked.
 */
export function runResearchEvaluate(args: readonly string[]): number {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research evaluate: missing <run.json>.\n  usage: far research evaluate <run.json> [--json]\n');
    return 2;
  }
  const json = args.includes('--json');

  let run: ResearchRun;
  try {
    run = parseResearchRunJson(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`far research evaluate: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const outcome = verifyResearchRunDeterministic(run);
  const report = computeRunMetrics(
    run,
    outcome.status,
    new Date().toISOString(),
  );

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ...report, verification: outcome }, null, 2)}\n`,
    );
    return 0;
  }

  const lines: string[] = [
    '',
    '  FAR-Lab · far research evaluate (program-computed metrics, §14.3)',
    `  run: ${report.runId} · question: ${report.question}`,
    '  ─────────────────────────────────────────────────────────────────────',
  ];
  for (const m of report.metrics) {
    const v = typeof m.value === 'number' ? m.value.toFixed(3) : String(m.value);
    lines.push(`  ${m.name.padEnd(34)} ${v}`);
  }
  lines.push(
    `  ${'deterministicRecompute'.padEnd(34)} ${report.deterministicRecompute}`,
    '  ─────────────────────────────────────────────────────────────────────',
    `  human-rubric metrics (NOT auto-scored — blind review only): ${report.humanRubricMetrics.join(', ')}`,
    '',
  );
  process.stdout.write(lines.join('\n'));
  return 0;
}

/**
 * Run `far research baseline "<question>" [--profile ...] [--json]`.
 *
 * Four fair baselines (§14.2) with the same model + question: direct answer,
 * simple RAG, no-deterministic-kernel agent, and the full system. Offline
 * (offline_replay) each replays its fixture — the report says so. Live needs
 * the profile API key.
 */
export async function runResearchBaseline(args: readonly string[]): Promise<number> {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    process.stderr.write('far research baseline: missing <question>.\n  usage: far research baseline "<question>" [--profile auto|offline_replay|competition_aliyun_qwen] [--json]\n');
    return 2;
  }
  // Same `auto` default as start: live when a key exists; fail closed with
  // guidance otherwise (a synthetic-fixture baseline answers nothing real).
  const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'auto';
  const resolved = resolveAutoProfile(
    profileArg === 'offline_replay' || profileArg === 'competition_aliyun_qwen' || profileArg === 'auto'
      ? profileArg
      : 'auto',
  );
  if (resolved === 'missing-key') {
    process.stderr.write(NO_KEY_GUIDANCE);
    return 2;
  }
  const profile = resolved;
  const json = args.includes('--json');

  const gateway = profile === 'competition_aliyun_qwen'
    ? createCompetitionQwenGateway({ apiKey: liveApiKey()! })
    : createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  const replayAdapter = profile === 'competition_aliyun_qwen'
    ? undefined
    : createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);

  let fullRun: ResearchRun | undefined;
  try {
    fullRun = await runResearch({
      question: file,
      gateway,
      profile,
      grounding: {
        source: 'openalex',
        maxPerQuery: 5,
        ...(replayAdapter !== undefined ? { adapter: replayAdapter } : {}),
      },
      targetHypothesisCount: 3,
      sameModelAsGenerator: true,
    });
  } catch (err) {
    if (err instanceof ResearchabilityBlockedError) {
      process.stderr.write(`far research baseline: gate refused (${err.report.verdict}): ${err.report.reasons.join('; ')}\n`);
      return 3;
    }
    process.stderr.write(`far research baseline: full run failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  try {
    const entries = await runAllBaselines({
      question: file,
      gateway,
      profile,
      ...(replayAdapter !== undefined ? { adapter: replayAdapter } : {}),
      fullRun,
    });

    if (json) {
      process.stdout.write(
        `${JSON.stringify({ question: file, mode: fullRun.runMode, entries }, null, 2)}\n`,
      );
      return 0;
    }

    const lines: string[] = [
      '',
      '  FAR-Lab · far research baseline — 4 fair baselines, same model + question (§14.2)',
      `  question: ${file} · full runMode: ${fullRun.runMode}`,
      '  ─────────────────────────────────────────────────────────────────────',
    ];
    const header = '  kind      | mode             | hyps | corpus | binding | unbound | kernel';
    lines.push(header);
    lines.push('  ' + '-'.repeat(header.length - 2));
    for (const e of entries) {
      const binding = e.citationBindingRate === null ? 'N/A' : e.citationBindingRate.toFixed(2);
      const hyps = e.hypothesisCount === null ? 'N/A' : String(e.hypothesisCount);
      const corpus = e.corpusDocumentCount === null ? 'N/A' : String(e.corpusDocumentCount);
      const unbound = e.unboundEvidenceCount === null ? 'N/A' : String(e.unboundEvidenceCount);
      lines.push(
        `  ${e.kind.padEnd(9)} | ${e.mode.padEnd(16)} | ${hyps.padEnd(4)} | ${corpus.padEnd(6)} | ${binding.padEnd(7)} | ${unbound.padEnd(7)} | ${e.deterministicKernelRan ? 'yes' : 'no'}`,
      );
    }
    lines.push(
      '  ─────────────────────────────────────────────────────────────────────',
      '  note: N/A = the variant does not possess that capability (reported honestly,',
      '        not scored as zero). Live comparison needs --profile competition_aliyun_qwen.',
      '',
    );
    process.stdout.write(lines.join('\n'));
    return 0;
  } catch (err) {
    process.stderr.write(`far research baseline: failed — ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
