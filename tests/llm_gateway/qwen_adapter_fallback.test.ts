/**
 * aliyun_qwen 文本-only adapter 端到端 fallback 测试（CLAUDE.md §3）。
 *
 * 真实依赖：executeFallbackChain 穿透 DashScope HTTP（spec 24 §5 / 05 §8.2）。
 * 测试在 caller 注入层（createChatCompletion）mock——NOT FakeBackend。
 * executeFallbackChain 本身是真实编排（被测依赖），不 mock。
 *
 * 三条断言（CLAUDE.md §3 端到端 RED→GREEN）：
 *   1. 429 穿透：primary 抛 429 → 自动 fallback 到 backup model 并成功
 *   2. 链路耗尽：三档全 429 → adapter.call() 抛 RETRY_EXHAUSTED
 *   3. fatal 错误：400 → adapter.call() 抛 BailianHttpError
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type OpenAI from 'openai';

import { createQwenAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import type { QwenChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import {
  COMPETITION_FALLBACK_CHAIN,
  COMPETITION_PRIMARY_MODEL_ID,
  NO_QWEN_FAMILY_AVAILABLE_REASON,
} from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';
import {
  BailianHttpError,
  BailianRateLimitError,
} from '../../src/llm_gateway/fallback_chain/index.ts';

// ===== Fixture：构造合法 OpenAI.ChatCompletion =====

function makeCompletion(modelId: string, content: string): OpenAI.ChatCompletion {
  return {
    id: `chatcmpl-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 5,
      completion_tokens: 3,
      total_tokens: 8,
    },
  };
}

interface CapturedQwenHttpRequest {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly modelId: string | null;
  readonly roles: readonly string[];
  readonly temperature: number | null;
  readonly maxTokens: number | null;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

function rolesFromPayload(payload: Record<string, unknown>): readonly string[] {
  if (!Array.isArray(payload.messages)) return [];
  return payload.messages.flatMap((message) => {
    const messageRecord = objectRecord(message);
    return typeof messageRecord?.role === 'string' ? [messageRecord.role] : [];
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': `local-${status}`,
  });
  res.end(JSON.stringify(body));
}

function completionBody(modelId: string, content: string): Record<string, unknown> {
  return {
    id: `chatcmpl-${modelId}`,
    request_id: `req-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 5,
      completion_tokens: 3,
      total_tokens: 8,
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err !== undefined) reject(err);
      else resolve();
    });
  });
}

async function startOpenAiCompatibleTextServer(): Promise<{
  readonly baseURL: string;
  readonly requests: CapturedQwenHttpRequest[];
  readonly close: () => Promise<void>;
}> {
  const requests: CapturedQwenHttpRequest[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: 'not found' } });
      return;
    }

    const raw = await readBody(req);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: { message: 'invalid json' } });
      return;
    }

    const record = objectRecord(payload);
    const modelId = typeof record?.model === 'string' ? record.model : null;
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      modelId,
      roles: record === null ? [] : rolesFromPayload(record),
      temperature: record === null ? null : numberField(record, 'temperature'),
      maxTokens: record === null ? null : numberField(record, 'max_tokens'),
    });

    if (modelId !== COMPETITION_PRIMARY_MODEL_ID) {
      sendJson(res, 400, { error: { message: `unexpected model ${modelId ?? '<missing>'}` } });
      return;
    }
    sendJson(res, 200, completionBody(modelId, 'local-sdk-http-ok'));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address === 'string' || address === null) {
    await closeServer(server);
    throw new Error('test server did not bind to a TCP port');
  }
  return {
    baseURL: `http://127.0.0.1:${(address as AddressInfo).port}/v1`,
    requests,
    close: () => closeServer(server),
  };
}

// 模拟 openai SDK 原生 429 错误（带 status，duck-type 兼容 error_classifier）。
function openaiSdkError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

class APIConnectionError extends Error {
  constructor() {
    super('Connection error.');
    this.name = 'Error';
    this.cause = new Error(
      'FetchError: Client network socket disconnected before secure TLS connection was established',
    );
  }
}

// ===== §1 429 穿透：primary → backup success =====

test('qwen_adapter: 429 on primary → inner retry (3 attempts) → fallback to backup_1 success (no throw)', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    backoff: async () => {}, // instant — avoid real backoff waits in tests
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === COMPETITION_PRIMARY_MODEL_ID) {
        throw openaiSdkError(429, 'quota exhausted');
      }
      // backup_1 (qwen3-235b-a22b) success
      return makeCompletion(request.modelId, 'response-from-backup');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'hello' }],
  });

  // 新契约（2026-08-14 内层重试）：primary 同模型内退避重试 3 次（429 是瞬时
  // 可恢复错误，不立即降级），耗尽后才切 backup_1。
  assert.equal(attempts.length, 4);
  assert.deepEqual(attempts.slice(0, 3), [
    COMPETITION_PRIMARY_MODEL_ID,
    COMPETITION_PRIMARY_MODEL_ID,
    COMPETITION_PRIMARY_MODEL_ID,
  ]);
  assert.equal(attempts[3], 'qwen3-235b-a22b');
  // 响应来自 backup_1
  assert.equal(response.credential.modelId, 'qwen3-235b-a22b');
  assert.equal(response.content, 'response-from-backup');
  // 降级留痕：degradedFrom=primary + providerRetries=2（3 次尝试 = 2 次重试）
  assert.equal(response.credential.adapterMeta?.degradedFrom, COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.adapterMeta?.degradationCount, 1);
  assert.equal(response.credential.adapterMeta?.providerRetries, 2);
});

test('qwen_adapter: SDK APIConnectionError on primary → fallback to backup_1 success', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === COMPETITION_PRIMARY_MODEL_ID) {
        throw new APIConnectionError();
      }
      return makeCompletion(request.modelId, 'response-after-sdk-network-fallback');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.deepEqual(attempts, [COMPETITION_PRIMARY_MODEL_ID, 'qwen3-235b-a22b']);
  assert.equal(response.credential.modelId, 'qwen3-235b-a22b');
  assert.equal(response.content, 'response-after-sdk-network-fallback');
  assert.equal(response.credential.adapterMeta?.degradedFrom, COMPETITION_PRIMARY_MODEL_ID);
  const summary = response.credential.adapterMeta?.degradationSummary;
  if (typeof summary !== 'string') {
    throw new Error('expected degradationSummary to be present after SDK network fallback');
  }
  assert.match(summary, /network/);
});

// ===== §2 链路耗尽：三档全 429 → RETRY_EXHAUSTED =====

test('qwen_adapter: all targets 429 → chainExhausted → throws RETRY_EXHAUSTED', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    backoff: async () => {}, // instant — avoid real backoff waits in tests
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      // 使用 BailianRateLimitError（fallback_chain 的 429 typed error）
      throw new BailianRateLimitError(null, `req-${request.modelId}`);
    },
  });

  await assert.rejects(
    () => adapter.call({ messages: [{ role: 'user', content: 'hi' }] }),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'must be Error');
      const code = (err as { code?: unknown }).code;
      assert.equal(code, 'RETRY_EXHAUSTED', 'error.code must be RETRY_EXHAUSTED');
      // 附带 reason（spec 24 §5 NO_QWEN_FAMILY_AVAILABLE_REASON）
      const reason = (err as { reason?: unknown }).reason;
      assert.equal(reason, NO_QWEN_FAMILY_AVAILABLE_REASON);
      return true;
    },
  );

  // 新契约：三档 × 每档内层重试 3 次尝试（3×3=9），档位顺序保持链序。
  assert.equal(attempts.length, COMPETITION_FALLBACK_CHAIN.length * 3);
  const distinct = [...new Set(attempts)];
  assert.deepEqual(
    distinct,
    COMPETITION_FALLBACK_CHAIN.map((t) => t.modelId),
  );
});

// ===== §3 fatal 错误：400 → BailianHttpError =====

test('qwen_adapter: fatal 400 on primary → throws BailianHttpError (no fallback)', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      // 400 = client error → fatal per spec 05 §9.2 trigger matrix
      throw new BailianHttpError(400, null, 'bad request');
    },
  });

  await assert.rejects(
    () => adapter.call({ messages: [{ role: 'user', content: 'hi' }] }),
    (err: unknown) => {
      assert.ok(err instanceof BailianHttpError, 'must be BailianHttpError');
      assert.equal((err as BailianHttpError).status, 400);
      return true;
    },
  );

  // fatal 立即终止整链——只 primary 被试，backup 未触达（F11: 绝不静默换）
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0], COMPETITION_PRIMARY_MODEL_ID);
});

// ===== §4 happy path：primary success → no degradation =====

test('qwen_adapter: primary success → no fallback, no degradedFrom', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      return makeCompletion(request.modelId, 'ok');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0], COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.modelId, COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.providerProfile, 'competition_aliyun_qwen');
  assert.equal(response.credential.capability, 'reasoning');
  // 无降级 → adapterMeta 不应带 degradedFrom
  assert.equal(response.credential.adapterMeta?.degradedFrom, undefined);
  assert.equal(response.content, 'ok');
});

test('qwen_adapter: local OpenAI-compatible HTTP exercises SDK path without createChatCompletion', async () => {
  const http = await startOpenAiCompatibleTextServer();
  const adapter = createQwenAdapter({
    apiKey: 'local-test-key',
    baseURL: http.baseURL,
    timeoutMs: 5_000,
  });

  try {
    const response = await adapter.call({
      messages: [
        { role: 'system', content: 'system policy' },
        { role: 'user', content: 'hello' },
      ],
      temperature: 0,
      maxTokens: 32,
    });

    assert.equal(http.requests.length, 1, 'primary success must not touch fallback targets');
    const request = http.requests[0]!;
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/v1/chat/completions');
    assert.equal(request.authorization, 'Bearer local-test-key');
    assert.equal(request.modelId, COMPETITION_PRIMARY_MODEL_ID);
    assert.deepEqual(request.roles, ['system', 'user']);
    assert.equal(request.temperature, 0);
    assert.equal(request.maxTokens, 32);
    assert.equal(response.credential.modelId, COMPETITION_PRIMARY_MODEL_ID);
    assert.equal(
      response.credential.providerRequestId,
      'local-200',
      'OpenAI SDK surfaces x-request-id as _request_id; adapter must preserve that real SDK request id',
    );
    assert.equal(response.credential.adapterMeta?.degradedFrom, undefined);
    assert.equal(response.content, 'local-sdk-http-ok');
  } finally {
    await http.close();
  }
});

// ===== §5 真实 SDK 路径选定（无 createChatCompletion 注入）+ fail-closed key 门 =====
// 闭合 P1-3 审计缺口：上面 4 个测试全在 caller 注入层（createChatCompletion）mock，
// line 61-62 的短路总被触发，line 73 的真实 client.chat.completions.create 从未被进入。
// 本测试**不注入** createChatCompletion → 强制走真实路径：
//   resolveApiKey → key 缺失 → line 66 抛 generic Error → classifier 归 unknown_or_config(fatal)
//   → chain 终止 → adapter line 156 包成 BailianHttpError(500, ...)。
//
// 单一真实依赖：src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts:64-79 真实 SDK 构造路径（非 mock 短路）。
// 回归守护：若有人移除 line 65-67 的 key 门 → OpenAI SDK 会用 undefined apiKey 真发 HTTP →
//   401/连接错误，status≠500 且 triggerSignal≠unknown_or_config → 本断言失败。

test('qwen_adapter: no createChatCompletion injected → real SDK path selected; missing key → fail-closed BailianHttpError(500, unknown_or_config)', async () => {
  const savedKey = process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  try {
    const adapter = createQwenAdapter({
      // 故意不提供 apiKey 也不提供 createChatCompletion → 走真实路径（line 64+），非 line 61-62 短路
      baseURL: 'https://unused.invalid.example/',
      timeoutMs: 1_000,
    });

    await assert.rejects(
      () => adapter.call({ messages: [{ role: 'user', content: 'probe' }] }),
      (err: unknown) => {
        assert.ok(err instanceof BailianHttpError, 'must surface as BailianHttpError (adapter fatal-wrap, qwen_adapter.ts:156)');
        assert.equal((err as BailianHttpError).status, 500, 'non-HTTP fatal defaults to status 500 (extractFatalStatus fallback)');
        assert.match((err as Error).message, /unknown_or_config/, 'triggerSignal must be unknown_or_config — proves key-gate generic error was classified');
        return true;
      },
    );
  } finally {
    if (savedKey !== undefined) {
      process.env.DASHSCOPE_API_KEY = savedKey;
    }
  }
});

// ===== §6 真实 DashScope HTTP（line 73 client.chat.completions.create）— env-gated keystone =====
// 单一真实依赖：真实 openai SDK → 真实 DashScope HTTPS（spec 24 §5）。这是仓库内**唯一**能证明
// line 73 真执行的测试（§5 证明路径选定 + key 门，但 line 73 在 key 通过后才达）。
// 诚实边界（CLAUDE.md §3）：无 DASHSCOPE_API_KEY → skip；环境失败（网络/配额/认证/5xx）→ skip 附真实原因；
// 未知错误 → fail（真 bug 守护）。成功 → 强断言真实 DashScope 响应形态。

test('qwen_adapter: real DashScope HTTP (line 73) — env-gated, no mock', async (t) => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    t.skip('DASHSCOPE_API_KEY unset — real DashScope HTTP (line 73) cannot be exercised (honest skip, not fake-green)');
    return;
  }

  const adapter = createQwenAdapter({ apiKey, timeoutMs: 30_000 });

  try {
    const response = await adapter.call({
      messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      temperature: 0,
      maxTokens: 32,
    });

    // 成功 → line 73 真返回了 DashScope 结构化响应
    assert.equal(typeof response.content, 'string', 'real DashScope must return string content');
    assert.equal(response.credential.providerProfile, 'competition_aliyun_qwen');
    const requestId = response.credential.providerRequestId;
    assert.ok(
      typeof requestId === 'string' && requestId.length > 0,
      'DashScope request-id must be extracted (getDataRequestId on a real completion)',
    );
    assert.ok(
      response.credential.modelId.startsWith('qwen'),
      `succeeded model must be Qwen family (D3 neutrality), got ${response.credential.modelId}`,
    );
  } catch (err: unknown) {
    // 环境性失败 → 诚实 skip（绝不当代码 bug）。断言失败（ERR_ASSERTION）→ 重新抛出（真 bug 不吞）。
    if (err instanceof Error && (err as { code?: string }).code === 'ERR_ASSERTION') {
      throw err;
    }
    const status = (err as { status?: unknown }).status;
    const code = (err as { code?: unknown }).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'RETRY_EXHAUSTED') {
      t.skip(`real DashScope call exhausted fallback chain (likely quota/network): ${msg.slice(0, 120)}`);
      return;
    }
    if (typeof status === 'number' && (status === 401 || status === 403)) {
      t.skip(`DASHSCOPE_API_KEY rejected by DashScope (status ${status}) — invalid key, not a code bug`);
      return;
    }
    if (typeof status === 'number' && (status === 429 || (status >= 500 && status < 600))) {
      t.skip(`DashScope transient failure (status ${status}) — server/quota, not a code bug`);
      return;
    }
    if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|getaddrinfo/i.test(msg)) {
      t.skip(`network unreachable to DashScope: ${msg.slice(0, 120)}`);
      return;
    }
    throw err;
  }
});
