/**
 * v2_receipts_persist.test.ts — V2 receipt persistence CRUD + verification endpoints.
 *
 * 契约（R-05 统一后）：
 *   - 成功响应：{ ok: true, data: T }
 *   - 失败响应：RFC 7807 { error_code, message, source_anchor, detail? }
 *   - pagination：limit/offset（不再 page/limit）
 *
 * Tests:
 *   - POST /api/v2/receipts — create receipt → 201 + { ok, data: { receiptId, idempotent } }
 *   - POST /api/v2/receipts — idempotent: same proofHash → 200 + same receiptId
 *   - GET  /api/v2/receipts — list with pagination → 200 + { ok, data: { receipts, total, limit, offset } }
 *   - GET  /api/v2/receipts/:id — single receipt + manifest + latest verification
 *   - GET  /api/v2/receipts/:id/verify — run V2 six-dimension verification → 200
 *
 * Uses: Fastify inject + better-sqlite3 :memory: + runMigrations.
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

/** Minimal fixture body for POST /receipts. */
const FIXTURE_RECEIPT = {
  proofHash: 'sha256:a1b2c3d4' + 'e5f6'.repeat(14),
  schemaVersion: 'far.proof_envelope.v2',
  claimId: 'claim-001',
  claimText: 'Adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark',
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

describe('POST /api/v2/receipts — create receipt', () => {
  test('returns 201 with unified envelope { ok, data: { receiptId, idempotent } }', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
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
      assert.ok(body.data !== undefined, 'envelope must contain data');
      assert.ok(body.data.receiptId.length > 0);
      assert.equal(body.data.idempotent, false);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns 400 RFC 7807 VALIDATION_FAILED when required fields are missing', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: { proofHash: 'x' },
      });
      assert.equal(res.statusCode, 400);
      assert.match(res.headers['content-type'] ?? '', /application\/problem\+json/);
      const body = res.json() as {
        readonly error_code: string;
        readonly message: string;
        readonly source_anchor: unknown;
        readonly detail?: unknown;
      };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
      assert.ok(typeof body.message === 'string' && body.message.length > 0);
      assert.ok(body.source_anchor !== undefined);
      assert.ok(body.detail !== undefined, 'validation detail must be present');
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('POST /api/v2/receipts — idempotency', () => {
  test('same proofHash returns existing receiptId with 200', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      // First create.
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      assert.equal(res1.statusCode, 201);
      const body1 = res1.json() as { readonly data: { readonly receiptId: string } };

      // Second with same proofHash.
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      assert.equal(res2.statusCode, 200);
      const body2 = res2.json() as {
        readonly ok: boolean;
        readonly data: { readonly receiptId: string; readonly idempotent: boolean };
      };
      assert.equal(body2.ok, true);
      assert.equal(body2.data.receiptId, body1.data.receiptId);
      assert.equal(body2.data.idempotent, true);

      // Verify only one receipt in DB.
      const count = db.prepare('SELECT COUNT(*) AS cnt FROM v2_receipts').get() as { readonly cnt: number };
      assert.equal(count.cnt, 1);
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts — list with limit/offset pagination', () => {
  test('returns empty list with default limit/offset when no receipts exist', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts',
      });
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
      assert.equal(body.data.receipts.length, 0);
      assert.equal(body.data.total, 0);
      assert.equal(body.data.limit, 20);
      assert.equal(body.data.offset, 0);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns paginated receipts with correct total + offset semantics', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      // Create 3 receipts with different proofHashes.
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v2/receipts',
          payload: {
            ...FIXTURE_RECEIPT,
            proofHash: `sha256:unique-${i}` + 'x'.repeat(50),
            claimId: `claim-${i}`,
          },
        });
      }

      // Page 1: limit=2, offset=0 → 2 receipts.
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts?limit=2&offset=0',
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly receipts: readonly { readonly id: string }[];
          readonly total: number;
          readonly limit: number;
          readonly offset: number;
        };
      };
      assert.equal(body.ok, true);
      assert.equal(body.data.total, 3);
      assert.equal(body.data.receipts.length, 2);
      assert.equal(body.data.limit, 2);
      assert.equal(body.data.offset, 0);

      // Page 2: limit=2, offset=2 → 1 receipt.
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts?limit=2&offset=2',
      });
      const body2 = res2.json() as {
        readonly data: {
          readonly receipts: readonly unknown[];
          readonly total: number;
          readonly offset: number;
        };
      };
      assert.equal(body2.data.receipts.length, 1);
      assert.equal(body2.data.total, 3);
      assert.equal(body2.data.offset, 2);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns 400 RFC 7807 when limit is out of range (0)', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts?limit=0',
      });
      assert.equal(res.statusCode, 400);
      const body = res.json() as { readonly error_code: string };
      assert.equal(body.error_code, 'VALIDATION_FAILED');
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts/:id — single receipt detail', () => {
  test('returns 404 RFC 7807 NOT_FOUND when receipt does not exist', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts/nonexistent-id',
      });
      assert.equal(res.statusCode, 404);
      assert.match(res.headers['content-type'] ?? '', /application\/problem\+json/);
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

  test('returns receipt with manifest members in unified envelope', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      // Create a receipt.
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      const createBody = createRes.json() as { readonly data: { readonly receiptId: string } };
      const receiptId = createBody.data.receiptId;

      // Fetch detail.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}`,
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly receipt: { readonly id: string; readonly claimText: string; readonly proofHash: string };
          readonly manifestMembers: readonly { readonly kind: string; readonly digest: string; readonly sizeBytes: number }[];
          readonly latestVerification: unknown;
        };
      };
      assert.equal(body.ok, true);
      assert.equal(body.data.receipt.id, receiptId);
      assert.equal(body.data.receipt.claimText, FIXTURE_RECEIPT.claimText);
      assert.equal(body.data.receipt.proofHash, FIXTURE_RECEIPT.proofHash);
      assert.equal(body.data.manifestMembers.length, 11);
      assert.equal(body.data.latestVerification, null);
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts/:id/verify — V2 six-dimension verification', () => {
  test('returns 404 RFC 7807 NOT_FOUND when receipt does not exist', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts/nonexistent-id/verify',
      });
      assert.equal(res.statusCode, 404);
      const body = res.json() as { readonly error_code: string };
      assert.equal(body.error_code, 'NOT_FOUND');
    } finally {
      await app.close();
      db.close();
    }
  });

  test('runs verification and returns 6-dimension result in unified envelope', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      // Create a receipt with full manifest.
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      const receiptId = (createRes.json() as { readonly data: { readonly receiptId: string } }).data.receiptId;

      // Run verification.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}/verify`,
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly data: {
          readonly verification: {
            readonly dimensions: Readonly<Record<string, { readonly dimension: string; readonly outcome: string; readonly detail: string }>>;
            readonly receiptId: string;
            readonly verificationPolicyId: string;
          };
          readonly display: string;
          readonly allPass: boolean;
        };
      };
      assert.equal(body.ok, true);
      assert.ok(body.data.display.length > 0);
      assert.ok(body.data.verification.receiptId === receiptId);
      assert.ok(body.data.verification.verificationPolicyId.length > 0);

      // Must have all 6 dimensions.
      const dims = Object.keys(body.data.verification.dimensions);
      assert.equal(dims.length, 6);
      const expectedDims = ['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'];
      for (const dim of expectedDims) {
        assert.ok(dims.includes(dim), `missing dimension: ${dim}`);
        const d = body.data.verification.dimensions[dim];
        assert.ok(d !== undefined, `dimension "${dim}" must exist`);
        assert.ok(d.outcome.length > 0);
      }

      // Verify the result was persisted.
      const vrRow = db
        .prepare('SELECT * FROM v2_verification_results WHERE receipt_id = ?')
        .get(receiptId) as { readonly id: number; readonly result_json: string; readonly all_pass: number } | undefined;
      assert.ok(vrRow !== undefined);
      const parsed = JSON.parse(vrRow.result_json) as { readonly dimensions: Record<string, unknown> };
      assert.ok(Object.keys(parsed.dimensions).length === 6);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('verification result appears in GET /receipts/:id latestVerification', async () => {
    const db = freshDb();
    const app = await buildServer({
      db,
      gitCommitSha: 'a'.repeat(40),
      jwtSecret: null,
      logger: false,
    });
    try {
      // Create + verify.
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      const receiptId = (createRes.json() as { readonly data: { readonly receiptId: string } }).data.receiptId;

      await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}/verify`,
      });

      // Now GET detail should include latestVerification.
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}`,
      });
      const detail = detailRes.json() as {
        readonly data: {
          readonly latestVerification: {
            readonly id: number;
            readonly receiptId: string;
            readonly policyId: string;
            readonly evaluatedAt: string;
            readonly result: { readonly dimensions: Record<string, unknown> };
            readonly allPass: boolean;
          } | null;
        };
      };
      assert.ok(detail.data.latestVerification !== null);
      assert.equal(detail.data.latestVerification.receiptId, receiptId);
      assert.ok(detail.data.latestVerification.policyId.length > 0);
      assert.ok(Object.keys(detail.data.latestVerification.result.dimensions).length === 6);
    } finally {
      await app.close();
      db.close();
    }
  });
});
