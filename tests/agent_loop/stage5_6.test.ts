/**
 * stage5_plan + stage6_feedback + paper_assembler 单元测试。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §2 stage5/6 + §5.5 paper_assembler.
 *
 * 测试覆盖：
 *   - PlanSchema zod parse 成功（datasetChoices/methodChoices/scheduleOrFeedback/executableChecks）
 *   - stage5 payloadKind='plan'
 *   - stage6 产 FeedbackSignal（continueIteration=false）
 *   - stage6 maxIterations 硬收敛覆写（iteration >= maxIterations 时 LLM continue=true → 覆写为 false）
 *   - paperAssembler 10 字段全部派生 + iterationCount === feedback.feedbackSignal.iterationNumber
 *   - paperAssembler finalVerdict='UNTESTED'（verdictNode=null）
 *   - paperAssembler 降级（缺 hypothesis/understanding → 10 字段 + problemStatement 为空）
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { PlanSchema } from '../../src/agent_loop/stages/schemas.ts';
import { runStage5 } from '../../src/agent_loop/stages/stage5_plan.ts';
import { runStage6 } from '../../src/agent_loop/stages/stage6_feedback.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import type {
  EvidencePayload,
  FeedbackPayload,
  HypothesisPayload,
  IntegrationPayload,
  LoopState,
  PlanPayload,
  ResearchPaperOutput,
  StageArtifact,
  StageContext,
  StageId,
  TerminationCriteria,
  UnderstandingPayload,
} from '../../src/agent_loop/types.ts';
import type { PayloadKind } from '../../src/schema/enums.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';


// ---------- 共享 helpers ----------

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function fixtureResponse(content: string): LlmResponse {
  return {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'test-fixture-model',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content,
    raw: { replayed: true, messageCount: 2 },
  };
}

function createFakeGateway(content: string): LlmGateway {
  const response = fixtureResponse(content);
  return {
    register: () => {},
    callLlm: async (_profile: ProviderProfile) => response,
    registeredProfiles: () => [],
  };
}

interface CtxOptions {
  readonly gateway: LlmGateway;
  readonly db: Database.Database;
  readonly prevArtifacts?: readonly StageArtifact[];
  readonly iteration?: number;
  readonly maxIterations?: number;
}

function makeCtx(opts: CtxOptions): StageContext {
  const termination: TerminationCriteria = {
    maxIterations: opts.maxIterations ?? 3,
    maxTokensPerRun: 50000,
    maxDurationMs: 10 * 60 * 1000,
  };
  return {
    runId: 'test-run',
    iteration: opts.iteration ?? 1,
    researchInput: 'test research question about variable star classification',
    gateway: opts.gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a'.repeat(64),
    gitCommitSha: 'test-sha',
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: opts.db,
    prevArtifacts: opts.prevArtifacts ?? [],
    feedbackSignal: null,
    termination,
    tokensConsumed: 0,
  };
}


// ---------- fixture payloads ----------

const planPayload = {
  kind: 'plan',
  datasetChoices: ['ASAS-SN catalog', 'Gaia DR3'],
  methodChoices: ['Random Forest classifier', 'LightGBM'],
  scheduleOrFeedback: 'Train on 80% split, validate on 20% held-out',
  executableChecks: [
    { ref: 'https://asas-sn.osu.edu', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' },
    { ref: 'https://gaia.esac.esa.int', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' },
  ],
};

const feedbackPayloadConverge = {
  kind: 'feedback',
  feedbackSignal: {
    continueIteration: false,
    iterationNumber: 2,
    maxIterations: 3,
    refinements: [],
  },
  iterationSummary: 'Converged: hypothesis is sufficiently refined',
};

const feedbackPayloadContinue = {
  kind: 'feedback',
  feedbackSignal: {
    continueIteration: true,
    iterationNumber: 5,
    maxIterations: 3,
    refinements: ['Need more evidence on eclipsing binaries'],
  },
  iterationSummary: 'Iteration 5: LLM wants to continue refining',
};


// ---------- PlanSchema zod parse 测试 ----------

test('PlanSchema parse 成功：含 datasetChoices/methodChoices/scheduleOrFeedback/executableChecks', () => {
  const result = PlanSchema.parse(planPayload);
  assert.equal(result.kind, 'plan');
  assert.deepEqual([...result.datasetChoices], ['ASAS-SN catalog', 'Gaia DR3']);
  assert.deepEqual([...result.methodChoices], ['Random Forest classifier', 'LightGBM']);
  assert.equal(result.scheduleOrFeedback, planPayload.scheduleOrFeedback);
  assert.equal(result.executableChecks.length, 2);
  assert.equal(result.executableChecks[0]?.ref, 'https://asas-sn.osu.edu');
  assert.equal(result.executableChecks[0]?.exists, true);

  // 缺 executableChecks → throws
  assert.throws(() =>
    PlanSchema.parse({
      kind: 'plan',
      datasetChoices: [],
      methodChoices: [],
      scheduleOrFeedback: 's',
    }),
  );

  // executableChecks 元素缺 exists → throws
  assert.throws(() =>
    PlanSchema.parse({
      kind: 'plan',
      datasetChoices: [],
      methodChoices: [],
      scheduleOrFeedback: 's',
      executableChecks: [{ ref: 'url', checkedAt: 'ts' }],
    }),
  );
});


// ---------- stage5 payloadKind='plan' 测试 ----------

test('stage5 payloadKind=plan：stageId=stage5_plan, payloadKind=plan', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(planPayload));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage5(ctx);
    assert.equal(artifact.stageId, 'stage5_plan');
    assert.equal(artifact.payloadKind, 'plan');
    assert.equal(artifact.structured.kind, 'plan');
    assert.deepEqual([...artifact.structured.datasetChoices], ['ASAS-SN catalog', 'Gaia DR3']);
  } finally {
    db.close();
  }
});


// ---------- stage6 产 FeedbackSignal 测试 ----------

test('stage6 产 FeedbackSignal：continueIteration=false → kind=feedback', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(feedbackPayloadConverge));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage6(ctx);
    assert.equal(artifact.stageId, 'stage6_feedback');
    assert.equal(artifact.payloadKind, 'feedback');
    assert.equal(artifact.structured.kind, 'feedback');
    assert.equal(artifact.structured.feedbackSignal.continueIteration, false);
    assert.equal(artifact.structured.feedbackSignal.iterationNumber, 2);
  } finally {
    db.close();
  }
});


// ---------- stage6 maxIterations 硬收敛覆写测试 ----------

test('stage6 maxIterations 硬收敛：iteration=5 >= maxIterations=3, LLM continue=true → 覆写为 false + FORCED CONVERGENCE', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(feedbackPayloadContinue));
    const ctx = makeCtx({ gateway, db, iteration: 5, maxIterations: 3 });
    const artifact = await runStage6(ctx);
    assert.equal(artifact.structured.kind, 'feedback');
    assert.equal(
      artifact.structured.feedbackSignal.continueIteration,
      false,
      'continueIteration should be overwritten to false when iteration >= maxIterations',
    );
    assert.ok(
      artifact.structured.iterationSummary.includes('FORCED CONVERGENCE'),
      'iterationSummary should contain FORCED CONVERGENCE marker',
    );
  } finally {
    db.close();
  }
});


// ---------- paperAssembler 测试 helpers ----------

function makeArtifact(
  stageId: StageId,
  payloadKind: PayloadKind,
  structured: import('../../src/agent_loop/types.ts').StructuredPayload,
): StageArtifact {
  return {
    stageId,
    payloadKind,
    structured,
    callResult: fixtureResponse(''),
    degraded: false,
    degradationReason: null,
  };
}

function buildFullLoopState(): LoopState {
  const understanding: UnderstandingPayload = {
    kind: 'understanding',
    problemStatement: 'How to classify variable stars with limited labeled data',
    scope: 'Astronomy variable star classification',
    keyTerms: ['variable star', 'light curve'],
    falsifiableAngle: 'Testable via macro_f1 on held-out set',
  };
  const integration: IntegrationPayload = {
    kind: 'integration',
    citations: [
      { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/x', title: 'Survey of variable star taxonomy' },
    ],
    knowledgeGraphSummary: 'Maps onto RR Lyrae sub-classification gaps',
    gaps: ['Limited labeled data for rare sub-classes'],
  };
  const hypothesis: HypothesisPayload = {
    kind: 'hypothesis',
    claim: 'Model X achieves macro_f1 >= 0.85 on RR Lyrae test set',
    falsificationMethod: {
      prediction: 'macro_f1 >= 0.85',
      metric: 'macro_f1',
      comparator: 'gt',
      value: 0.85,
    },
    supportingCitations: ['ev-001'],
    scopeSlipText: 'scope limited to RR Lyrae',
  };
  const evidence: EvidencePayload = {
    kind: 'evidence',
    evidenceRecords: [
      {
        evidenceId: 'ev-001',
        supportsOrRefutes: 'supports',
        entailmentScore: 0.92,
        source: { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/x', title: 'Survey of variable star taxonomy' },
      },
    ],
    conflictingEvidenceCount: 0,
  };
  const plan: PlanPayload = {
    kind: 'plan',
    datasetChoices: ['ASAS-SN', 'Gaia DR3'],
    methodChoices: ['Random Forest', 'LightGBM'],
    scheduleOrFeedback: 'Train on 80%, validate on 20%',
    executableChecks: [
      { ref: 'https://asas-sn.osu.edu', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' },
    ],
  };
  const feedback: FeedbackPayload = {
    kind: 'feedback',
    feedbackSignal: {
      continueIteration: false,
      iterationNumber: 2,
      maxIterations: 3,
      refinements: [],
    },
    iterationSummary: 'Converged',
  };

  const artifacts: readonly StageArtifact[] = [
    makeArtifact('stage1_understanding', 'understanding', understanding),
    makeArtifact('stage2_integration', 'integration', integration),
    makeArtifact('stage3_hypothesis', 'hypothesis', hypothesis),
    makeArtifact('stage4_evidence', 'experiment', evidence),
    makeArtifact('stage5_plan', 'plan', plan),
    makeArtifact('stage6_feedback', 'feedback', feedback),
  ];

  return {
    runId: 'test-run',
    iterationsCompleted: 2,
    terminated: true,
    terminationReason: 'feedback_converged',
    artifacts,
    verdictNode: null,
    error: null,
  };
}


// ---------- paperAssembler 10 字段全部派生测试 ----------

test('paperAssembler 10 字段全部派生 + iterationCount === feedback.feedbackSignal.iterationNumber', () => {
  const state = buildFullLoopState();
  const paper: ResearchPaperOutput = assemblePaper(state);

  // 断言 10 字段全部存在
  assert.equal(typeof paper.paperTitle, 'string');
  assert.ok(paper.paperTitle.length > 0, 'paperTitle should be non-empty');
  assert.equal(typeof paper.paperAbstract, 'string');
  assert.equal(typeof paper.problemStatement, 'string');
  assert.ok(paper.problemStatement.length > 0, 'problemStatement should be non-empty');
  assert.equal(typeof paper.rationale, 'string');
  assert.equal(typeof paper.technicalDetails, 'string');
  assert.ok(Array.isArray(paper.datasets.source));
  assert.ok(Array.isArray(paper.datasets.target));
  assert.ok(Array.isArray(paper.methods));
  assert.ok(Array.isArray(paper.experiments.baselines));
  assert.ok(Array.isArray(paper.experiments.metrics));
  assert.equal(typeof paper.experiments.expectedOutcome, 'string');
  assert.equal(typeof paper.results, 'string');
  assert.ok(Array.isArray(paper.references));

  // iterationCount === feedback.feedbackSignal.iterationNumber
  assert.equal(paper.iterationCount, 2);

  // finalVerdict === UNTESTED（verdictNode=null）
  assert.equal(paper.finalVerdict, 'UNTESTED');
});


// ---------- paperAssembler finalVerdict='UNTESTED' 测试 ----------

test('paperAssembler finalVerdict=UNTESTED（verdictNode=null 时）', () => {
  const state = buildFullLoopState();
  assert.equal(state.verdictNode, null);
  const paper = assemblePaper(state);
  assert.equal(paper.finalVerdict, 'UNTESTED');
});


// ---------- paperAssembler 降级测试 ----------

test('paperAssembler 降级：缺 hypothesis/understanding → 10 字段全存在 + problemStatement 为空字符串', () => {
  const degradedState: LoopState = {
    runId: 'test-run-degraded',
    iterationsCompleted: 0,
    terminated: true,
    terminationReason: 'error',
    artifacts: [],
    verdictNode: null,
    error: null,
  };
  const paper = assemblePaper(degradedState);

  // 10 字段全部存在（降级为空字符串/空数组·不抛错）
  assert.equal(typeof paper.paperTitle, 'string');
  assert.equal(paper.paperTitle, 'Untitled Research');
  assert.equal(typeof paper.paperAbstract, 'string');
  assert.equal(paper.paperAbstract, '');
  assert.equal(paper.problemStatement, '');
  assert.equal(typeof paper.rationale, 'string');
  assert.equal(typeof paper.technicalDetails, 'string');
  assert.equal(typeof paper.results, 'string');
  assert.ok(Array.isArray(paper.datasets.source));
  assert.equal(paper.datasets.source.length, 0);
  assert.ok(Array.isArray(paper.datasets.target));
  assert.equal(paper.datasets.target.length, 0);
  assert.ok(Array.isArray(paper.methods));
  assert.ok(Array.isArray(paper.references));
  assert.equal(paper.finalVerdict, 'UNTESTED');
});
