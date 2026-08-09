/**
 * v2_receipts_contract.test.ts — V2 receipts 端点契约测试（R-15）。
 *
 * 契约 SSOT：src/api/routes/v2_receipts_schemas.ts（zod schema）。
 * 本测试验证运行时响应结构符合契约，不深挖业务逻辑（业务逻辑由 v2_receipts_persist.test.ts 覆盖）。
 *
 * 覆盖：
 *   - 6 端点成功响应符合统一信封 { ok: true, data: T }
 *   - 失败响应符合 RFC 7807 { error_code, message, source_anchor, detail? } + application/problem+json
 *   - pagination 统一 limit/offset（不再 page/limit）
 *   - OpenAPI 3.0 schema 可通过 /openapi.json + /documentation/json 访问，含 v2-receipts paths
 *
 * 端点清单：
 *   POST /api/v2/receipts/verify
 *   GET  /api/v2/receipts/demo
 *   POST /api/v2/receipts
 *   GET  /api/v2/receipts
 *   GET  /api/v2/receipts/:id
 *   GET  /api/v2/receipts/:id/verify
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { test, describe } from 'node:test';
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

/** Fixture receipt body for POST /api/v2/receipts (persist). */
const FIXTURE_RECEIPT = {
  proofHash: 'sha256:contract-' + 'a'.repeat(50),
  schemaVersion: 'far.proof_envelope.v2',
  claimId: 'claim-contract-001',
  claimText: 'Contract test claim: adapter A achieves macro-F1 >= 0.80',
  verdict: 'INCONCLUSIVE',
  manifestMembers: [
    { kind: 'claim', digest: '0'.repeat(64), sizeBytes: 120 },
    { kind: 'fecSnapshot', digest: '1'.repeat(64), sizeBytes: 340 },
    { kind: 'protocolFreeze', digest: '2'.repeat(64), sizeBytes: 200 },
    { kind: 'datasetBindings', digest: '3'.repeat(64), sizeBytes: 150 },
    { kind: 'workflowBindings', digest: '4'.repeat(64), sizeBytes: 180 },
    { kind: 'experimentRuns', digest: '5'.repeat(64), sizeBytes: 250 },
    { kind: 'measurementResults', digest: '6'.repeat(64), sizeBytes: 300 },
    { kind: 'statisticalResults', digest: '7'.repeat(64), sizeBytes: 220 },
    { kind: 'verdictTrace', digest: '8'.repeat(64), sizeBytes: 400 },
    { kind: 'antiTheaterReport', digest: '9'.repeat(64), sizeBytes: 160 },
    { kind: 'ledgerRoot', digest: 'a'.repeat(64), sizeBytes: 64 },
  ],
  contractBindings: [
    { bindingSetJson: '{"policyId":"far.policy.standard-v0.v1"}', digest: 'b'.repeat(64) },
  ],
};

/** Fixture envelope for POST /api/v2/receipts/verify. */
const VERIFY_ENVELOPE = {
  schemaVersion: 'far.proof_envelope.v2',
  proofHash: 'sha256:verify-contract-' + 'c'.repeat(40),
  claim: {
    id: 'claim-verify-contract',
    naturalLanguage: 'Verify contract test claim',
    domain: 'ml-benchmark',
    scope: 'TESS-ASTRO',
    claimType: 'quantitative',
  },
  verdictTrace: {
    verdict: 'INCONCLUSIVE',
    kernelVersion: 'R0',
    rulePriorityTableHash: '0'.repeat(64),
    proofHashInputs: [],
  },
};

// ===========================================================================
// 统一成功信封 { ok: true, data: T }
// ===========================================================================

