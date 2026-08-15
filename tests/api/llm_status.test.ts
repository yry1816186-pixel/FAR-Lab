// tests/api/llm_status.test.ts
// WS-A.1 契约测试：GET /api/v1/llm-status 端点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

test('GET /llm-status: 无 gateway → profile=null + keyConfigured=false（fail-closed·无静默回放）', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/llm-status' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body).data;
    assert.equal(body.profile, null);
    assert.equal(body.keyConfigured, false);
    assert.equal('apiKey' in body, false);
    assert.equal('key' in body, false);
  } finally { await app.close(); }
});

test('GET /llm-status: 注入 gateway → competition_aliyun_qwen + keyConfigured=true', async () => {
  const gateway = createLlmGateway([createOfflineReplayAdapter({ modelId: 'status-test' })]);
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, gateway, profile: 'competition_aliyun_qwen', logger: false });
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/llm-status' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body).data;
    assert.equal(body.profile, 'competition_aliyun_qwen');
    assert.equal(body.keyConfigured, true);
  } finally { await app.close(); }
});
