import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { reviseStage } from '../src/pipeline/stages/revise.js';
import { countSemanticRevisions, computeIterationSnapshot } from '../src/app/iteration.js';
import { IterationSnapshot } from '../src/domain/index.js';
import {
  FeedbackSignal,
  HypothesisCandidate,
  IterationRecord,
  ResearchQuestion,
  ResearchRun,
  VersionDiff,
  newId,
} from '../src/domain/index.js';
import type { RunId } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import type { ModelProvider } from '../src/shared/ports.js';

// *** TEST FIXTURES ONLY *** — scripted TestStubProvider steps, throwaway temp sqlite.

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-revquality-'));
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

const seedRun = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'test question',
    background: '',
    goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['x'] },
    constraints: {},
    createdAt: ts(1),
  });
  const now = ts(0);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'revise',
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

const seedHypothesis = (runId: RunId, testability: 'testable_with_data' | 'unfalsifiable') =>
  HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement: 'original statement about the mechanism',
    mechanism: 'original causal mechanism',
    derivation: { strategy: 'evidence_conditioned', rationale: 'seeded', inputClaimIds: [] },
    assumptions: [{ id: 'a0', statement: 'load-bearing assumption', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['original prediction'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'mixed',
    testability,
    clusterKey: 'k',
    distinctnessRationale: 'differs by mechanism',
    createdAt: ts(2),
  });

const makeCtx = (run: ResearchRun, steps: Parameters<typeof createTestStubProvider>[0]) => {
  const provider: ModelProvider = createTestStubProvider(steps);
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider,
    sourceFor: () => {
      throw new Error('sources not used');
    },
    recordReceipt: () => {},
    cancelled: () => false,
    log: () => {},
  };
  return ctx;
};

const seedSignal = (runId: RunId) =>
  FeedbackSignal.parse({
    id: newId('fbk'),
    runId,
    source: 'human_expert',
    content: 'expert: the mechanism premise is wrong',
    provenance: 'test fixture',
    receivedAt: ts(4),
  });

const causalOut = (hypId: string) =>
  JSON.stringify({
    affected: [{ objectType: 'hypothesis', objectId: hypId, reason: 'the feedback invalidates the mechanism premise' }],
    causalChain: 'the feedback removes the premise, forcing the hypothesis to change',
    expectedQualityDelta: { status: 'inconclusive', claim: 'cannot promise improvement' },
  });

const hypRevOut = JSON.stringify({
  statement: 'revised statement with a different mechanism',
  mechanism: 'revised causal mechanism keyed to the feedback',
  assumptions: [{ statement: 'load-bearing assumption', kind: 'empirical' }],
  predictions: ['revised prediction'],
  addedUncertainties: [],
  revisionRationale: 'mechanism replaced under feedback pressure',
});

// ---------------------------------------------------------------------------
// pure counting: semantic vs cosmetic revisions
// ---------------------------------------------------------------------------

