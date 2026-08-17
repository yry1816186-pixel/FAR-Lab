// tests/api/llm_status.test.ts
// WS-A.1 契约测试：GET /api/v1/llm-status 端点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';

interface JsonSchema {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly nullable?: boolean;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
}

interface OpenApiDocument {
  readonly paths: Readonly<Record<string, {
    readonly get?: {
      readonly responses?: Readonly<Record<string, {
        readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>;
      }>>;
    };
  }>>;
}

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
    const body = res.json() as {
      readonly ok: true;
      readonly data: { readonly profile: string | null; readonly keyConfigured: boolean };
    };
    assert.deepEqual(body, {
      ok: true,
      data: { profile: null, keyConfigured: false },
    });
    assert.equal('apiKey' in body.data, false);
    assert.equal('key' in body.data, false);
  } finally { await app.close(); }
});

test('GET /llm-status: 注入 gateway → competition_aliyun_qwen + keyConfigured=true', async () => {
  const gateway = createLlmGateway([createOfflineReplayAdapter({ modelId: 'status-test' })]);
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, gateway, profile: 'competition_aliyun_qwen', logger: false });
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/llm-status' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      ok: true,
      data: {
        profile: 'competition_aliyun_qwen',
        keyConfigured: true,
      },
    });
  } finally { await app.close(); }
});

test('GET /llm-status: OpenAPI 200 schema describes the exact serialized envelope', async () => {
  const app = await buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
  try {
    await app.ready();
    const document = app.swagger() as OpenApiDocument;
    const schema = document.paths['/api/v1/llm-status']?.get?.responses?.['200']
      ?.content?.['application/json']?.schema;

    assert.ok(schema !== undefined, '200 application/json response schema must be published');
    assert.deepEqual(schema.required, ['ok', 'data']);
    assert.deepEqual(schema.properties?.ok?.enum, [true]);
    assert.deepEqual(schema.properties?.data?.required, ['profile', 'keyConfigured']);
    assert.equal(schema.properties?.data?.properties?.profile?.type, 'string');
    assert.equal(schema.properties?.data?.properties?.profile?.nullable, true);
    assert.equal(schema.properties?.data?.properties?.keyConfigured?.type, 'boolean');

    const response = await app.inject({ method: 'GET', url: '/api/v1/llm-status' });
    assert.deepEqual(response.json(), {
      ok: true,
      data: { profile: null, keyConfigured: false },
    });
  } finally {
    await app.close();
  }
});
