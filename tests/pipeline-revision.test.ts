import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { feedbackStage } from '../src/pipeline/stages/feedback.js';
import { reviseStage } from '../src/pipeline/stages/revise.js';
import {
  FeedbackSignal,
  HypothesisCandidate,
  ResearchPlan,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  newId,
} from '../src/domain/index.js';
import type { RunId } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import type { ModelProvider, StructuredCallRequest } from '../src/shared/ports.js';

// *** TEST FIXTURES ONLY ***
// Every model response is a scripted TestStubProvider step (executionMode 'test'); no
// network, no keys. All persistence is a throwaway temp SQLite db + artifact store.
// The graph under test: 1 question / 1 claim / 1 hypothesis v0 (representative, with
// distinctnessRationale) / 1 plan / 1 stored FeedbackSignal — the minimal W2 revision loop.

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-revision-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
  artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const base = Date.now();
const ts = (i: number) => new Date(base + i * 1000).toISOString();
/** Well-formed but nonexistent id (passes the regex, fails the existence oracle). */
const ghost = (prefix: string) => `${prefix}_${'0'.repeat(26)}`;

const TASK_A = 'task_0abcdefghij0abcdefghij0abc';
const TASK_B = 'task_1abcdefghij1abcdefghij1abc';
const TASK_C = 'task_2abcdefghij2abcdefghij2abc';

const seedRun = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'prior work shows motif-dependent off-targets',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: {},
    createdAt: ts(1),
  });
  const now = ts(0);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'feedback',
    stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
    createdAt: now,
    updatedAt: now,
    tags: [],
  });
  store.putObject('question', q);
  db.prepare(
    'INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);
  return { q, run };
};

const seedHypothesis = (runId: RunId) =>
  HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement: 'off-target edits increase linearly with deaminase exposure duration',
    mechanism: 'longer exposure keeps single-stranded DNA exposed to the deaminase, accumulating edits',
    derivation: { strategy: 'evidence_conditioned', rationale: 'seeded from duration-response claims', inputClaimIds: [] },
    assumptions: [
      { id: 'a0', statement: 'exposure duration is the dominant driver', kind: 'empirical', backingClaimIds: [] },
      { id: 'a1', statement: 'cell-line effects are negligible', kind: 'stipulated', backingClaimIds: [] },
    ],
    predictions: ['off-target count scales linearly with duration'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: ['single-cell-line evidence only'],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    clusterKey: 'duration',
    distinctnessRationale: 'differs from motif hypotheses: duration-driven, not sequence-driven',
    createdAt: ts(2),
  });

