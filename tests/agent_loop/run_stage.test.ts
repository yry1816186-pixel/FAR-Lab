/**
 * run_stage.ts 分支覆盖率补全测试。
 *
 * run_stage.ts 当前 line=79.6%, branch=54.5% — 缺少以下分支：
 *   1. MAX_TOKENS_EXCEEDED throw（tokensConsumed >= maxTokensPerRun）
 *   2. STAGE_SCHEMA_INVALID: response.content 非 JSON → throw
 *   3. STAGE_SCHEMA_INVALID: response.content 是 JSON 但 zod parse 失败 → throw
 *   4. extractFinishReasonFromOpenAIChatCompletion: 正常提取 stop/length
 *   5. extractFinishReasonFromOpenAIChatCompletion: raw 非 ChatCompletion → throw
 *   6. extractFinishReasonFromOpenAIChatCompletion: choices 为空 → throw
 *   7. extractFinishReasonFromOpenAIChatCompletion: finish_reason 非法枚举 → throw
 *   8. extractFinishReasonForOfflineReplay: 总是返回 'stop'
 *   9. runStage 正常路径：zod parse 成功 → StageArtifact
 *
 * 单一真实依赖：真实 better-sqlite3 :memory: DB + fake gateway + zod schema。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { z } from 'zod';

import { runMigrations } from '../../src/db/index.ts';
import {
  runStage,
  extractFinishReasonFromOpenAIChatCompletion,
  extractFinishReasonForOfflineReplay,
} from '../../src/agent_loop/run_stage.ts';
import type {
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

function fixtureResponse(content: string, raw?: unknown): LlmResponse {
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
    raw: raw ?? { replayed: true, messageCount: 2 },
  };
}

function createFakeGateway(content: string, raw?: unknown): LlmGateway {
  const response = fixtureResponse(content, raw);
  return {
    register: () => {},
    callLlm: async (_profile: ProviderProfile) => response,
    registeredProfiles: () => [],
  };
}

const termination: TerminationCriteria = {
  maxIterations: 3,
  maxTokensPerRun: 50000,
  maxDurationMs: 10 * 60 * 1000,
};

function makeCtx(opts: {
  readonly gateway: LlmGateway;
  readonly db: Database.Database;
  readonly tokensConsumed?: number;
  readonly maxTokensPerRun?: number;
}): StageContext {
  return {
    runId: 'test-run',
    iteration: 1,
    researchInput: 'test research question',
    gateway: opts.gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a'.repeat(64),
    gitCommitSha: 'test-sha',
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: opts.db,
    prevArtifacts: [],
    feedbackSignal: null,
    termination: {
      ...termination,
      maxTokensPerRun: opts.maxTokensPerRun ?? termination.maxTokensPerRun,
    },
    tokensConsumed: opts.tokensConsumed ?? 0,
  };
}

// 简单 zod schema 供测试
const TestSchema = z.object({
  kind: z.literal('understanding'),
  problemStatement: z.string(),
  scope: z.string(),
  keyTerms: z.array(z.string()),
  falsifiableAngle: z.string(),
});

const VALID_PAYLOAD = {
  kind: 'understanding',
  problemStatement: 'test problem',
  scope: 'test scope',
  keyTerms: ['term1', 'term2'],
  falsifiableAngle: 'test angle',
};

// ---------- runStage 正常路径 ----------

test('runStage 正常路径：合法 JSON content + zod parse 成功 → StageArtifact', async () => {
  const db = openDb();
  try {
    const ctx = makeCtx({
      gateway: createFakeGateway(JSON.stringify(VALID_PAYLOAD)),
      db,
    });
    const artifact = await runStage(
      ctx,
      'stage1_understanding',
      'understanding',
      'narrative',
      TestSchema,
      () => [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }],
    );

    assert.equal(artifact.stageId, 'stage1_understanding');
    assert.equal(artifact.payloadKind, 'understanding');
    assert.equal(artifact.degraded, false);
    assert.equal(artifact.degradationReason, null);
    assert.equal(artifact.structured.kind, 'understanding');
    assert.equal(artifact.structured.problemStatement, 'test problem');
    assert.ok(artifact.callResult, 'callResult 应为 LlmResponse');
  } finally {
    db.close();
  }
});

// ---------- MAX_TOKENS_EXCEEDED ----------

test('runStage 边界：tokensConsumed >= maxTokensPerRun → throw MAX_TOKENS_EXCEEDED', async () => {
  const db = openDb();
  try {
    const ctx = makeCtx({
      gateway: createFakeGateway(JSON.stringify(VALID_PAYLOAD)),
      db,
      tokensConsumed: 1000,
      maxTokensPerRun: 1000,
    });

    await assert.rejects(
      () =>
        runStage(
          ctx,
          'stage1_understanding',
          'understanding',
          'narrative',
          TestSchema,
          () => [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }],
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, 'MAX_TOKENS_EXCEEDED');
        assert.ok((err as Error).message.includes('MAX_TOKENS_EXCEEDED'));
        assert.ok((err as Error).message.includes('1000'));
        return true;
      },
    );
  } finally {
    db.close();
  }
});

test('runStage 边界：tokensConsumed < maxTokensPerRun → 不触发预算闸', async () => {
  const db = openDb();
  try {
    const ctx = makeCtx({
      gateway: createFakeGateway(JSON.stringify(VALID_PAYLOAD)),
      db,
      tokensConsumed: 999,
      maxTokensPerRun: 1000,
    });

    const artifact = await runStage(
      ctx,
      'stage1_understanding',
      'understanding',
      'narrative',
      TestSchema,
      () => [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }],
    );
    assert.equal(artifact.stageId, 'stage1_understanding');
  } finally {
    db.close();
  }
});

// ---------- STAGE_SCHEMA_INVALID ----------

test('runStage 错误路径：response.content 非 JSON → throw STAGE_SCHEMA_INVALID', async () => {
  const db = openDb();
  try {
    const ctx = makeCtx({
      gateway: createFakeGateway('not valid json {{{'),
      db,
    });

    await assert.rejects(
      () =>
        runStage(
          ctx,
          'stage1_understanding',
          'understanding',
          'narrative',
          TestSchema,
          () => [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }],
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, 'STAGE_SCHEMA_INVALID');
        assert.ok((err as Error).message.includes('STAGE_SCHEMA_INVALID'));
        assert.ok((err as Error).message.includes('not valid JSON'));
        return true;
      },
    );
  } finally {
    db.close();
  }
});

test('runStage 错误路径：JSON 合法但 zod parse 失败 → throw STAGE_SCHEMA_INVALID', async () => {
  const db = openDb();
  try {
    const ctx = makeCtx({
      gateway: createFakeGateway(JSON.stringify({ kind: 'wrong', foo: 'bar' })),
      db,
    });

    await assert.rejects(
      () =>
        runStage(
          ctx,
          'stage1_understanding',
          'understanding',
          'narrative',
          TestSchema,
          () => [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }],
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, 'STAGE_SCHEMA_INVALID');
        assert.ok((err as Error).message.includes('zod parse failed'));
        return true;
      },
    );
  } finally {
    db.close();
  }
});

// ---------- extractFinishReasonFromOpenAIChatCompletion ----------

test('extractFinishReasonFromOpenAIChatCompletion: 正常 ChatCompletion → stop', () => {
  const response: LlmResponse = {
    credential: {
      providerProfile: 'competition_aliyun_qwen',
      providerRequestId: 'req-123',
      modelId: 'qwen-test',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    },
    content: 'test',
    raw: {
      choices: [{ finish_reason: 'stop', message: { content: 'test' } }],
    },
  };

  const result = extractFinishReasonFromOpenAIChatCompletion(response);
  assert.equal(result, 'stop');
});

test('extractFinishReasonFromOpenAIChatCompletion: 正常 ChatCompletion → length', () => {
  const response: LlmResponse = fixtureResponse('test', {
    choices: [{ finish_reason: 'length' }],
  });
  const result = extractFinishReasonFromOpenAIChatCompletion(response);
  assert.equal(result, 'length');
});

test('extractFinishReasonFromOpenAIChatCompletion: raw 非 ChatCompletion（无 choices）→ throw', () => {
  const response: LlmResponse = fixtureResponse('test', { foo: 'bar' });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('not ChatCompletion-like'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: raw 为原始类型（非对象）→ throw', () => {
  const response: LlmResponse = fixtureResponse('test', 'not-an-object');
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: raw 为 null → throw', () => {
  const response: LlmResponse = fixtureResponse('test', null);
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('not ChatCompletion-like'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: choices 为空数组 → throw', () => {
  const response: LlmResponse = fixtureResponse('test', { choices: [] });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('empty or non-array'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: choices 非 array → throw', () => {
  const response: LlmResponse = fixtureResponse('test', { choices: 'not-array' });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('empty or non-array'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: finish_reason 非法枚举值 → throw', () => {
  const response: LlmResponse = fixtureResponse('test', {
    choices: [{ finish_reason: 'totally_bogus' }],
  });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('not in FINISH_REASONS enum'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: finish_reason 非字符串 → throw', () => {
  const response: LlmResponse = fixtureResponse('test', {
    choices: [{ finish_reason: 123 }],
  });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('not a string'));
      return true;
    },
  );
});

test('extractFinishReasonFromOpenAIChatCompletion: choices[0] 非对象 → throw', () => {
  const response: LlmResponse = fixtureResponse('test', {
    choices: ['not-an-object'],
  });
  assert.throws(
    () => extractFinishReasonFromOpenAIChatCompletion(response),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('choices[0] is invalid'));
      return true;
    },
  );
});

// ---------- extractFinishReasonForOfflineReplay ----------

test('extractFinishReasonForOfflineReplay: 总是返回 stop', () => {
  const response: LlmResponse = fixtureResponse('test', { replayed: true, messageCount: 5 });
  const result = extractFinishReasonForOfflineReplay(response);
  assert.equal(result, 'stop');
});

test('extractFinishReasonForOfflineReplay: 对任意 response 返回 stop', () => {
  const response: LlmResponse = fixtureResponse('anything', null);
  const result = extractFinishReasonForOfflineReplay(response);
  assert.equal(result, 'stop');
});