describe('countSemanticRevisions (deterministic material-delta input)', () => {
  const putDiff = (entries: Array<{ objectType: 'hypothesis' | 'plan'; changedFields: string[]; semanticFlags: string[] }>) => {
    store.putObject(
      'version_diff',
      VersionDiff.parse({
        revisionId: newId('rev'),
        runId: 'run_xxxxxxxxxxxxxxxxxxxxxxxxxx' as never,
        entries: entries.map((e, i) => ({
          objectType: e.objectType,
          objectId: `obj_${i}`,
          summary: 'fixture',
          changedFields: e.changedFields,
          patchOps: [],
          semanticFlags: e.semanticFlags,
        })),
        semanticSummary: 'fixture',
        remainingUncertainties: [],
      }),
    );
  };

  it('cosmetic revisions (bookkeeping fields only) count as zero semantic changes', () => {
    putDiff([{ objectType: 'hypothesis', changedFields: ['version', 'uncertainties'], semanticFlags: [] }]);
    expect(countSemanticRevisions(store, 'run_xxxxxxxxxxxxxxxxxxxxxxxxxx' as never)).toBe(0);
  });

  it('scope-field changes and predicate violations each count once', () => {
    putDiff([
      { objectType: 'hypothesis', changedFields: ['statement'], semanticFlags: [] },
      { objectType: 'hypothesis', changedFields: ['version'], semanticFlags: ['falsifiability_retained:false'] },
      { objectType: 'plan', changedFields: ['metrics', 'executabilityCheck'], semanticFlags: [] },
      { objectType: 'plan', changedFields: ['executabilityCheck'], semanticFlags: ['decision_rules_preserved:false'] },
    ]);
    expect(countSemanticRevisions(store, 'run_xxxxxxxxxxxxxxxxxxxxxxxxxx' as never)).toBe(4);
  });

  it('IterationSnapshot defaults semanticRevisionChanges to 0 for legacy records', () => {
    const legacy = IterationSnapshot.parse({
      round: 1, claims: 0, verifiedClaims: 0, hypotheses: 0, hypothesisVersionSum: 0,
      scorecards: 0, plans: 0, revisions: 0, experimentRunsCompleted: 0,
      feedbackSignals: 0, feedbackConsumed: 0, effectEstimates: 0, fingerprint: 'deadbeefdeadbeef',
    });
    expect(legacy.semanticRevisionChanges).toBe(0);
    // IterationRecord.parse on a legacy snapshot payload still succeeds (back-compat)
    expect(() =>
      IterationRecord.parse({
        id: newId('itr'), runId: 'run_xxxxxxxxxxxxxxxxxxxxxxxxxx' as never, round: 1, decidedAt: ts(5), decision: 'stop',
        stopReason: { kind: 'no_actionable_work' }, reopenStages: [], rationale: 'x',
        snapshot: legacy, unblockHints: [],
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stage wiring: predicate flags + disclosure on the revised object
// ---------------------------------------------------------------------------

describe('revise stage wires the deterministic revision predicates', () => {
  it('flags falsifiability not retained when the pre-revision hypothesis was already unfalsifiable', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id, 'unfalsifiable');
    store.putObject('hypothesis', hyp);
    const signal = seedSignal(run.id);
    store.putObject('feedback', signal);
    const ctx = makeCtx(run, [{ rawOutput: causalOut(hyp.id) }, { rawOutput: hypRevOut }]);

    const outcome = await reviseStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const revised = store.getObject('hypothesis', hyp.id);
    expect(revised?.version).toBe(1);
    // disclosure rides the object monotonically (never erased)
    expect(revised?.uncertainties.some((u) => u.includes('falsifiability NOT retained'))).toBe(true);
    // deterministic flags ride the version-diff entry for downstream consumers
    const diff = store.listObjects('version_diff', run.id)[0]!;
    const entry = diff.entries.find((e) => e.objectType === 'hypothesis')!;
    expect(entry.semanticFlags).toContain('falsifiability_retained:false');
    expect(entry.semanticFlags).toContain('decision_rules_preserved:true');
    expect(entry.semanticFlags.some((f) => f.startsWith('scope_delta:'))).toBe(true);
    // the stage summary surfaces the violation visibly
    expect(outcome.kind === 'done' ? outcome.summary : '').toContain('did NOT retain falsifiability');
    // and the iteration controller sees this as SEMANTIC (violation counts even though
    // scope fields also changed here — the point is the count is predicate-aware)
    expect(countSemanticRevisions(store, run.id)).toBeGreaterThanOrEqual(1);
  });

  it('a healthy revision carries retained:true flags and a scope delta naming the changed fields', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id, 'testable_with_data');
    store.putObject('hypothesis', hyp);
    const signal = seedSignal(run.id);
    store.putObject('feedback', signal);
    const ctx = makeCtx(run, [{ rawOutput: causalOut(hyp.id) }, { rawOutput: hypRevOut }]);

    const outcome = await reviseStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const diff = store.listObjects('version_diff', run.id)[0]!;
    const entry = diff.entries.find((e) => e.objectType === 'hypothesis')!;
    expect(entry.semanticFlags).toContain('falsifiability_retained:true');
    expect(entry.semanticFlags).toContain('decision_rules_preserved:true');
    expect(entry.semanticFlags).toContain('scope_delta:statement+mechanism+predictions');
    const revised = store.getObject('hypothesis', hyp.id);
    expect(revised?.uncertainties.some((u) => u.includes('NOT retained'))).toBe(false);
  });

  it('computeIterationSnapshot folds semanticRevisionChanges into the material fingerprint', async () => {
    const { run } = seedRun();
    const hyp = seedHypothesis(run.id, 'testable_with_data');
    store.putObject('hypothesis', hyp);
    const signal = seedSignal(run.id);
    store.putObject('feedback', signal);
    const ctx = makeCtx(run, [{ rawOutput: causalOut(hyp.id) }, { rawOutput: hypRevOut }]);
    await reviseStage.execute(ctx);

    const snap = computeIterationSnapshot(store, run.id, 1);
    // one hypothesis revision entry with scope fields changed; no plan in this fixture
    expect(snap.semanticRevisionChanges).toBe(1);
  });
});
