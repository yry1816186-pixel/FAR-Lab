// src/cli/commands/research.ts
// far research start "<question>" — run the Track-1A vertical slice once
// (ground → generate 3-5 hypotheses → critique → score → plan → ResearchRun).
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
import { runResearch } from '../../research/orchestrator.ts';
import { ResearchabilityBlockedError } from '../../research/researchability_gate.ts';
import { buildFeedbackSignal, compareResearchPlans } from '../../research/revision.ts';
import { applyFeedbackToRun } from '../../research/application.ts';
import { verifyResearchRunDeterministic } from '../../research/verification.ts';
import { computeRunMetrics } from '../../research/evaluation/metrics.ts';
import { exportResearchBundle, researchBundleSha256 } from '../../research/export_bundle.ts';
import { runPlanExperiment } from '../../research/experiment.ts';
import { loadExoplanetReplayRows } from '../../research/adapters/exoplanet_replay.ts';
import type { ResearchRun } from '../../research/types.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../research/research_fixtures.ts';
import type { RetrievalAdapter } from '../../retrieval/types.ts';

/** Parsed options for the research command. */
export interface ResearchArgs {
  readonly question: string;
  readonly source: 'openalex' | 'arxiv' | 'crossref';
  readonly maxPerQuery: number;
  readonly profile: 'offline_replay' | 'competition_aliyun_qwen';
  readonly target: number;
  readonly json: boolean;
  readonly out: string | null;
}

/** Parse `far research start` args. */
export function parseResearchArgs(args: readonly string[]): ResearchArgs {
  let question = '';
  let source: 'openalex' | 'arxiv' | 'crossref' = 'openalex';
  let maxPerQuery = 5;
  let profile: 'offline_replay' | 'competition_aliyun_qwen' = 'offline_replay';
  let target = 3;
  let json = false;
  let out: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--source') {
      const v = args[++i];
      if (v !== 'openalex' && v !== 'arxiv' && v !== 'crossref') {
        throw new Error(`far research: --source must be openalex|arxiv|crossref (got: ${v ?? '<missing>'})`);
      }
      source = v;
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
      if (v !== 'offline_replay' && v !== 'competition_aliyun_qwen') {
        throw new Error(`far research: --profile must be offline_replay|competition_aliyun_qwen (got: ${v ?? '<missing>'})`);
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
  return { question, source, maxPerQuery, profile, target, json, out };
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
      'far research start: missing question.\n  usage: far research start "<question>" [--source openalex|arxiv|crossref] [--max-per-query <n>] [--profile offline_replay|competition_aliyun_qwen] [--target 3..5] [--json] [--out <file>]\n',
    );
    return 2;
  }

  // Build the gateway + grounding adapter for the chosen profile.
  let gateway: LlmGateway;
  let retrievalAdapter: RetrievalAdapter | undefined;
  if (parsed.profile === 'competition_aliyun_qwen') {
    const apiKey = process.env.FAR_DASHSCOPE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      process.stderr.write(
        'far research: profile competition_aliyun_qwen needs FAR_DASHSCOPE_API_KEY or DASHSCOPE_API_KEY set.\n  default offline_replay needs no key (synthetic fixtures, RECORDED_REPLAY mode).\n',
      );
      return 2;
    }
    gateway = createCompetitionQwenGateway({ apiKey });
    // live retrieval: no injected adapter
  } else {
    gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    retrievalAdapter = createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS);
  }

  let run: ResearchRun;
  try {
    run = await runResearch({
      question: parsed.question,
      gateway,
      profile: parsed.profile,
      grounding: {
        source: parsed.source,
        maxPerQuery: parsed.maxPerQuery,
        ...(retrievalAdapter !== undefined ? { adapter: retrievalAdapter } : {}),
      },
      targetHypothesisCount: parsed.target,
      sameModelAsGenerator: true,
    });
  } catch (err) {
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
    process.stderr.write(
      `far research: pipeline failed (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return 1;
  }

  if (parsed.out !== null) {
    const dir = dirname(parsed.out);
    if (dir !== '.' && dir !== '') {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(parsed.out, JSON.stringify(run, null, 2) + '\n', 'utf8');
    if (!parsed.json) {
      process.stderr.write(`  saved    : ${parsed.out} (far research inspect ${parsed.out})\n`);
    }
  }

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  } else {
    renderHuman(parsed.profile, run);
  }
  return 0;
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
  const run = JSON.parse(raw) as ResearchRun;
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
    run = JSON.parse(readFileSync(runPath, 'utf8')) as ResearchRun;
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
    run = JSON.parse(readFileSync(file, 'utf8')) as ResearchRun;
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
    run = JSON.parse(readFileSync(file, 'utf8')) as ResearchRun;
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
  const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'offline_replay';
  const profile = profileArg === 'competition_aliyun_qwen' ? 'competition_aliyun_qwen' : 'offline_replay';

  let run: ResearchRun;
  let feedbackRaw: string;
  try {
    run = JSON.parse(readFileSync(file, 'utf8')) as ResearchRun;
    feedbackRaw = readFileSync(feedbackPath, 'utf8');
  } catch (err) {
    process.stderr.write(`far research feedback: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const fb = JSON.parse(feedbackRaw) as {
    source: 'human' | 'literature' | 'tool' | 'analysis';
    actor: string;
    text: string;
    affectsHypothesisIds?: string[];
    changesScore?: boolean;
    triggers?: string[];
  };
  const feedback = buildFeedbackSignal({
    source: fb.source,
    actor: fb.actor,
    text: fb.text,
    ...(fb.affectsHypothesisIds !== undefined
      ? { affectsHypothesisIds: fb.affectsHypothesisIds }
      : {}),
    ...(fb.changesScore !== undefined ? { changesScore: fb.changesScore } : {}),
    ...(fb.triggers !== undefined
      ? { triggers: fb.triggers as ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[] }
      : {}),
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
  const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'offline_replay';
  const profile = profileArg === 'competition_aliyun_qwen' ? 'competition_aliyun_qwen' : 'offline_replay';
  const json = args.includes('--json');

  let run: ResearchRun;
  try {
    run = JSON.parse(readFileSync(file, 'utf8')) as ResearchRun;
  } catch (err) {
    process.stderr.write(`far research analyze: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
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
    process.stdout.write(
      `far research analyze: observation collected (${observation.result.status}, n=${observation.result.n}, mode=${observation.mode})\n` +
        `  result    : ${observation.result.summary}\n` +
        `  feedback  : ${feedback.text.slice(0, 140)}${feedback.text.length > 140 ? '…' : ''}\n` +
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
    run = JSON.parse(readFileSync(file, 'utf8')) as ResearchRun;
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
