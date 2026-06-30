import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { appendLlmResponseRecord, callAndRecordLlm, verifyChainHead } from '../../src/evidence_log/index.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmResponse } from '../../src/llm_gateway/index.ts';

import { runMigrations } from '../../src/db/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('callAndRecordLlm records offline replay calls into call_records', async () => {
  const db = openDb();
  try {
    const gateway = createLlmGateway([
      createOfflineReplayAdapter({
        fixtureResponse: '{"claim":"testable"}',
        now: () => '2026-06-27T00:00:00.000Z',
      }),
    ]);

    const request = {
      responseFormat: 'json_schema' as const,
      messages: [{ role: 'user' as const, content: 'Return a falsifiable claim.' }],
    };
    const result = await callAndRecordLlm(db, gateway, {
      profile: 'offline_replay',
      request,
      metadata: {
        stageId: 'stage3_hypothesis',
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        finishReason: 'stop',
      },
      appendOptions: {
        providerProfile: 'offline_replay',
      },
    });

    assert.equal(result.response.content, '{"claim":"testable"}');
    assert.equal(result.record.seq, 1);
    assert.equal(verifyChainHead(db).ok, true);

    const row = db.prepare('SELECT * FROM call_records WHERE seq = 1').get() as {
      model_id: string;
      dashscope_request_id: string | null;
      request_payload: string;
      response_payload: string;
      response_payload_hash: string | null;
      usage_tokens_total: number | null;
    };
    assert.equal(row.model_id, 'offline-replay-fixture');
    assert.equal(row.dashscope_request_id, null);
    assert.match(row.request_payload, /Return a falsifiable claim/);
    assert.match(row.response_payload, /offline_replay/);
    assert.match(row.response_payload_hash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(row.usage_tokens_total, 47);
  } finally {
    db.close();
  }
});

test('appendLlmResponseRecord rejects mismatched response and append profiles', () => {
  const db = openDb();
  try {
    const response: LlmResponse = {
      credential: {
        providerProfile: 'offline_replay',
        providerRequestId: null,
        modelId: 'offline-replay-fixture',
        modelVersion: null,
        capability: 'reasoning',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
        tokenUsage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
      },
      content: 'ok',
      raw: { replayed: true },
    };

    assert.throws(
      () =>
        appendLlmResponseRecord(db, {
          request: {
            messages: [{ role: 'user', content: 'ping' }],
          },
          response,
          metadata: {
            stageId: 'stage',
            payloadKind: 'meta',
            purposeTag: 'narrative',
            reproHash: 'a'.repeat(64),
            gitCommitSha: 'b'.repeat(40),
            finishReason: 'stop',
          },
          appendOptions: {
            providerProfile: 'competition_aliyun_qwen',
            competitionModelSnapshot: 'qwen3.7-max-2026-05-20',
          },
        }),
      /does not match response profile/,
    );
  } finally {
    db.close();
  }
});