describe('V2 receipts contract — unified success envelope { ok: true, data: T }', () => {
  test('POST /api/v2/receipts/verify → { ok, data: { verification, display } }', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts/verify',
        payload: VERIFY_ENVELOPE,
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: { readonly verification: unknown; readonly display: string };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.ok(body.data.verification !== undefined, 'data.verification required');
      assert.equal(typeof body.data.display, 'string');
      assert.ok(body.data.display.length > 0);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts/demo → { ok, data: { receipt, verification } }', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts/demo' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: { readonly receipt: unknown; readonly verification: unknown };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.ok(body.data.receipt !== undefined, 'data.receipt required');
      assert.ok(body.data.verification !== undefined, 'data.verification required');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('POST /api/v2/receipts → { ok, data: { receiptId, idempotent } }', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      assert.equal(res.statusCode, 201);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: { readonly receiptId: string; readonly idempotent: boolean };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.equal(typeof body.data.receiptId, 'string');
      assert.ok(body.data.receiptId.length > 0);
      assert.equal(body.data.idempotent, false);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts → { ok, data: { receipts, total, limit, offset } }', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly receipts: readonly unknown[];
          readonly total: number;
          readonly limit: number;
          readonly offset: number;
        };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.ok(Array.isArray(body.data.receipts));
      assert.equal(typeof body.data.total, 'number');
      assert.equal(typeof body.data.limit, 'number');
      assert.equal(typeof body.data.offset, 'number');
      // 旧 page 字段不得存在（契约破坏：page → offset）。
      assert.ok(!('page' in body.data), 'page must NOT exist (replaced by offset)');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts/:id → { ok, data: { receipt, manifestMembers, latestVerification } }', async () => {
    const { app, db } = await buildApp();
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      const receiptId = (createRes.json() as { readonly data: { readonly receiptId: string } }).data.receiptId;

      const res = await app.inject({ method: 'GET', url: `/api/v2/receipts/${receiptId}` });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly receipt: { readonly id: string };
          readonly manifestMembers: readonly unknown[];
          readonly latestVerification: unknown;
        };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.equal(body.data.receipt.id, receiptId);
      assert.ok(Array.isArray(body.data.manifestMembers));
      assert.equal(body.data.latestVerification, null);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts/:id/verify → { ok, data: { verification, display, allPass } }', async () => {
    const { app, db } = await buildApp();
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      const receiptId = (createRes.json() as { readonly data: { readonly receiptId: string } }).data.receiptId;

      const res = await app.inject({ method: 'GET', url: `/api/v2/receipts/${receiptId}/verify` });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly verification: unknown;
          readonly display: string;
          readonly allPass: boolean;
        };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data !== undefined, 'must contain data envelope');
      assert.ok(body.data.verification !== undefined, 'data.verification required');
      assert.equal(typeof body.data.display, 'string');
      assert.equal(typeof body.data.allPass, 'boolean');
    } finally {
      await app.close();
      db.close();
    }
  });
});

// ===========================================================================
// 统一失败信封 RFC 7807
// ===========================================================================

