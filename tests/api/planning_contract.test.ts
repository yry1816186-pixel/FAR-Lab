/**
 * planning_contract.test.ts — /api/v1/planning 端点契约测试。
 *
 * opencode 规划方法论源代码化 HTTP 层：4 个确定性门禁端点。
 * 契约 SSOT：src/api/routes/planning_schemas.ts（zod）→ src/planning/* 引擎。
 *
 * 覆盖：
 *   - 4 端点成功响应符合统一信封 { ok: true, data: T }（v1 onSend hook）
 *   - 业务门禁失败（plan/spec 校验违规）→ HTTP 200 + data.ok=false（门禁语义在 data 内，非 HTTP 错误）
 *   - ajv 请求体校验失败 → 400 VALIDATION_FAILED（RFC 7807）
 *   - OpenAPI 3.0 schema 含 /api/v1/planning/* 4 paths
 *
 * 端点清单：
 *   POST /api/v1/planning/risk
 *   POST /api/v1/planning/plan
 *   POST /api/v1/planning/spec
 *   POST /api/v1/planning/gate
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrator.ts';
import { buildServer } from '../../src/api/server.ts';

const MIGRATIONS_DIR = 'schema/migrations';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, { migrationsDir: MIGRATIONS_DIR });
  db.pragma('foreign_keys = ON');
  return db;
}

async function buildApp(): Promise<{ app: Awaited<ReturnType<typeof buildServer>>; db: Database.Database }> {
  const db = freshDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  return { app, db };
}

/** 断言响应 Content-Type 为 application/problem+json（RFC 7807 标志）。 */
function assertRfc7807(res: { readonly statusCode: number; readonly headers: { readonly [key: string]: unknown } }): void {
  assert.ok(
    String(res.headers['content-type'] ?? '').includes('application/problem+json'),
    `expected application/problem+json, got ${String(res.headers['content-type'])}`,
  );
}

const VALID_PLAN = {
  goal: 'add planning engine',
  steps: [
    { id: 'T1', action: 'write tests', risk: 'P2', tools: ['Write'], dependsOn: [], verification: 'pnpm test -- tests/planning/x.test.ts' },
    { id: 'T2', action: 'implement', risk: 'P2', tools: ['Edit'], dependsOn: ['T1'], verification: 'pnpm run typecheck' },
  ],
};

const VALID_SPEC = {
  story: 'researcher wants deterministic planning gates',
  delta: { added: ['src/planning/'], modified: [], removed: [] },
  acceptanceCriteria: [
    { id: 'AC-1', statement: 'plan cycles rejected', verification: 'node --test tests/planning/plan.test.ts' },
    { id: 'AC-2', statement: 'spec requires 3+ ACs', verification: 'node --test tests/planning/spec.test.ts' },
    { id: 'AC-3', statement: 'gate reports not_run', verification: 'node --test tests/planning/gate.test.ts' },
  ],
  risk: 'P3',
};

