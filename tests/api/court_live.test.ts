// tests/api/court_live.test.ts
// WS-A.2 契约测试：POST /court（live）端点。无真实 DashScope HTTP。

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

function buildTestGateway() {
  return createLlmGateway([createOfflineReplayAdapter({ modelId: 'court-test-model' })]);
}

const VALID_BODY = {
  claim: 'Does model A achieve mean accuracy >= 0.72 on benchmark Z?',
  models: ['alpha', 'beta'],
};

test('POST /court: 无 gateway → 503 fail-closed（绝不静默回放 fixture）', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
  try {
    const res = await app.inject({ method: 'POST', url: '/api/v1/court', payload: VALID_BODY });
    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body);
    assert.equal(body.error_code ?? body.code, 'court_live_profile_unavailable');
  } finally { await app.close(); }
});

test('POST /court: 注入 gateway → datasetSource=real（透传生效）', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, gateway: buildTestGateway(), profile: 'competition_aliyun_qwen', logger: false });
  try {
    const res = await app.inject({ method: 'POST', url: '/api/v1/court', payload: VALID_BODY });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).data.datasetSource, 'real');
  } finally { await app.close(); }
});

test('POST /court: 无 claim → 400 VALIDATION_FAILED', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
  try {
    const res = await app.inject({ method: 'POST', url: '/api/v1/court', payload: { claim: '', models: ['alpha'] } });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error_code, 'VALIDATION_FAILED');
  } finally { await app.close(); }
});

test('POST /court: models 超过 6 个 → 400', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
  try {
    const res = await app.inject({ method: 'POST', url: '/api/v1/court', payload: { claim: 'test', models: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } });
    assert.equal(res.statusCode, 400);
  } finally { await app.close(); }
});
