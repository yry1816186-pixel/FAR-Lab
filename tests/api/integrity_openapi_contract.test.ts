/** Integrity OpenAPI contracts describe the actual V1 envelope and problem media. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import { runMigrations } from '../../src/db/index.ts';

interface MediaResponse {
  readonly content?: Record<string, { readonly schema?: unknown }>;
}

interface Operation {
  readonly responses?: Record<string, MediaResponse>;
}

interface OpenApiDocument {
  readonly paths: Record<string, { readonly get?: Operation }>;
}

test('integrity routes publish success envelopes and RFC 7807 error media', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    await app.ready();
    const document = app.swagger() as OpenApiDocument;
    for (const path of [
      '/api/v1/integrity/root',
      '/api/v1/integrity/proof/{seq}',
      '/api/v1/integrity/receipt',
    ]) {
      const success = document.paths[path]?.get?.responses?.['200'];
      assert.ok(success?.content?.['application/json']?.schema !== undefined, `${path} 200 schema`);
    }

    const proofResponses = document.paths['/api/v1/integrity/proof/{seq}']?.get?.responses;
    for (const status of ['400', '404', '401', '429', '500']) {
      assert.ok(
        proofResponses?.[status]?.content?.['application/problem+json']?.schema !== undefined,
        `proof ${status} must advertise application/problem+json`,
      );
    }
  } finally {
    await app.close();
    db.close();
  }
});
