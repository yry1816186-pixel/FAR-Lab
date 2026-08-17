/** Root probe wire/OpenAPI conformance, including non-JSON response media. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import { runMigrations } from '../../src/db/index.ts';

interface Schema {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
}

interface Response {
  readonly content?: Readonly<Record<string, { readonly schema?: Schema }>>;
}

interface Operation {
  readonly responses?: Readonly<Record<string, Response>>;
}

interface OpenApiDocument {
  readonly paths: Readonly<Record<string, { readonly get?: Operation }>>;
}

test('root probes publish schemas for their actual JSON and Prometheus wire media', async () => {
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

    const health = document.paths['/health']?.get?.responses?.['200']
      ?.content?.['application/json']?.schema;
    assert.deepEqual(health?.required, ['status', 'service', 'timestamp']);
    assert.deepEqual(health?.properties?.status?.enum, ['ok']);

    const ready200 = document.paths['/ready']?.get?.responses?.['200']
      ?.content?.['application/json']?.schema;
    const ready503 = document.paths['/ready']?.get?.responses?.['503']
      ?.content?.['application/json']?.schema;
    assert.deepEqual(ready200?.properties?.status?.enum, ['ready']);
    assert.deepEqual(ready200?.properties?.checks?.properties?.database?.enum, ['ok']);
    assert.deepEqual(ready503?.properties?.status?.enum, ['not_ready']);
    assert.deepEqual(ready503?.properties?.checks?.properties?.database?.enum, ['fail']);

    const metricResponses = document.paths['/metrics']?.get?.responses;
    for (const status of ['200', '500']) {
      const content = metricResponses?.[status]?.content;
      assert.equal(content?.['text/plain']?.schema?.type, 'string', `metrics ${status} text schema`);
      assert.equal(content?.['application/json'], undefined, `metrics ${status} must not advertise JSON`);
    }

    const healthWire = await app.inject({ method: 'GET', url: '/health' });
    assert.deepEqual(Object.keys(healthWire.json() as object).sort(), ['service', 'status', 'timestamp']);
    const metricsWire = await app.inject({ method: 'GET', url: '/metrics' });
    assert.match(metricsWire.headers['content-type'] ?? '', /^text\/plain;/);
    assert.match(metricsWire.body, /^# HELP far_lab_uptime_seconds/m);
  } finally {
    await app.close();
    db.close();
  }
});