const SRC = newId('src');
const seedClaim = (runId: RunId) =>
  ScientificClaim.parse({
    id: newId('clm'),
    runId,
    text: 'replication of the duration effect failed across three independent labs',
    locators: [{ sourceDocumentId: SRC, quote: 'the duration effect did not replicate' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });

const seedPlan = (runId: RunId, hypId: string) =>
  ResearchPlan.parse({
    id: newId('pln'),
    runId,
    objective: 'measure whether exposure duration drives off-target editing',
    hypothesisIds: [hypId],
    variables: ['exposure duration', 'off-target count'],
    controls: ['unexposed control'],
    steps: [
      { id: TASK_A, title: 'collect duration series', kind: 'data_analysis', inputs: [], outputs: ['duration series'], method: 'curate published duration-series datasets', failureConditions: ['no dataset with >=6 timepoints'], dependsOn: [] },
      { id: TASK_B, title: 'fit dose-response', kind: 'data_analysis', inputs: ['duration series'], outputs: ['fit'], method: 'fit linear and saturating models', failureConditions: ['models indistinguishable'], dependsOn: [TASK_A] },
      { id: TASK_C, title: 'expert review', kind: 'human_review', inputs: ['fit'], outputs: ['verdict'], method: 'two blind reviewers classify support/weakening', failureConditions: ['reviewers disagree'], dependsOn: [TASK_B] },
    ],
    metrics: ['off-target edits per exposure hour', 'R2 of linear fit'],
    statistics: [],
    decisionRules: {
      successCriterion: 'linear fit R2 >= 0.8 across labs',
      weakeningCriterion: 'linear fit R2 < 0.5 in any lab',
      falsificationCriterion: 'no duration effect in >= 3 labs',
      stopCriterion: 'stop after 2 model classes fail to separate',
    },
    createdAt: ts(3),
  });

const seedSignal = (runId: RunId, content: string) =>
  FeedbackSignal.parse({
    id: newId('fbk'),
    runId,
    source: 'human_expert',
    content,
    provenance: 'test fixture: scripted expert review',
    receivedAt: ts(4),
  });

const makeCtx = (
  run: ResearchRun,
  steps: StubStep[],
  opts: { capture?: { reqs: StructuredCallRequest[] } } = {},
) => {
  const receipts: Array<Record<string, unknown>> = [];
  const inner = createTestStubProvider(steps);
  const provider: ModelProvider = opts.capture
    ? {
        name: inner.name,
        liveReady: inner.liveReady,
        structuredCall(req, parse) {
          opts.capture?.reqs.push(req);
          return inner.structuredCall(req, parse);
        },
      }
    : inner;
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider,
    sourceFor: () => {
      throw new Error('sources are not used by feedback/revise');
    },
    recordReceipt: (r) => {
      receipts.push(r as Record<string, unknown>);
    },
    cancelled: () => false,
    log: () => {},
  };
  return { ctx, receipts };
};

// ---------------------------------------------------------------------------
// scripted model outputs (causal analysis -> hypothesis revision -> plan revision)
// ---------------------------------------------------------------------------

const causalOut = (hypId: string, planId: string | null, extra: unknown[] = []) =>
  JSON.stringify({
    affected: [
      { objectType: 'hypothesis', objectId: hypId, reason: 'the failed replication contradicts the linear-duration assumption' },
      ...(planId !== null ? [{ objectType: 'plan', objectId: planId, reason: 'every decision rule is keyed to the disputed duration effect' }] : []),
      ...extra,
    ],
    causalChain:
      'the replication failure removes the empirical base of the duration premise, forcing the hypothesis '
      + 'mechanism and every plan rule keyed to duration to change together',
    expectedQualityDelta: { status: 'improved', claim: 'aligning the mechanism with the failed replication removes a known bias' },
  });

const hypRevOut = JSON.stringify({
  statement: 'off-target edits track motif density rather than exposure duration',
  mechanism: 'deaminase dwell time at TCG-motif sites, not total exposure, accumulates edits',
  assumptions: [
    { statement: 'exposure duration is the dominant driver', kind: 'empirical' }, // kept verbatim -> id a0 preserved
    { statement: 'motif density is measurable per locus', kind: 'methodological' }, // new -> fresh id a2
  ],
  predictions: ['off-target count correlates with motif density per locus'],
  addedUncertainties: ['motif density may covary with chromatin state'],
  revisionRationale: 'replaced duration dominance with a motif-density mechanism after the replication failure',
});

const planRevOut = JSON.stringify({
  steps: [
    { id: TASK_A, title: 'collect motif-density series', kind: 'data_analysis', inputs: [], outputs: ['motif series'], method: 'curate per-locus motif-density and off-target datasets', failureConditions: ['no dataset with per-locus motif annotations'], dependsOn: [] },
    { id: TASK_B, title: 'fit density-response', kind: 'data_analysis', inputs: ['motif series'], outputs: ['fit'], method: 'fit motif-density response models across loci', failureConditions: ['models indistinguishable'], dependsOn: [TASK_A] },
    { id: TASK_C, title: 'expert review', kind: 'human_review', inputs: ['fit'], outputs: ['verdict'], method: 'two blind reviewers classify support/weakening', failureConditions: ['reviewers disagree'], dependsOn: [TASK_B] },
  ],
  metrics: ['off-target edits per high-density motif locus', 'R2 of motif-density fit'],
  decisionRules: {
    successCriterion: 'motif-density fit R2 >= 0.8 across labs',
    weakeningCriterion: 'motif-density fit R2 < 0.5 in any lab',
    falsificationCriterion: 'no motif-density effect in >= 3 labs',
    stopCriterion: 'stop after 2 model classes fail to separate',
  },
  revisionRationale: 're-keyed steps, metrics and decision rules from duration to motif density',
});

// ---------------------------------------------------------------------------
// feedback stage
// ---------------------------------------------------------------------------

describe('feedback stage', () => {
  it('flips applicable when a signal exists and records exactly one feedback_received event per signal', async () => {
    const { run } = seedRun();
    const empty = makeCtx(run, []);
    expect(await feedbackStage.applicable(empty.ctx)).toBe(false);

    const signal = seedSignal(run.id, 'expert: the duration effect did not replicate');
    store.putObject('feedback', signal);
    expect(await feedbackStage.applicable(empty.ctx)).toBe(true);

    const out1 = await feedbackStage.execute(empty.ctx);
    expect(out1.kind).toBe('done');
    const events1 = store.listEvents(run.id).filter((e) => e.type === 'feedback_received');
    expect(events1).toHaveLength(1);
    expect(events1[0]?.detail).toMatchObject({ feedbackId: signal.id, source: 'human_expert' });
    expect(out1.kind === 'done' ? out1.summary : '').toMatch(/1 unconsumed/);

    // re-execution never duplicates the event and still reports the pending signal
    const out2 = await feedbackStage.execute(empty.ctx);
    expect(out2.kind).toBe('done');
    expect(store.listEvents(run.id).filter((e) => e.type === 'feedback_received')).toHaveLength(1);
    expect(out2.kind === 'done' ? out2.summary : '').toMatch(/0 feedback_received event\(s\) appended/);
  });

  it('does not duplicate a feedback_received event already written by the intake channel', async () => {
    const { run } = seedRun();
    const signal = seedSignal(run.id, 'cli-recorded feedback');
    store.putObject('feedback', signal);
    store.appendEvent(run.id, { type: 'feedback_received', detail: { feedbackId: signal.id, source: signal.source, via: 'cli' } });
    const { ctx } = makeCtx(run, []);
    const out = await feedbackStage.execute(ctx);
    expect(out.kind).toBe('done');
    expect(store.listEvents(run.id).filter((e) => e.type === 'feedback_received')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// revise stage
// ---------------------------------------------------------------------------

describe('revise stage', () => {
  it('turns one signal into causal operations: hypothesis v0->v1, plan revised, Revision + VersionDiff persisted', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id);
    const claim = seedClaim(run.id);
    const plan = seedPlan(run.id, hyp.id);
    store.putObject('hypothesis', hyp);
    store.putObject('claim', claim);
    store.putObject('plan', plan);
    const signal = seedSignal(run.id, 'expert: the duration effect did not replicate across labs');
    store.putObject('feedback', signal);

    const capture: { reqs: StructuredCallRequest[] } = { reqs: [] };
    const { ctx, receipts } = makeCtx(
      run,
      [
        { rawOutput: causalOut(hyp.id, plan.id) },
        { rawOutput: hypRevOut },
        { rawOutput: planRevOut },
      ],
      { capture },
    );

    expect(await reviseStage.applicable(ctx)).toBe(true);
    const outcome = await reviseStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';

    // ---- the causal-analysis call really carried the feedback + the object graph ----
    expect(capture.reqs).toHaveLength(3);
    expect(capture.reqs[0]?.purpose).toBe('causal-revision-analysis');
    const input0 = ((capture.reqs[0]?.userPayload as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
    expect((input0.feedback as { content?: string }).content).toContain('did not replicate');
    expect((input0.hypotheses as Array<{ id?: string }>)[0]?.id).toBe(hyp.id);
    expect((input0.plans as Array<{ id?: string }>)[0]?.id).toBe(plan.id);
    expect((input0.claimsSummary as Array<{ id?: string }>)[0]?.id).toBe(claim.id);
    expect(capture.reqs[1]?.purpose).toBe(`hypothesis-revision:${hyp.id}`);
    expect(capture.reqs[2]?.purpose).toBe(`plan-revision:${plan.id}`);
    expect(receipts).toHaveLength(3);
    expect(receipts.every((r) => r.kind === 'model_call' && r.stage === 'revise')).toBe(true);

    // ---- hypothesis revised: version bumped, content replaced, identity preserved ----
    const revised = store.getObject('hypothesis', hyp.id);
    expect(revised?.version).toBe(1);
    expect(revised?.statement).toBe('off-target edits track motif density rather than exposure duration');
    expect(revised?.mechanism).toContain('dwell time');
    expect(revised?.predictions).toEqual(['off-target count correlates with motif density per locus']);
    // kept assumption keeps identity; invalidated one dropped; new one gets a fresh id
    expect(revised?.assumptions).toHaveLength(2);
    expect(revised?.assumptions[0]).toMatchObject({ id: 'a0', statement: 'exposure duration is the dominant driver' });
    const assumptionIds = revised?.assumptions.map((a) => a.id) ?? [];
    expect(assumptionIds).not.toContain('a1');
    expect(assumptionIds.filter((id) => id !== 'a0')).toHaveLength(1);
    // uncertainties are only ever added to, never erased
    expect(revised?.uncertainties).toEqual(
      expect.arrayContaining(['single-cell-line evidence only', 'motif density may covary with chromatin state']),
    );
    // distinctness must survive a revision (revision must not break cluster distinctness)
    expect(revised?.distinctnessRationale).toBeTruthy();
    expect(revised?.derivation.rationale).toContain(`causal-revision v1 via ${signal.id}`);

    // ---- plan revised: steps/metrics/decisionRules replaced, executability re-gated ----
    const revisedPlan = store.getObject('plan', plan.id);
    expect(revisedPlan?.metrics).toContain('off-target edits per high-density motif locus');
    expect(revisedPlan?.decisionRules.successCriterion).toContain('motif-density');
    expect(revisedPlan?.steps.map((s) => s.id)).toEqual([TASK_A, TASK_B, TASK_C]);
    expect(revisedPlan?.executabilityCheck?.passed).toBe(true);

    // ---- Revision persisted with the full causal chain and before/after operations ----
    const revisions = store.listObjects('revision', run.id);
    expect(revisions).toHaveLength(1);
    const rev = revisions[0]!;
    expect(rev.triggerFeedbackId).toBe(signal.id);
    expect(rev.causalReason).toContain('forcing the hypothesis mechanism');
    expect(rev.fromVersionLabel).toContain(`${hyp.id}@v0`);
    expect(rev.toVersionLabel).toContain(`${hyp.id}@v1`);
    const hypOp = rev.operations.find((o) => o.objectType === 'hypothesis');
    const planOp = rev.operations.find((o) => o.objectType === 'plan');
    expect(hypOp).toMatchObject({ objectId: hyp.id, operation: 'refine' });
    expect(hypOp?.reason).toContain('replication');
    expect(hypOp?.before).toContain('v0');
    expect(hypOp?.after).toContain('v1');
    expect(planOp).toMatchObject({ objectId: plan.id, operation: 'modify' });
    expect(planOp?.before).toContain('pre-revision');
    expect(planOp?.after).toContain('revised');

    // qualityDelta is recorded as what it is: an uncalibrated LLM self-assessment
    expect(rev.qualityDelta.status).toBe('improved');
    expect(rev.qualityDelta.claim).toMatch(/LLM self-assessment/);
    expect(rev.qualityDelta.claim).toMatch(/uncalibrated/);

    // ---- the pre-revision hypothesis is archived and its ref recorded inside the Revision ----
    const archiveRef = hypOp?.before?.match(/sha256:[0-9a-f]{64}/)?.[0];
    expect(archiveRef).toBeTruthy();
    const archived = JSON.parse((await artifacts.get(archiveRef ?? '')) ?? 'null');
    expect(archived).toMatchObject({ id: hyp.id, version: 0, statement: hyp.statement });

    // ---- VersionDiff persisted: changed fields, semantic summary, remaining uncertainties ----
    const diffs = store.listObjects('version_diff', run.id);
    expect(diffs).toHaveLength(1);
    const diff = diffs[0]!;
    expect(diff.revisionId).toBe(rev.id);
    expect(diff.entries).toHaveLength(2);
    const hypEntry = diff.entries.find((e) => e.objectType === 'hypothesis');
    expect(hypEntry?.changedFields).toEqual(
      expect.arrayContaining(['statement', 'mechanism', 'assumptions', 'predictions', 'version']),
    );
    expect(hypEntry?.summary).toContain('motif-density');
    expect(diff.semanticSummary).toContain(signal.id);
    expect(diff.remainingUncertainties).toContain('motif density may covary with chromatin state');

    // ---- audit event + summary surface the revision ----
    expect(
      store.listEvents(run.id).some((e) => e.type === 'revision_created' && (e.detail as { revisionId?: string }).revisionId === rev.id),
    ).toBe(true);
    expect(summary).toContain(rev.id);
    expect(summary).toContain('qualityDelta=improved');
  });

  it('drops non-existent object references and records them in the summary', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id);
    store.putObject('hypothesis', hyp);
    const signal = seedSignal(run.id, 'feedback referencing ghosts');
    store.putObject('feedback', signal);

    const ghostHyp = ghost('hyp');
    const ghostClm = ghost('clm');
    const { ctx } = makeCtx(run, [
      {
        rawOutput: causalOut(hyp.id, null, [
          { objectType: 'hypothesis', objectId: ghostHyp, reason: 'ghost hypothesis' },
          { objectType: 'claim', objectId: ghostClm, reason: 'ghost claim' },
        ]),
      },
      { rawOutput: hypRevOut },
    ]);
    const outcome = await reviseStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain(ghostHyp);
    expect(summary).toContain(ghostClm);

    const revisions = store.listObjects('revision', run.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.operations).toHaveLength(1);
    expect(revisions[0]?.operations[0]?.objectId).toBe(hyp.id);
  });

  it('persists no revision and stays unconsumed when the analysis names only non-revisable objects', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id);
    const claim = seedClaim(run.id);
    store.putObject('hypothesis', hyp);
    store.putObject('claim', claim);
    const signal = seedSignal(run.id, 'feedback that only touches a claim');
    store.putObject('feedback', signal);

    const { ctx } = makeCtx(run, [
      {
        rawOutput: JSON.stringify({
          affected: [{ objectType: 'claim', objectId: claim.id, reason: 'the feedback weakens this claim' }],
          causalChain: 'the feedback directly questions the claim, which W2 has no automated revision path for',
          expectedQualityDelta: { status: 'inconclusive', claim: 'cannot judge without re-verification' },
        }),
      },
    ]);
    const outcome = await reviseStage.execute(ctx);
    expect(outcome.kind).toBe('done');
    const summary = outcome.kind === 'done' ? outcome.summary : '';
    expect(summary).toContain('no automated revision path');
    expect(summary).toContain(`claim:${claim.id}`);
    expect(store.listObjects('revision', run.id)).toHaveLength(0);
    // the signal is NOT marked consumed — it still needs attention
    expect(await reviseStage.applicable(ctx)).toBe(true);
  });

  it('does not consume the same signal twice (idempotent re-run)', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id);
    store.putObject('hypothesis', hyp);
    const signal = seedSignal(run.id, 'expert feedback');
    store.putObject('feedback', signal);

    const { ctx } = makeCtx(run, [
      { rawOutput: causalOut(hyp.id, null) },
      { rawOutput: hypRevOut },
    ]);
    expect(await reviseStage.applicable(ctx)).toBe(true);
    const first = await reviseStage.execute(ctx);
    expect(first.kind).toBe('done');
    expect(store.getObject('hypothesis', hyp.id)?.version).toBe(1);

    // second pass: nothing left to consume — no extra model call, no second version bump
    expect(await reviseStage.applicable(ctx)).toBe(false);
    const second = await reviseStage.execute(makeCtx(run, []).ctx);
    expect(second).toMatchObject({ kind: 'skipped' });
    expect(second.kind === 'skipped' ? second.reason : '').toMatch(/no unconsumed/);
    expect(store.getObject('hypothesis', hyp.id)?.version).toBe(1);
    expect(store.listObjects('revision', run.id)).toHaveLength(1);

    // feedback stage now reports zero unconsumed signals
    const fb = await feedbackStage.execute(makeCtx(run, []).ctx);
    expect(fb.kind === 'done' ? fb.summary : '').toMatch(/0 unconsumed/);
  });
});

