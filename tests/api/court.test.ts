import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { CourtModelTarget } from '../../src/api/internal/court_service.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

function replayTarget(id: string): CourtModelTarget {
  return {
    id,
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: id })]),
    providerProfile: 'offline_replay',
    modelSnapshot: 'fixture-snapshot',
    allowedModelIds: [id],
    independenceKey: id,
  };
}

test('GET /court/demo remains absent', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/court/demo' });
    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('POST /court never manufactures a certificate from an absent target catalog', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/court',
      payload: { claim: 'claim', models: ['a', 'b'] },
    });
    assert.equal(response.statusCode, 501);
    assert.equal(JSON.parse(response.body).error_code, 'NOT_SUPPORTED');
    assert.match(response.body, /one gateway called repeatedly is not cross-model validation/);
  } finally {
    await app.close();
  }
});

test('POST /court rejects a catalog made from offline replay targets', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    courtModelTargets: [replayTarget('a'), replayTarget('b')],
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/court',
      payload: { claim: 'claim', models: ['a', 'b'] },
    });
    assert.equal(response.statusCode, 501);
    const body = JSON.parse(response.body);
    assert.equal(body.error_code, 'NOT_SUPPORTED');
    assert.equal(body.detail?.code, 'COURT_TARGET_INVALID');
  } finally {
    await app.close();
  }
});
