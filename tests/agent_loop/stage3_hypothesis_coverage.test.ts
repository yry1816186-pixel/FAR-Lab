/**
 * stage3_hypothesis_coverage.test.ts —— stage3 分支补充测试（L2 coverage-batch2）。
 *
 * 目标：src/agent_loop/stages/stage3_hypothesis.ts branch ≥75%（Z16 门禁）。
 * 补齐既有 stage3_4.test.ts 未覆盖的分支：
 *   - toFalsificationSpecAndThreshold：gt/lt/range 成功 + 3 个缺值 throw 分支
 *     （gt 无 value / lt 无 value / range 缺 lower 或 upper）
 *   - buildHypothesisMessages 消费分支（经 runStage3 集成触发）：
 *     prevArtifacts 含 stage2_integration（gaps 非空 + 空两变体）、
 *     feedbackSignal 回灌（refinements 非空 + 空两变体）、
 *     verdictHint 软建议注入（VERDICT_KIND_TO_HINT + sanitizeExternalContent 路径）
 *
 * 铁律：测试期望基于源码实际行为；无空断言。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runStage3, toFalsificationSpecAndThreshold } from '../../src/agent_loop/stages/stage3_hypothesis.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import type {
  StageArtifact,
  StageContext,
  TerminationCriteria,
} from '../../src/agent_loop/types.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';
import type { Verdict } from '../../src/schema/enums.ts';


// ---------- helpers ----------

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
    callLlm: async () => response,
    registeredProfiles: () => [],
  };
}

interface CtxOptions {
  readonly gateway: LlmGateway;
  readonly db: Database.Database;
  readonly prevArtifacts?: readonly StageArtifact[];
  readonly feedbackSignal?: StageContext['feedbackSignal'];
  readonly verdictHint?: Verdict;
}

function makeCtx(opts: CtxOptions): StageContext {
  const termination: TerminationCriteria = {
    maxIterations: 3,
    maxTokensPerRun: 50000,
    maxDurationMs: 10 * 60 * 1000,
  };
  return {
    runId: 'test-run',
    iteration: 1,
    researchInput: 'test research question about variable star classification',
    gateway: opts.gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a'.repeat(64),
    gitCommitSha: 'test-sha',
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: opts.db,
    prevArtifacts: opts.prevArtifacts ?? [],
    feedbackSignal: opts.feedbackSignal ?? null,
    termination,
    tokensConsumed: 0,
    ...(opts.verdictHint === undefined ? {} : { verdictHint: opts.verdictHint }),
  };
}

function integrationArtifact(gaps: readonly string[]): StageArtifact {
  return {
    stageId: 'stage2_integration',
    payloadKind: 'integration',
    structured: {
      kind: 'integration',
      citations: [{ evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' }],
      knowledgeGraphSummary: 'Taxonomy gaps in RR Lyrae.',
      gaps,
    },
    callResult: fixtureResponse('{}'),
    degraded: false,
    degradationReason: null,
  };
}

const hypothesisPayloadValid = {
  kind: 'hypothesis',
  claim: 'Model X achieves macro_f1 >= 0.85 on the RR Lyrae test set',
  falsificationMethod: {
    prediction: 'macro_f1 >= 0.85 on held-out test set',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.85,
  },
  supportingCitations: ['ev-001'],
  scopeSlipText: 'scope limited to RR Lyrae subset',
};


// ---------- toFalsificationSpecAndThreshold（导出·单一转换权威） ----------

test('toFalsificationSpecAndThreshold: comparator=gt + value → thresholdSemantics=gt', () => {
  const { spec, thresholdSpec } = toFalsificationSpecAndThreshold({
    prediction: 'macro_f1 >= 0.85',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.85,
  });
  assert.equal(spec.thresholdSemantics, 'gt');
  assert.equal(spec.falsificationThreshold, 0.85);
  assert.equal(spec.prediction, 'macro_f1 >= 0.85');
  assert.equal(spec.metric, 'macro_f1');
  assert.equal(thresholdSpec, undefined, 'gt 语义不产 thresholdSpec');
});

test('toFalsificationSpecAndThreshold: comparator=gt 缺 value → throw', () => {
  assert.throws(
    () =>
      toFalsificationSpecAndThreshold({
        prediction: 'p',
        metric: 'm',
        comparator: 'gt',
      }),
    /comparator='gt' requires value/,
  );
});

test('toFalsificationSpecAndThreshold: comparator=lt + value → thresholdSemantics=lt', () => {
  const { spec, thresholdSpec } = toFalsificationSpecAndThreshold({
    prediction: 'rmse <= 0.10',
    metric: 'rmse',
    comparator: 'lt',
    value: 0.1,
  });
  assert.equal(spec.thresholdSemantics, 'lt');
  assert.equal(spec.falsificationThreshold, 0.1);
  assert.equal(thresholdSpec, undefined, 'lt 语义不产 thresholdSpec');
});

test('toFalsificationSpecAndThreshold: comparator=lt 缺 value → throw', () => {
  assert.throws(
    () =>
      toFalsificationSpecAndThreshold({
        prediction: 'p',
        metric: 'm',
        comparator: 'lt',
      }),
    /comparator='lt' requires value/,
  );
});

test('toFalsificationSpecAndThreshold: comparator=range + lower/upper → thresholdSpec', () => {
  const { spec, thresholdSpec } = toFalsificationSpecAndThreshold({
    prediction: '0.80 <= macro_f1 <= 0.90',
    metric: 'macro_f1',
    comparator: 'range',
    lower: 0.8,
    upper: 0.9,
  });
  assert.equal(spec.thresholdSemantics, 'range');
  assert.equal(spec.falsificationThreshold, 0, 'range 语义 falsificationThreshold 为 0 占位');
  assert.ok(thresholdSpec !== undefined, 'range 语义必须产 thresholdSpec');
  assert.equal(thresholdSpec.semantics, 'range');
  assert.equal(thresholdSpec.lower, 0.8);
  assert.equal(thresholdSpec.upper, 0.9);
});

test('toFalsificationSpecAndThreshold: comparator=range 缺 lower 或 upper → throw', () => {
  assert.throws(
    () =>
      toFalsificationSpecAndThreshold({
        prediction: 'p',
        metric: 'm',
        comparator: 'range',
        upper: 0.9,
      }),
    /comparator='range' requires lower and upper/,
  );
  assert.throws(
    () =>
      toFalsificationSpecAndThreshold({
        prediction: 'p',
        metric: 'm',
        comparator: 'range',
        lower: 0.8,
      }),
    /comparator='range' requires lower and upper/,
  );
});


// ---------- runStage3 集成：buildHypothesisMessages 消费分支 ----------

test('stage3: 消费 stage2 产物（gaps 非空）+ feedbackSignal（refinements 非空）+ verdictHint', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(hypothesisPayloadValid));
    const ctx = makeCtx({
      gateway,
      db,
      prevArtifacts: [integrationArtifact(['Limited labeled data', 'No cross-matching catalog'])],
      feedbackSignal: {
        continueIteration: true,
        iterationNumber: 2,
        maxIterations: 3,
        refinements: ['Refine hypothesis direction', 'Tighten scope'],
      },
      verdictHint: 'REFUTED',
    });
    const artifact = await runStage3(ctx);
    assert.equal(artifact.stageId, 'stage3_hypothesis');
    assert.equal(artifact.structured.kind, 'hypothesis');
    assert.equal(artifact.structured.falsificationMethod.comparator, 'gt');
  } finally {
    db.close();
  }
});

test('stage3: 消费 stage2 产物（gaps 空）+ feedbackSignal（refinements 空）', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(hypothesisPayloadValid));
    const ctx = makeCtx({
      gateway,
      db,
      prevArtifacts: [integrationArtifact([])],
      feedbackSignal: {
        continueIteration: false,
        iterationNumber: 1,
        maxIterations: 3,
        refinements: [],
      },
    });
    const artifact = await runStage3(ctx);
    assert.equal(artifact.structured.kind, 'hypothesis');
    assert.equal(artifact.structured.claim, hypothesisPayloadValid.claim);
  } finally {
    db.close();
  }
});

test('stage3: 无 stage2 产物 + 无 feedbackSignal（findPrevIntegration 返回 undefined·空 gaps 不注入）', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(hypothesisPayloadValid));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage3(ctx);
    assert.equal(artifact.structured.kind, 'hypothesis');
    assert.equal(artifact.degraded, false);
  } finally {
    db.close();
  }
});