const GATE_BODY = {
  items: [{ id: 't', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' }],
  results: { t: { status: 'pass', actual: 'exit 0' } },
};

describe('planning API contract', () => {
  test('POST /api/v1/planning/risk — valid signals → 200 envelope with level + reasons', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
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
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: true; data: { level: string; reasons: string[] } };
      assert.equal(body.ok, true);
      assert.equal(body.data.level, 'P3');
      assert.ok(body.data.reasons.length > 0);
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/risk — irreversible → P4 (dominant signal)', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/planning/risk',
        payload: {
          readOnly: true,
          docOnly: false,
          boundedWrite: false,
          touchesTrustKernel: false,
          newCliOrApi: false,
          crossModule: false,
          destructive: false,
          irreversible: true,
          ambiguous: false,
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { level: string } };
      assert.equal(body.data.level, 'P4');
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/risk — missing field → 400 VALIDATION_FAILED (RFC 7807)', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/planning/risk',
        payload: { readOnly: true }, // 缺 8 个必填布尔
      });
      assert.equal(res.statusCode, 400);
      assertRfc7807(res);
      const body = res.json() as { error_code: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/plan — valid plan → 200 data.ok=true + topological order', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/v1/planning/plan', payload: VALID_PLAN });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: true; data: { ok: boolean; violations: unknown[]; executionOrder: string[] } };
      assert.equal(body.ok, true);
      assert.equal(body.data.ok, true);
      assert.deepEqual(body.data.violations, []);
      assert.deepEqual(body.data.executionOrder, ['T1', 'T2']);
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/plan — cycle → 200 data.ok=false + CYCLE_DETECTED (gate semantics in data)', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/planning/plan',
        payload: {
          goal: 'x',
          steps: [
            { id: 'A', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['B'], verification: 'c1' },
            { id: 'B', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: ['A'], verification: 'c2' },
          ],
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { ok: boolean; violations: { code: string }[]; executionOrder: string[] } };
      assert.equal(body.data.ok, false);
      assert.ok(body.data.violations.some((v) => v.code === 'CYCLE_DETECTED'));
      assert.deepEqual(body.data.executionOrder, []);
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/spec — valid spec → 200 data.ok=true; <3 AC → data.ok=false', async () => {
    const { app, db } = await buildApp();
    try {
      const okRes = await app.inject({ method: 'POST', url: '/api/v1/planning/spec', payload: VALID_SPEC });
      assert.equal(okRes.statusCode, 200);
      const okBody = okRes.json() as { data: { ok: boolean } };
      assert.equal(okBody.data.ok, true);

      const badRes = await app.inject({
        method: 'POST',
        url: '/api/v1/planning/spec',
        payload: { ...VALID_SPEC, acceptanceCriteria: VALID_SPEC.acceptanceCriteria.slice(0, 1) },
      });
      assert.equal(badRes.statusCode, 200);
      const badBody = badRes.json() as { data: { ok: boolean; violations: { code: string }[] } };
      assert.equal(badBody.data.ok, false);
      assert.ok(badBody.data.violations.some((v) => v.code === 'TOO_FEW_CRITERIA'));
    } finally {
      app.close();
      db.close();
    }
  });

  test('POST /api/v1/planning/gate — all pass → DONE; not_run → IMPLEMENTED_UNVERIFIED', async () => {
    const { app, db } = await buildApp();
    try {
      const doneRes = await app.inject({ method: 'POST', url: '/api/v1/planning/gate', payload: GATE_BODY });
      assert.equal(doneRes.statusCode, 200);
      const doneBody = doneRes.json() as { data: { conclusion: string; passed: string[] } };
      assert.equal(doneBody.data.conclusion, 'DONE');
      assert.deepEqual(doneBody.data.passed, ['t']);

      const unverifiedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/planning/gate',
        payload: { items: GATE_BODY.items, results: {} },
      });
      assert.equal(unverifiedRes.statusCode, 200);
      const unverifiedBody = unverifiedRes.json() as { data: { conclusion: string; notRun: string[] } };
      assert.equal(unverifiedBody.data.conclusion, 'IMPLEMENTED_UNVERIFIED');
      assert.deepEqual(unverifiedBody.data.notRun, ['t']);
    } finally {
      app.close();
      db.close();
    }
  });

  test('GET /openapi.json — OpenAPI 3.0 document exposes all 4 planning paths', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      assert.equal(res.statusCode, 200);
      const doc = res.json() as { paths: Record<string, unknown> };
      assert.ok(doc.paths['/api/v1/planning/risk'], 'missing /api/v1/planning/risk');
      assert.ok(doc.paths['/api/v1/planning/plan'], 'missing /api/v1/planning/plan');
      assert.ok(doc.paths['/api/v1/planning/spec'], 'missing /api/v1/planning/spec');
      assert.ok(doc.paths['/api/v1/planning/gate'], 'missing /api/v1/planning/gate');
    } finally {
      app.close();
      db.close();
    }
  });
});
