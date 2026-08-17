/**
 * V1 success-envelope integration tests.
 *
 * These exercise the real buildServer lifecycle so response schemas serialize
 * the final wire shape, while pre-wrapped routes and RFC 7807 failures retain
 * their existing public contracts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import { runMigrations } from '../../src/db/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

async function withServer(
  exercise: (app: Awaited<ReturnType<typeof buildServer>>) => Promise<void>,
): Promise<void> {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    await exercise(app);
  } finally {
    await app.close();
    db.close();
  }
}

test('planning success that is already enveloped is not wrapped twice', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/planning/risk',
      payload: {
        readOnly: false,
        docOnly: false,
        boundedWrite: false,
        touchesTrustKernel: true,
        newCliOrApi: false,
        crossModule: false,
        destructive: false,
        irreversible: false,
        ambiguous: false,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      readonly ok: true;
      readonly data: { readonly level: string; readonly reasons: readonly string[] };
    };
    assert.equal(body.ok, true);
    assert.equal(body.data.level, 'P3');
    assert.equal('data' in body.data, false, 'must not produce { data: { data: ... } }');
  });
});

test('lifecycle success that is already enveloped is not wrapped twice', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/lifecycle/events?targetKind=claim&targetId=untouched',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      data: {
        targetKind: 'claim',
        targetId: 'untouched',
        events: [],
      },
    });
  });
});

test('V1 RFC 7807 failure is never wrapped as a success', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/lifecycle/events',
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.headers['content-type'] ?? '', /application\/problem\+json/);
    const body = response.json() as Readonly<Record<string, unknown>>;
    assert.equal(body.error_code, 'VALIDATION_FAILED');
    assert.equal('ok' in body, false);
    assert.equal('data' in body, false);
  });
});
