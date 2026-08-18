import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { createLiveFixtureGateway } from './live_fixture_gateway.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

const VALID_BODY = {
  hypothesis: 'Does model A achieve mean accuracy >= 0.72 on benchmark Z?',
  refuters: ['scope-launderer', 'post-hoc-threshold'],
};

test('POST /arena without a gateway returns REQUIRES_CONFIGURATION', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/arena', payload: VALID_BODY });
    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.equal(body.error_code ?? body.code, 'arena_live_profile_unavailable');
    assert.equal(body.detail?.status, 'REQUIRES_CONFIGURATION');
  } finally {
    await app.close();
  }
});

test('POST /arena requires the immutable model snapshot as part of the live context', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLiveFixtureGateway('arena-model'),
    profile: 'competition_aliyun_qwen',
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/arena', payload: VALID_BODY });
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /modelSnapshot/);
  } finally {
    await app.close();
  }
});

test('POST /arena with a complete execution context returns a real-source assessment', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLiveFixtureGateway('arena-model'),
    profile: 'competition_aliyun_qwen',
    modelSnapshot: 'arena-model',
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/arena', payload: VALID_BODY });
    assert.equal(response.statusCode, 200);
    const data = JSON.parse(response.body).data;
    assert.equal(data.datasetSource, 'real');
    assert.ok(data.assessment === 'ROBUST' || data.assessment === 'BREACHED');
  } finally {
    await app.close();
  }
});

test('POST /arena rejects an empty hypothesis', async () => {
  const app = await buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/arena',
      payload: { hypothesis: '', refuters: ['x'] },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error_code, 'VALIDATION_FAILED');
  } finally {
    await app.close();
  }
});
