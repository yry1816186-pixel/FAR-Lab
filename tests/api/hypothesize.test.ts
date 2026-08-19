/**
 * hypothesize 路由测试——POST /api/v1/hypothesize（24§5 / 17 Epic K-01）。
 *
 *
 * 覆盖：
 *   - 成功路径：返回 200 + loopState + graphSubtree + honestVerdict + reproHash
 *   - 400 on empty researchInput
 *   - 400 on missing researchInput
 *   - 400 on researchInput > 2000 chars
 *   - 400 on invalid mode value
 *   - 400 on invalid dialogueMode value
 *   - 成功路径返回的 reproHash 为 64 字符 hex
 *   - quick 模式 loopState.terminated === true
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
// 显式离线回放网关（测试接线 opt-in——服务层默认已 fail-closed，回放仅测试可达）
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

async function withServer<T>(
  fn: (app: import('fastify').FastifyInstance) => Promise<T>,
): Promise<T> {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: 'hypothesize-test' })]),
    profile: 'offline_replay',
    logger: false,
  });
  try {
    return await fn(app);
  } finally {
    await app.close();
    db.close();
  }
}

test('POST /api/v1/hypothesize success returns 200 with full response shape', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '观察现象：室温下水滴 10 分钟未蒸发',
        mode: 'quick',
        dialogueMode: 'disabled',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      loopState: { terminated: boolean };
      graphSubtree: { rootId: string; nodes: readonly unknown[]; edges: readonly unknown[] };
      honestVerdict: unknown;
      reproHash: string;
      datasetSource: 'replay' | 'real';
      providerProfile: string;
    } }).data;
    assert.equal(typeof body.loopState.terminated, 'boolean');
    assert.equal(typeof body.graphSubtree.rootId, 'string');
    assert.ok(Array.isArray(body.graphSubtree.nodes));
    assert.ok(Array.isArray(body.graphSubtree.edges));
    assert.equal(typeof body.reproHash, 'string');
    // K2: the response MUST carry an honest mode label (no replay-as-live
    // masquerade — directive §26). With no gateway injected (test default) it is
    // 'replay'; the providerProfile string is the exact runtime profile.
    assert.ok(body.datasetSource === 'replay' || body.datasetSource === 'real');
    assert.equal(typeof body.providerProfile, 'string');
    assert.ok(body.providerProfile.length > 0);
  });
});

test('POST /api/v1/hypothesize 幂等：同 idempotencyKey 第二次返回 cached 结果（P0-2）', async () => {
  await withServer(async (app) => {
    const payload = {
      researchInput: '幂等测试 claim：某种新材料在低温下的导电性',
      mode: 'quick',
      idempotencyKey: 'test-idem-key-0001',
    };
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/hypothesize', payload });
    assert.equal(r1.statusCode, 200);
    const b1 = (r1.json() as { readonly ok: boolean; readonly data: { cached?: boolean; reproHash: string } }).data;
    assert.equal(b1.cached, undefined, '首次请求不应命中缓存');

    // 第二次同 key——必须命中幂等缓存（不重跑 LLM、不重复写证据链）。
    const r2 = await app.inject({ method: 'POST', url: '/api/v1/hypothesize', payload });
    assert.equal(r2.statusCode, 200);
    const b2 = (r2.json() as { readonly ok: boolean; readonly data: { cached?: boolean; reproHash: string; loopState: unknown } }).data;
    assert.equal(b2.cached, true, '第二次必须命中幂等缓存');
    assert.equal(b2.reproHash, b1.reproHash, '幂等重放必须返回相同结果');
  });
});

test('POST /api/v1/hypothesize 幂等：不同 key 独立执行（互不缓存）', async () => {
  await withServer(async (app) => {
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: '幂等测试 claim A', mode: 'quick', idempotencyKey: 'test-idem-key-A' },
    });
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: '幂等测试 claim B', mode: 'quick', idempotencyKey: 'test-idem-key-B' },
    });
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    const b1 = (r1.json() as { readonly ok: boolean; readonly data: { cached?: boolean } }).data;
    const b2 = (r2.json() as { readonly ok: boolean; readonly data: { cached?: boolean } }).data;
    assert.equal(b1.cached, undefined);
    assert.equal(b2.cached, undefined);
  });
});

test('POST /api/v1/hypothesize returns 400 on empty researchInput', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: '', mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on missing researchInput', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on researchInput > 2000 chars', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: 'x'.repeat(2001), mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on invalid mode value', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试输入',
        mode: 'invalid_mode_value',
      },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on invalid dialogueMode value', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试输入',
        mode: 'quick',
        dialogueMode: 'yes',
      },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize success reproHash is 64-character hex', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试假设输入',
        mode: 'quick',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: { reproHash: string } }).data;
    assert.match(body.reproHash, /^[0-9a-f]{64}$/);
  });
});

test('POST /api/v1/hypothesize quick mode loopState.terminated === true', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '假设：温度对反应速率的影响',
        mode: 'quick',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: {
      loopState: { terminated: boolean; terminationReason?: string };
    } }).data;
    assert.equal(body.loopState.terminated, true);
  });
});

// ===== B2 收尾：claimIdempotency pending / 409 分支 =====

test('POST /api/v1/hypothesize 幂等：pending 状态 → 409 IDEMPOTENCY_PENDING（并发占位）', async () => {
  const db = openDb();
  // 预写 pending 占位记录（模拟并发请求已占位·尚未完成）。
  db.prepare(
    `INSERT INTO hypothesize_idempotency (idempotency_key, research_input, mode, dialogue_mode, status)
     VALUES ('key-pending-001', 'input', 'quick', NULL, 'pending')`,
  ).run();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: 'hypothesize-test' })]),
    profile: 'offline_replay',
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: 'input', mode: 'quick', idempotencyKey: 'key-pending-001' },
    });
    assert.equal(response.statusCode, 409, 'pending 占位必须 409（防并发同 key 双跑）');
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'IDEMPOTENCY_PENDING');
  } finally {
    await app.close();
    db.close();
  }
});

// 注：executeLoop 失败清理分支（hypothesize.ts line 141-148）正常路径不可达——
// runAgentLoop（fsm_runner.ts:501-558）catch 全部错误并转 LoopState.error（不 throw）→
// executeLoop 恒不 throw → hypothesize catch 分支是防御性代码（runAgentLoop 错误处理已覆盖）。


// ---------------------------------------------------------------------------
// Provider 失败 → 503 fail-closed 映射（裸 500 修复的判别锁）
// 缺陷背景：arrearage 等 provider 传输层失败曾被扁平化为无信息的
// "internal server error"（HTTP 500）——用户拿不到下一步。修复后：
// ProviderError → 503 LLM_PROVIDER_FAILED + 可行动指引 + 模型中立（不带 provider 名）。
// ---------------------------------------------------------------------------

test('POST /api/v1/hypothesize: provider HTTP 失败 → 503 + 指引，不裸 500 不泄密', async () => {
  const db = openDb();
  const { BailianHttpError } = await import('../../src/llm_gateway/fallback_chain/errors.ts');
  const { createLlmGateway } = await import('../../src/llm_gateway/gateway.ts');
  const failingGateway = createLlmGateway([
    {
      profile: 'competition_aliyun_qwen',
      call: () => {
        throw new BailianHttpError(400, null, 'http_400 Arrearage: account overdue');
      },
    },
  ]);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: failingGateway,
    profile: 'competition_aliyun_qwen',
    modelSnapshot: 'test-provider-fail-snapshot',
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: 'On the TESS exoplanet sample, planet radius correlates with log10(insolation).',
        mode: 'quick',
        dialogueMode: 'disabled',
        grounded: false,
        idempotencyKey: 'provider-fail-test-0001',
      },
    });
    assert.equal(response.statusCode, 503, `provider 失败必须 fail-closed 503，不得裸 500: ${response.body}`);
    const body = response.json() as { error_code: string; message: string };
    assert.equal(body.error_code, 'LLM_PROVIDER_FAILED');
    assert.ok(body.message.includes('offline'), '必须给可行动下一步（offline profile 指引）');
    assert.ok(body.message.includes('HTTP 400'), 'HTTP 状态应保留（诊断价值）');
    // 模型中立红线：不得携带 provider 品牌字面量/密钥形状
    assert.ok(!/dashscope|bailian|qwen|sk-/i.test(body.message), `消息泄漏 provider 信息: ${body.message}`);
  } finally {
    await app.close();
    db.close();
  }
});
