/**
 * stage3_hypothesis + stage4_evidence 单元测试。
 *
 * 历史溯源（已归档）: stage3/4 + §5.3 falsifiability_gate.
 *
 * 测试覆盖：
 *   - HypothesisSchema zod parse 成功（falsificationMethod 必填：gt+value 或 range+lower/upper）
 *   - stage3 falsifiability_gate 硬阻断（claim 为空 → FALSIFIABILITY_GATE_BLOCK）
 *   - stage3 正常通过（合法 HypothesisPayload → kind=hypothesis）
 *   - stage4 payloadKind='experiment' + EvidencePayload 含 conflictingEvidenceCount
 *   - purposeTag 映射（stage3→hypothesis, stage4→narrative）
 *
 * gate 阻断说明：claim 为空时 falsifiabilityGate 抛 FalsifiabilityGateError，runStage3
 * 转换为 FALSIFIABILITY_GATE_BLOCK（AgentLoopError.code）。
 * [已实证] 任务描述建议用 comparator='gt' + value=undefined 触发 gate，但实际实现中
 * toFalsificationSpecAndThreshold 在 gate 之前抛 plain Error（无 code）。改用空 claim
 * 触发 falsifiabilityGate 本体的 FalsifiabilityGateError → FALSIFIABILITY_GATE_BLOCK。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { HypothesisSchema } from '../../src/agent_loop/stages/schemas.ts';
import { runStage3 } from '../../src/agent_loop/stages/stage3_hypothesis.ts';
import { runStage4 } from '../../src/agent_loop/stages/stage4_evidence.ts';
import { STAGE_TO_PURPOSE_TAG } from '../../src/agent_loop/stage_purpose.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import type {
  StageArtifact,
  StageContext,
  TerminationCriteria,
} from '../../src/agent_loop/types.ts';
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
    feedbackSignal: null,
    termination,
    tokensConsumed: 0,
  };
}


// ---------- fixture payloads ----------

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

// claim 为空 → falsifiabilityGate 抛 FalsifiabilityGateError → FALSIFIABILITY_GATE_BLOCK
const hypothesisPayloadGateBlock = {
  kind: 'hypothesis',
  claim: '',
  falsificationMethod: {
    prediction: 'macro_f1 >= 0.85 on held-out test set',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.85,
  },
  supportingCitations: [],
  scopeSlipText: 'scope limited to RR Lyrae subset',
};

const evidencePayload = {
  kind: 'evidence',
  evidenceRecords: [
    {
      evidenceId: 'ev-001',
      supportsOrRefutes: 'supports',
      entailmentScore: 0.92,
      source: { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/x', title: 'Survey of variable star taxonomy' },
    },
    {
      evidenceId: 'ev-002',
      supportsOrRefutes: 'refutes',
      entailmentScore: 0.71,
      source: { evidenceId: 'ev-002', source: 'ads', doi: null, title: 'Counter-evidence atlas' },
    },
  ],
  conflictingEvidenceCount: 1,
};


// ---------- HypothesisSchema zod parse 测试 ----------

test('HypothesisSchema parse 成功：含 falsificationMethod（gt+value 或 range+lower/upper）', () => {
  // comparator='gt' + value → passes
  const gtResult = HypothesisSchema.parse(hypothesisPayloadValid);
  assert.equal(gtResult.kind, 'hypothesis');
  assert.equal(gtResult.falsificationMethod.comparator, 'gt');
  assert.equal(gtResult.falsificationMethod.value, 0.85);

  // comparator='range' + lower/upper → passes
  const rangePayload = {
    kind: 'hypothesis',
    claim: 'Metric falls within expected range',
    falsificationMethod: {
      prediction: '0.80 <= macro_f1 <= 0.90',
      metric: 'macro_f1',
      comparator: 'range',
      lower: 0.80,
      upper: 0.90,
    },
    supportingCitations: [],
    scopeSlipText: 'scope limited to eclipsing binaries',
  };
  const rangeResult = HypothesisSchema.parse(rangePayload);
  assert.equal(rangeResult.falsificationMethod.comparator, 'range');
  assert.equal(rangeResult.falsificationMethod.lower, 0.80);
  assert.equal(rangeResult.falsificationMethod.upper, 0.90);

  // 缺 falsificationMethod → throws
  assert.throws(() =>
    HypothesisSchema.parse({
      kind: 'hypothesis',
      claim: 'test',
      supportingCitations: [],
      scopeSlipText: 'scope',
    }),
  );

  // falsificationMethod 缺 prediction → throws
  assert.throws(() =>
    HypothesisSchema.parse({
      kind: 'hypothesis',
      claim: 'test',
      falsificationMethod: { metric: 'macro_f1', comparator: 'gt', value: 0.85 },
      supportingCitations: [],
      scopeSlipText: 'scope',
    }),
  );
});


// ---------- stage3 falsifiability_gate 硬阻断测试 ----------

test('stage3 falsifiability_gate 硬阻断：claim 为空 → throws FALSIFIABILITY_GATE_BLOCK', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(hypothesisPayloadGateBlock));
    const ctx = makeCtx({ gateway, db });
    await assert.rejects(
      runStage3(ctx),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'thrown value should be Error');
        const code = (err as Error & { code?: unknown }).code;
        assert.equal(code, 'FALSIFIABILITY_GATE_BLOCK');
        return true;
      },
    );
  } finally {
    db.close();
  }
});


// ---------- stage3 正常通过测试 ----------

test('stage3 正常通过：合法 HypothesisPayload（comparator=gt + value=0.85）→ kind=hypothesis', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(hypothesisPayloadValid));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage3(ctx);
    assert.equal(artifact.stageId, 'stage3_hypothesis');
    assert.equal(artifact.payloadKind, 'hypothesis');
    assert.equal(artifact.structured.kind, 'hypothesis');
    assert.equal(artifact.structured.falsificationMethod.comparator, 'gt');
    assert.equal(artifact.structured.falsificationMethod.value, 0.85);
  } finally {
    db.close();
  }
});


// ---------- stage4 payloadKind='experiment' 测试 ----------

test('stage4 payloadKind=experiment：stageId=stage4_evidence, payloadKind=experiment', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(evidencePayload));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage4(ctx);
    assert.equal(artifact.stageId, 'stage4_evidence');
    assert.equal(artifact.payloadKind, 'experiment');
  } finally {
    db.close();
  }
});


// ---------- stage4 EvidencePayload 含 conflictingEvidenceCount 测试 ----------

test('stage4 EvidencePayload 含 conflictingEvidenceCount（number 类型）', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(evidencePayload));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage4(ctx);
    assert.equal(artifact.structured.kind, 'evidence');
    assert.equal(typeof artifact.structured.conflictingEvidenceCount, 'number');
    assert.equal(artifact.structured.conflictingEvidenceCount, 1);
    assert.equal(artifact.structured.evidenceRecords.length, 2);
  } finally {
    db.close();
  }
});


// ---------- purposeTag 映射测试 ----------

test('purposeTag 映射：stage3→hypothesis, stage4→narrative（STAGE_TO_PURPOSE_TAG SSOT）', () => {
  assert.equal(STAGE_TO_PURPOSE_TAG.stage3_hypothesis, 'hypothesis');
  assert.equal(STAGE_TO_PURPOSE_TAG.stage4_evidence, 'narrative');
});