describe('V2 receipts contract — unified error envelope (RFC 7807)', () => {
  /** 断言响应 Content-Type 为 application/problem+json（RFC 7807 标志）。body.error_code 由调用方单独断言。 */
  function assertRfc7807(res: { readonly statusCode: number; readonly headers: { readonly [key: string]: unknown } }): void {
    assert.match(String(res.headers['content-type'] ?? ''), /application\/problem\+json/);
  }

  test('POST /api/v2/receipts/verify — missing proofHash → 400 VALIDATION_FAILED', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts/verify',
        payload: { schemaVersion: 'far.proof_envelope.v2' },
      });
      assert.equal(res.statusCode, 400);
      assertRfc7807(res);
      const body = res.json() as {
        readonly error_code: string;
        readonly message: string;
        readonly source_anchor: unknown;
        readonly detail?: unknown;
      };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
      assert.ok(typeof body.message === 'string' && body.message.length > 0);
      assert.ok(body.source_anchor !== undefined);
      assert.ok(body.detail !== undefined, 'validation detail required');
      // 旧 { ok: false, error } 不得存在。
      assert.ok(!('ok' in body), 'legacy { ok: false } envelope must NOT exist');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('POST /api/v2/receipts — missing required fields → 400 VALIDATION_FAILED', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: { proofHash: 'x' },
      });
      assert.equal(res.statusCode, 400);
      assertRfc7807(res);
      const body = res.json() as { readonly error_code: string; readonly message: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
      assert.ok(body.message.length > 0);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('POST /api/v2/receipts — malformed manifestMembers element → 400 VALIDATION_FAILED', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: {
          ...FIXTURE_RECEIPT,
          manifestMembers: [{ kind: 'claim', digest: '0'.repeat(64), sizeBytes: -1 }],
        },
      });
      assert.equal(res.statusCode, 400);
      const body = res.json() as { readonly error_code: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts — limit=0 (out of range) → 400 VALIDATION_FAILED', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts?limit=0' });
      assert.equal(res.statusCode, 400);
      const body = res.json() as { readonly error_code: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts/:id — nonexistent → 404 NOT_FOUND', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts/nonexistent-id' });
      assert.equal(res.statusCode, 404);
      assertRfc7807(res);
      const body = res.json() as {
        readonly error_code: string;
        readonly message: string;
        readonly source_anchor: unknown;
      };
      assert.equal(body.error_code, 'NOT_FOUND');
      assert.match(body.message, /not found/i);
      assert.ok(body.source_anchor !== undefined);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /api/v2/receipts/:id/verify — nonexistent → 404 NOT_FOUND', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts/nonexistent-id/verify' });
      assert.equal(res.statusCode, 404);
      const body = res.json() as { readonly error_code: string; readonly message: string };
      assert.equal(body.error_code, 'NOT_FOUND');
      assert.match(body.message, /not found/i);
    } finally {
      await app.close();
      db.close();
    }
  });
});

// ===========================================================================
// pagination 统一 limit/offset
// ===========================================================================

describe('V2 receipts contract — pagination unified limit/offset', () => {
  test('default limit=20, offset=0; explicit limit/offset respected', async () => {
    const { app, db } = await buildApp();
    try {
      // Create 3 receipts.
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v2/receipts',
          payload: { ...FIXTURE_RECEIPT, proofHash: `sha256:pg-${i}-` + 'd'.repeat(50), claimId: `claim-pg-${i}` },
        });
      }

      // Default.
      const r1 = await app.inject({ method: 'GET', url: '/api/v2/receipts' });
      const b1 = r1.json() as { readonly data: { readonly limit: number; readonly offset: number; readonly total: number; readonly receipts: readonly unknown[] } };
      assert.equal(b1.data.limit, 20);
      assert.equal(b1.data.offset, 0);
      assert.equal(b1.data.total, 3);
      assert.equal(b1.data.receipts.length, 3);

      // Explicit limit=1, offset=1.
      const r2 = await app.inject({ method: 'GET', url: '/api/v2/receipts?limit=1&offset=1' });
      const b2 = r2.json() as { readonly data: { readonly limit: number; readonly offset: number; readonly receipts: readonly unknown[] } };
      assert.equal(b2.data.limit, 1);
      assert.equal(b2.data.offset, 1);
      assert.equal(b2.data.receipts.length, 1);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('limit coerced from string; offset coerced from string', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts?limit=5&offset=10' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { readonly data: { readonly limit: number; readonly offset: number } };
      assert.equal(body.data.limit, 5);
      assert.equal(body.data.offset, 10);
      assert.equal(typeof body.data.limit, 'number');
      assert.equal(typeof body.data.offset, 'number');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('claimId filter returns only matching receipts (wizard share-link lookup)', async () => {
    const { app, db } = await buildApp();
    try {
      // Create 3 receipts with distinct claimIds (runIds).
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v2/receipts',
          payload: {
            ...FIXTURE_RECEIPT,
            proofHash: `sha256:claim-${i}-` + 'e'.repeat(50),
            claimId: `run-claim-${i}`,
          },
        });
      }

      // Filter by claimId = run-claim-1 → exactly 1 match.
      const r1 = await app.inject({ method: 'GET', url: '/api/v2/receipts?claimId=run-claim-1' });
      assert.equal(r1.statusCode, 200);
      const b1 = r1.json() as {
        readonly data: {
          readonly receipts: readonly { readonly claimId: string }[];
          readonly total: number;
        };
      };
      assert.equal(b1.data.total, 1);
      assert.equal(b1.data.receipts.length, 1);
      assert.equal(b1.data.receipts[0]?.claimId, 'run-claim-1');

      // Filter with no match → empty list, total 0.
      const r2 = await app.inject({ method: 'GET', url: '/api/v2/receipts?claimId=nonexistent-run' });
      const b2 = r2.json() as { readonly data: { readonly total: number; readonly receipts: readonly unknown[] } };
      assert.equal(b2.data.total, 0);
      assert.equal(b2.data.receipts.length, 0);

      // claimId + pagination combine correctly.
      const r3 = await app.inject({ method: 'GET', url: '/api/v2/receipts?claimId=run-claim-0&limit=1&offset=0' });
      const b3 = r3.json() as { readonly data: { readonly receipts: readonly unknown[]; readonly total: number } };
      assert.equal(b3.data.total, 1);
      assert.equal(b3.data.receipts.length, 1);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('claimId= (empty) → 400 VALIDATION_FAILED (fail-closed)', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v2/receipts?claimId=' });
      assert.equal(res.statusCode, 400);
      const body = res.json() as { readonly error_code: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
    } finally {
      await app.close();
      db.close();
    }
  });
});

