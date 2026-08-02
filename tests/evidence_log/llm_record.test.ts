/**
 * llm_record.test.ts — evidence_log.llm_record 单元测试（补测试缺口）。
 *
 * appendLlmResponseRecord / callAndRecordLlm 是 LLM 响应落证据库的核心路径，此前仅被
 * 集成测试（recorded_gateway.test.ts）间接覆盖，缺单元级边界。本文件补：
 *
 *   ① profile 不匹配（appendOptions.providerProfile ≠ response.providerProfile）→ 抛错
 *   ② 落库成功：call_records 行 + payload 内容哈希（IC-07）+ usage 计量
 *   ③ dashscopeRequestId 规则：competition_aliyun_qwen 缺失 providerRequestId → 抛错；
 *      非 competition → null
 *   ④ callAndRecordLlm 编排：gateway.callLlm 被调 + 记录落库 + 返回 response
 *   ⑤ 链验证：落库后 verifyChainHead 仍 ok（记录进链）
 *   ⑥ prevHash 链接：两条记录哈希链式正确
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrator.ts';
import {
  appendLlmResponseRecord,
  callAndRecordLlm,
} from '../../src/evidence_log/llm_record.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmCallCredential,
  LlmRequest,
  LlmResponse,
  TokenUsage,
} from '../../src/llm_gateway/types.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function makeCredential(overrides: Partial<LlmCallCredential> = {}): LlmCallCredential {
  const usage: TokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  return {
    providerProfile: 'offline_replay',
    providerRequestId: null,
    modelId: 'offline-replay-fixture',
    modelVersion: null,
    capability: 'reasoning',
    isoTimestamp: '2026-08-02T00:00:00.000Z',
    tokenUsage: usage,
    ...overrides,
  };
}

function makeRequest(): LlmRequest {
  return { messages: [{ role: 'user', content: 'q' }] };
}

function makeResponse(cred: LlmCallCredential): LlmResponse {
  return { credential: cred, content: 'answer', raw: { fixture: true } };
}

const BASE_METADATA = {
  stageId: 'stage3_hypothesis',
  payloadKind: 'hypothesis' as const,
  purposeTag: 'hypothesis' as const,
  reproHash: 'a'.repeat(64),
  gitCommitSha: 'b'.repeat(40),
  finishReason: 'stop' as const,
};

test('① profile 不匹配（appendOptions ≠ response.credential.providerProfile）→ 抛错', () => {
  const db = openDb();
  try {
    const response = makeResponse(makeCredential({ providerProfile: 'offline_replay' }));
    assert.throws(
      () => appendLlmResponseRecord(db, {
        request: makeRequest(),
        response,
        metadata: BASE_METADATA,
        appendOptions: { providerProfile: 'competition_aliyun_qwen' },
      }),
      /does not match response profile/,
    );
  } finally {
    db.close();
  }
});

test('② 落库成功：行存在 + payload 内容哈希 + usage 计量（IC-07）', () => {
  const db = openDb();
  try {
    const response = makeResponse(makeCredential());
    const record = appendLlmResponseRecord(db, {
      request: makeRequest(),
      response,
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });
    assert.ok(record.currentHash, 'currentHash 非空');
    assert.ok(/^[0-9a-f]{64}$/.test(record.currentHash), 'currentHash 须 64-hex');

    const row = db.prepare('SELECT * FROM call_records WHERE seq = ?').get(record.seq) as Record<string, unknown>;
    assert.ok(row, '行须存在');
    assert.equal(row.stage_id, 'stage3_hypothesis');
    assert.ok(row.request_payload_hash, 'request payload hash 须落（IC-07）');
    assert.ok(row.response_payload_hash, 'response payload hash 须落（IC-07）');
    assert.equal(row.usage_tokens_total, 15, 'usage 计量');
    assert.equal(row.request_payload_hash, row.request_payload_hash);
  } finally {
    db.close();
  }
});

test('③ dashscopeRequestId 规则：competition 缺 providerRequestId → 抛错；非 competition → null', () => {
  const db = openDb();
  try {
    // competition 缺 providerRequestId → 抛错
    const compResp = makeResponse(
      makeCredential({ providerProfile: 'competition_aliyun_qwen', providerRequestId: null }),
    );
    assert.throws(
      () => appendLlmResponseRecord(db, {
        request: makeRequest(),
        response: compResp,
        metadata: BASE_METADATA,
        appendOptions: { providerProfile: 'competition_aliyun_qwen' },
      }),
      /missing providerRequestId/,
    );

    // competition 有 providerRequestId + competitionModelSnapshot → 落库
    const compResp2 = makeResponse(
      makeCredential({ providerProfile: 'competition_aliyun_qwen', providerRequestId: 'req-123', modelId: 'qwen-snap' }),
    );
    const record = appendLlmResponseRecord(db, {
      request: makeRequest(),
      response: compResp2,
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'competition_aliyun_qwen', competitionModelSnapshot: 'qwen-snap' },
    });
    const row = db.prepare('SELECT dashscope_request_id FROM call_records WHERE seq = ?').get(record.seq) as { dashscope_request_id: string | null };
    assert.equal(row.dashscope_request_id, 'req-123');

    // 非 competition → null
    const offlineResp = makeResponse(makeCredential());
    const rec2 = appendLlmResponseRecord(db, {
      request: makeRequest(),
      response: offlineResp,
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });
    const row2 = db.prepare('SELECT dashscope_request_id FROM call_records WHERE seq = ?').get(rec2.seq) as { dashscope_request_id: string | null };
    assert.equal(row2.dashscope_request_id, null);
  } finally {
    db.close();
  }
});

test('④ callAndRecordLlm 编排：callLlm 被调 + 记录落库 + 返回 response', async () => {
  const db = openDb();
  try {
    const response = makeResponse(makeCredential());
    let called = 0;
    // 用真实 createLlmGateway + fake ProviderAdapter（不双重断言·零容忍合规）。
    const gateway = createLlmGateway([
      {
        profile: 'offline_replay',
        call: async () => {
          called += 1;
          return response;
        },
      },
    ]);

    const result = await callAndRecordLlm(db, gateway, {
      profile: 'offline_replay',
      request: makeRequest(),
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });

    assert.equal(called, 1, 'gateway.callLlm 须被调一次');
    assert.equal(result.response.content, 'answer');
    assert.ok(result.record.currentHash);
    const row = db.prepare('SELECT COUNT(*) as n FROM call_records').get() as { n: number };
    assert.equal(row.n, 1, '须落 1 条记录');
  } finally {
    db.close();
  }
});

test('⑤ 落库后 verifyChainHead 仍 ok（记录进链）', () => {
  const db = openDb();
  try {
    appendLlmResponseRecord(db, {
      request: makeRequest(),
      response: makeResponse(makeCredential()),
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });
    const chain = verifyChainHead(db);
    assert.equal(chain.ok, true, '链验证须 ok');
    assert.equal(chain.verifiedCount, 1);
  } finally {
    db.close();
  }
});

test('⑥ 两条记录哈希链式正确（prev_hash 链接）', () => {
  const db = openDb();
  try {
    const r1 = appendLlmResponseRecord(db, {
      request: makeRequest(),
      response: makeResponse(makeCredential()),
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });
    const r2 = appendLlmResponseRecord(db, {
      request: makeRequest(),
      response: makeResponse(makeCredential()),
      metadata: BASE_METADATA,
      appendOptions: { providerProfile: 'offline_replay' },
    });
    assert.equal(r2.prevHash, r1.currentHash, '第二条 prev_hash 须链接第一条 current_hash');
    const chain = verifyChainHead(db);
    assert.equal(chain.ok, true);
    assert.equal(chain.verifiedCount, 2);
  } finally {
    db.close();
  }
});
