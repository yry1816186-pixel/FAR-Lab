import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import type { CourtModelTarget } from '../../src/api/internal/court_service.ts';
import {
  createLiveFixtureGateway,
  TEST_MODEL_SNAPSHOT,
} from './live_fixture_gateway.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

function target(id: string, independenceKey: string): CourtModelTarget {
  return {
    id,
    gateway: createLiveFixtureGateway(id),
    providerProfile: 'competition_aliyun_qwen',
    modelSnapshot: TEST_MODEL_SNAPSHOT,
    allowedModelIds: [id],
    independenceKey,
  };
}

const VALID_BODY = {
  claim: 'Does model A achieve mean accuracy >= 0.72 on benchmark Z?',
  models: ['model-a', 'model-b'],
};

test('POST /court without an independent target catalog returns NOT_SUPPORTED', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/court', payload: VALID_BODY });
    assert.equal(response.statusCode, 501);
    const body = JSON.parse(response.body);
    assert.equal(body.error_code, 'NOT_SUPPORTED');
    assert.equal(body.detail?.status, 'NOT_SUPPORTED');
  } finally {
    await app.close();
  }
});

test('POST /court with two independent targets returns a real-source certificate', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    courtModelTargets: [
      target('model-a', 'provider-account-a'),
      target('model-b', 'provider-account-b'),
    ],
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/court', payload: VALID_BODY });
    assert.equal(response.statusCode, 200);
    const data = JSON.parse(response.body).data;
    assert.equal(data.datasetSource, 'real');
    assert.equal(data.modelCount, 2);
    assert.equal(data.agreement, 'unanimous');
  } finally {
    await app.close();
  }
});

test('POST /court rejects a missing claim', async () => {
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
      payload: { claim: '', models: ['model-a', 'model-b'] },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error_code, 'VALIDATION_FAILED');
  } finally {
    await app.close();
  }
});

test('POST /court requires two to six model targets', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const tooFew = await app.inject({
      method: 'POST',
      url: '/api/v1/court',
      payload: { claim: 'test', models: ['a'] },
    });
    const tooMany = await app.inject({
      method: 'POST',
      url: '/api/v1/court',
      payload: { claim: 'test', models: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    });
    assert.equal(tooFew.statusCode, 400);
    assert.equal(tooMany.statusCode, 400);
  } finally {
    await app.close();
  }
});