// ===========================================================================
// OpenAPI 3.0 schema 可访问性（R-15.1）
// ===========================================================================

describe('V2 receipts contract — OpenAPI 3.0 schema accessibility', () => {
  test('GET /openapi.json returns OpenAPI 3.0 document with v2-receipts paths', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      assert.equal(res.statusCode, 200);
      const spec = res.json() as {
        readonly openapi: string;
        readonly paths: Record<string, Record<string, unknown>>;
        readonly tags?: readonly { readonly name: string }[];
      };
      // OpenAPI 3.x.
      assert.match(spec.openapi, /^3\./, 'must be OpenAPI 3.x');
      // paths 含 v2 receipts 端点。
      const pathKeys = Object.keys(spec.paths);
      assert.ok(pathKeys.some((p) => p.includes('/receipts/verify')), 'must include /receipts/verify path');
      assert.ok(pathKeys.some((p) => p.includes('/receipts/demo')), 'must include /receipts/demo path');
      assert.ok(pathKeys.some((p) => p.includes('/receipts')), 'must include /receipts path');
      // tags 含 v2-receipts。
      const tagNames = (spec.tags ?? []).map((t) => t.name);
      assert.ok(tagNames.includes('v2-receipts'), 'must include v2-receipts tag');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('GET /documentation/json (legacy alias) returns same OpenAPI document', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/documentation/json' });
      assert.equal(res.statusCode, 200);
      const spec = res.json() as { readonly openapi: string };
      assert.match(spec.openapi, /^3\./);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('OpenAPI document includes request + response schemas for POST /receipts/verify', async () => {
    const { app, db } = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      const spec = res.json() as {
        readonly paths: Record<string, Record<string, {
          readonly requestBody?: { readonly content?: Record<string, { readonly schema?: unknown }> };
          readonly responses?: Record<string, { readonly content?: Record<string, { readonly schema?: unknown }> }>;
        }>>;
      };
      const verifyPath = Object.keys(spec.paths).find((p) => p.includes('/receipts/verify'));
      assert.ok(verifyPath !== undefined, 'verify path must exist');
      const verifyOp = spec.paths[verifyPath]?.post;
      assert.ok(verifyOp !== undefined, 'POST operation must exist');
      // requestBody schema 必须存在（契约 SSOT）。
      assert.ok(verifyOp.requestBody?.content?.['application/json']?.schema !== undefined, 'requestBody schema required');
      // 200 response schema 必须存在。
      const resp200 = verifyOp.responses?.['200'];
      assert.ok(resp200?.content?.['application/json']?.schema !== undefined, '200 response schema required');
      // 400 response schema 必须存在（RFC 7807）。
      const resp400 = verifyOp.responses?.['400'];
      assert.ok(resp400?.content?.['application/json']?.schema !== undefined, '400 response schema required');
    } finally {
      await app.close();
      db.close();
    }
  });
});
