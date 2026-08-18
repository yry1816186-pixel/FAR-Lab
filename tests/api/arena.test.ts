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

function buildReplayInjectedApp() {
  return buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: 'arena-test-replay' })]),
    profile: 'offline_replay',
    modelSnapshot: 'test-replay-snapshot',
    logger: false,
  });
}

test('GET /arena/demo remains absent', async () => {
  const app = await buildReplayInjectedApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/arena/demo' });
    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('POST /arena rejects an explicitly injected offline replay gateway', async () => {
  const app = await buildReplayInjectedApp();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/arena',
      payload: {
        hypothesis: 'arbitrary user hypothesis',
        refuters: ['scope-launderer'],
      },
    });
    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.equal(body.error_code, 'arena_live_profile_unavailable');
    assert.equal(body.detail?.status, 'REQUIRES_CONFIGURATION');
    assert.match(response.body, /offline_replay/);
  } finally {
    await app.close();
  }
});
