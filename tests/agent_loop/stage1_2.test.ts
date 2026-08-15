/**
 * stage1_understanding + stage2_integration 单元测试。
 *
 * 历史溯源（已归档）: stage1/2 + §5.2 执行器要点.
 *
 * 测试覆盖：
 *   - UnderstandingSchema zod parse 成功/失败（缺 kind / kind 错值 / problemStatement 类型错）
 *   - IntegrationSchema zod parse 成功 + citations 字段类型（evidenceId + source 8 值枚举 + doi + title）
 *   - runStage1 / runStage2 端到端（fake gateway + :memory: DB + 落 evidence_log）
 *   - purposeTag 映射（STAGE_TO_PURPOSE_TAG：stage1→narrative, stage2→narrative）
 *
 * fake gateway 说明：用结构化类型直接构造 LlmGateway 接口实现（禁双重断言·
 * 零容忍 #1）。callLlm 返回固定 LlmResponse（含合法 JSON content·供 zod parse 收窄）。
 * reproHashProvider 返回占位 hash（测试用·生产路径禁伪造 hash·须接 03 calc_bridge）。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  IntegrationSchema,
  UnderstandingSchema,
} from '../../src/agent_loop/stages/schemas.ts';
import { runStage1 } from '../../src/agent_loop/stages/stage1_understanding.ts';
import { runStage2 } from '../../src/agent_loop/stages/stage2_integration.ts';
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

const understandingPayload = {
  kind: 'understanding',
  problemStatement: 'How to classify variable stars with limited labeled data',
  scope: 'Astronomy variable star classification via light curve features',
  keyTerms: ['variable star', 'light curve', 'macro_f1'],
  falsifiableAngle: 'Testable via macro_f1 metric on held-out labeled set',
};

const integrationPayload = {
  kind: 'integration',
  citations: [
    { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/astro.2026.001', title: 'Survey of variable star taxonomy' },
    { evidenceId: 'ev-002', source: 'ads', doi: null, title: 'Light curve feature extraction atlas' },
  ],
  knowledgeGraphSummary: 'The problem maps onto existing taxonomy gaps in RR Lyrae sub-classification.',
  gaps: ['Limited labeled data for rare sub-classes', 'Feature extraction robustness under noise'],
};


// ---------- UnderstandingSchema zod parse 测试 ----------

test('UnderstandingSchema parse 成功：合法 understanding payload（含 kind + problemStatement + scope + keyTerms + falsifiableAngle）', () => {
  const result = UnderstandingSchema.parse(understandingPayload);
  assert.equal(result.kind, 'understanding');
  assert.equal(result.problemStatement, understandingPayload.problemStatement);
  assert.equal(result.scope, understandingPayload.scope);
  assert.deepEqual([...result.keyTerms], [...understandingPayload.keyTerms]);
  assert.equal(result.falsifiableAngle, understandingPayload.falsifiableAngle);
});


test('UnderstandingSchema parse 失败：缺 kind 字段 → throws', () => {
  const missingKind = {
    problemStatement: 'test',
    scope: 'test',
    keyTerms: ['t'],
    falsifiableAngle: null,
  };
  assert.throws(() => UnderstandingSchema.parse(missingKind));
});


test('UnderstandingSchema parse 失败：kind 不是 "understanding" → throws', () => {
  const wrongKind = {
    kind: 'integration',
    problemStatement: 'test',
    scope: 'test',
    keyTerms: ['t'],
    falsifiableAngle: null,
  };
  assert.throws(() => UnderstandingSchema.parse(wrongKind));
});


test('UnderstandingSchema parse 失败：problemStatement 不是 string → throws', () => {
  const wrongType = {
    kind: 'understanding',
    problemStatement: 123,
    scope: 'test',
    keyTerms: ['t'],
    falsifiableAngle: null,
  };
  assert.throws(() => UnderstandingSchema.parse(wrongType));
});


// ---------- IntegrationSchema zod parse 测试 ----------

test('IntegrationSchema parse 成功：合法 integration payload（含 citations + knowledgeGraphSummary + gaps）', () => {
  const result = IntegrationSchema.parse(integrationPayload);
  assert.equal(result.kind, 'integration');
  assert.equal(result.citations.length, 2);
  assert.equal(result.knowledgeGraphSummary, integrationPayload.knowledgeGraphSummary);
  assert.deepEqual([...result.gaps], [...integrationPayload.gaps]);
});


test('IntegrationSchema citations 字段类型：evidenceId(string) + source(enum 8 值) + doi(string|null) + title(string)', () => {
  const allSources = ['arxiv', 'ads', 's2', 'tns', 'gcvs', 'aavso', 'gaia', 'other'] as const;
  const validCitations = allSources.map((src, i) => ({
    evidenceId: `ev-${i}`,
    source: src,
    doi: i % 2 === 0 ? `10.1234/${src}` : null,
    title: `Title ${i}`,
  }));
  const valid = IntegrationSchema.parse({
    kind: 'integration',
    citations: validCitations,
    knowledgeGraphSummary: 'summary',
    gaps: [],
  });
  assert.equal(valid.citations.length, 8);

  assert.throws(() =>
    IntegrationSchema.parse({
      kind: 'integration',
      citations: [{ evidenceId: 'ev', source: 'invalid_source', doi: null, title: 't' }],
      knowledgeGraphSummary: 's',
      gaps: [],
    }),
  );

  assert.throws(() =>
    IntegrationSchema.parse({
      kind: 'integration',
      citations: [{ source: 'arxiv', doi: null, title: 't' }],
      knowledgeGraphSummary: 's',
      gaps: [],
    }),
  );

  assert.throws(() =>
    IntegrationSchema.parse({
      kind: 'integration',
      citations: [{ evidenceId: 'ev', source: 'arxiv', doi: 123, title: 't' }],
      knowledgeGraphSummary: 's',
      gaps: [],
    }),
  );

  assert.throws(() =>
    IntegrationSchema.parse({
      kind: 'integration',
      citations: [{ evidenceId: 'ev', source: 'arxiv', doi: null }],
      knowledgeGraphSummary: 's',
      gaps: [],
    }),
  );
});


// ---------- runStage1 端到端测试 ----------

test('runStage1：fake gateway 返回合法 UnderstandingPayload → StageArtifact', async () => {
  const db = openDb();
  try {
    const gateway = createFakeGateway(JSON.stringify(understandingPayload));
    const ctx = makeCtx({ gateway, db });
    const artifact = await runStage1(ctx);
    assert.equal(artifact.stageId, 'stage1_understanding');
    assert.equal(artifact.payloadKind, 'understanding');
    assert.equal(artifact.structured.kind, 'understanding');
    assert.equal(typeof artifact.structured.problemStatement, 'string');
    assert.equal(artifact.degraded, false);
    assert.equal(artifact.degradationReason, null);
  } finally {
    db.close();
  }
});


// ---------- runStage2 端到端测试（消费 stage1 产物） ----------

test('runStage2：prevArtifacts 含 stage1 产物 → StageArtifact（stage2_integration + kind=integration）', async () => {
  const db = openDb();
  try {
    const gateway1 = createFakeGateway(JSON.stringify(understandingPayload));
    const ctx1 = makeCtx({ gateway: gateway1, db });
    const stage1Artifact = await runStage1(ctx1);

    const gateway2 = createFakeGateway(JSON.stringify(integrationPayload));
    const ctx2 = makeCtx({ gateway: gateway2, db, prevArtifacts: [stage1Artifact] });
    const artifact = await runStage2(ctx2);
    assert.equal(artifact.stageId, 'stage2_integration');
    assert.equal(artifact.payloadKind, 'integration');
    assert.equal(artifact.structured.kind, 'integration');
  } finally {
    db.close();
  }
});


// ---------- purposeTag 映射测试 ----------

test('purposeTag 映射：stage1→narrative, stage2→narrative（STAGE_TO_PURPOSE_TAG SSOT）', () => {
  assert.equal(STAGE_TO_PURPOSE_TAG.stage1_understanding, 'narrative');
  assert.equal(STAGE_TO_PURPOSE_TAG.stage2_integration, 'narrative');
});