// ---------------------------------------------------------------------------
// CLI: far research feedback
// ---------------------------------------------------------------------------

describe('CLI far research feedback', () => {
  /** Import src/cli/main.js as a real subprocess-like invocation with stubbed argv/cwd. */
  const runCli = async (argvTail: string[], cwd: string) => {
    const prevArgv = process.argv;
    const prevCwd = process.cwd();
    const prevExit = process.exitCode;
    const logs: string[] = [];
    const errs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });
    const errSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(((chunk: unknown) => {
        errs.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);
    let exitCode: string | number | undefined;
    process.argv = ['node', 'main.js', ...argvTail];
    process.chdir(cwd);
    try {
      // cache-busting query so each test runs main() exactly once; @vite-ignore keeps Vite's
      // import analyzer away from the fully-dynamic specifier
      const spec = `../src/cli/main.js?clitest=${Math.random().toString(36).slice(2)}`;
      await import(/* @vite-ignore */ spec);
    } finally {
      exitCode = process.exitCode;
      logSpy.mockRestore();
      errSpy.mockRestore();
      process.argv = prevArgv;
      process.exitCode = prevExit;
      process.chdir(prevCwd);
    }
    return { logs, errs, exitCode };
  };

  const seedCliRun = (dir: string) => {
    fs.mkdirSync(path.join(dir, '.far-run'), { recursive: true });
    const cliDb = openDb(path.join(dir, '.far-run', 'far.db'));
    const cliStore = new Store(cliDb);
    const q = ResearchQuestion.parse({
      id: newId('q'),
      text: 'cli question',
      background: '',
      goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['x'] },
      constraints: {},
      createdAt: new Date().toISOString(),
    });
    const run = cliStore.createRun(q);
    const hyp = seedHypothesis(run.id);
    cliStore.putObject('hypothesis', hyp);
    cliDb.close();
    return { run, hyp };
  };

  it('records a FeedbackSignal + feedback_received event with target validation (--json)', async () => {
    const cliTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cli-'));
    try {
      const { run, hyp } = seedCliRun(cliTmp);
      const { logs, exitCode } = await runCli(
        [
          'research', 'feedback', run.id,
          '--source', 'human_expert',
          '--content', 'expert: duration effect did not replicate',
          '--target-kind', 'hypothesis',
          '--target-id', hyp.id,
          '--json',
        ],
        cliTmp,
      );
      expect(exitCode).toBeUndefined();
      const recorded = JSON.parse(logs[0] ?? '{}') as { recorded?: boolean; feedbackId?: string; runId?: string; source?: string };
      expect(recorded).toMatchObject({ recorded: true, runId: run.id, source: 'human_expert' });
      expect(recorded.feedbackId).toMatch(/^fbk_/);

      const checkDb = openDb(path.join(cliTmp, '.far-run', 'far.db'));
      try {
        const checkStore = new Store(checkDb);
        const signal = checkStore.getObject('feedback', recorded.feedbackId ?? '');
        expect(signal).toMatchObject({
          runId: run.id,
          source: 'human_expert',
          content: 'expert: duration effect did not replicate',
          target: { kind: 'hypothesis', id: hyp.id },
        });
        expect(
          checkStore
            .listEvents(run.id)
            .some((e) => e.type === 'feedback_received' && (e.detail as { feedbackId?: string }).feedbackId === recorded.feedbackId),
        ).toBe(true);
      } finally {
        checkDb.close();
      }
    } finally {
      fs.rmSync(cliTmp, { recursive: true, force: true });
    }
  });

  it('rejects an invalid --source with usage exit code 2', async () => {
    const cliTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cli-'));
    try {
      const { errs, exitCode, logs } = await runCli(
        ['research', 'feedback', ghost('run'), '--source', 'not_a_source', '--content', 'x'],
        cliTmp,
      );
      expect(exitCode).toBe(2);
      expect(errs.join('')).toMatch(/invalid --source/);
      expect(logs).toHaveLength(0);
    } finally {
      fs.rmSync(cliTmp, { recursive: true, force: true });
    }
  });

  it('rejects a --target-id that does not exist (fail-closed)', async () => {
    const cliTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cli-'));
    try {
      const { run } = seedCliRun(cliTmp);
      const { errs, exitCode } = await runCli(
        ['research', 'feedback', run.id, '--source', 'reviewer', '--content', 'x', '--target-kind', 'hypothesis', '--target-id', ghost('hyp')],
        cliTmp,
      );
      expect(exitCode).toBe(2);
      expect(errs.join('')).toMatch(/hypothesis not found/);
    } finally {
      fs.rmSync(cliTmp, { recursive: true, force: true });
    }
  });
});
