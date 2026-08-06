/**
 * v2_receipts_persist.test.ts — V2 receipt persistence CRUD + verification endpoints.
 *
 * Tests:
 *   - POST /api/v2/receipts — create receipt → 201 + receiptId
 *   - POST /api/v2/receipts — idempotent: same proofHash → 200 + same receiptId
 *   - GET  /api/v2/receipts — list with pagination → 200 + receipts/total/page/limit
 *   - GET  /api/v2/receipts/:id — single receipt + manifest + latest verification
 *   - GET  /api/v2/receipts/:id/verify — run V2 six-dimension verification → 200
 *
 * Uses: Fastify inject + better-sqlite3 :memory: + runMigrations.
 * Zero-tolerance: no any / @ts-ignore / double assertions / empty catch / stubs.
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
  test('returns 201 with receiptId on create', async () => {
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
      const body = res.json() as { readonly ok: boolean; readonly receiptId: string; readonly idempotent: boolean };
      assert.equal(body.ok, true);
      assert.ok(body.receiptId.length > 0);
      assert.equal(body.idempotent, false);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns 400 when required fields are missing', async () => {
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
      const body = res.json() as { readonly ok: boolean; readonly error: string };
      assert.equal(body.ok, false);
      assert.ok(body.error.includes('Missing required'));
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
      const body1 = res1.json() as { readonly receiptId: string };

      // Second with same proofHash.
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v2/receipts',
        payload: FIXTURE_RECEIPT,
      });
      assert.equal(res2.statusCode, 200);
      const body2 = res2.json() as { readonly ok: boolean; readonly receiptId: string; readonly idempotent: boolean };
      assert.equal(body2.ok, true);
      assert.equal(body2.receiptId, body1.receiptId);
      assert.equal(body2.idempotent, true);

      // Verify only one receipt in DB.
      const count = db.prepare('SELECT COUNT(*) AS cnt FROM v2_receipts').get() as { readonly cnt: number };
      assert.equal(count.cnt, 1);
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts — list with pagination', () => {
  test('returns empty list when no receipts exist', async () => {
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
        readonly receipts: readonly unknown[];
        readonly total: number;
        readonly page: number;
        readonly limit: number;
      };
      assert.equal(body.ok, true);
      assert.equal(body.receipts.length, 0);
      assert.equal(body.total, 0);
      assert.equal(body.page, 1);
      assert.equal(body.limit, 20);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns paginated receipts with correct total', async () => {
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

      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts?limit=2&page=1',
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly receipts: readonly { readonly id: string }[];
        readonly total: number;
        readonly page: number;
        readonly limit: number;
      };
      assert.equal(body.ok, true);
      assert.equal(body.total, 3);
      assert.equal(body.receipts.length, 2);
      assert.equal(body.page, 1);
      assert.equal(body.limit, 2);

      // Page 2.
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v2/receipts?limit=2&page=2',
      });
      const body2 = res2.json() as {
        readonly receipts: readonly unknown[];
        readonly total: number;
        readonly page: number;
      };
      assert.equal(body2.receipts.length, 1);
      assert.equal(body2.total, 3);
      assert.equal(body2.page, 2);
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts/:id — single receipt detail', () => {
  test('returns 404 when receipt does not exist', async () => {
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
      const body = res.json() as { readonly ok: boolean; readonly error: string };
      assert.equal(body.ok, false);
      assert.ok(body.error.includes('not found'));
    } finally {
      await app.close();
      db.close();
    }
  });

  test('returns receipt with manifest members', async () => {
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
      const createBody = createRes.json() as { readonly receiptId: string };
      const receiptId = createBody.receiptId;

      // Fetch detail.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}`,
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly receipt: { readonly id: string; readonly claimText: string; readonly proofHash: string };
        readonly manifestMembers: readonly { readonly kind: string; readonly digest: string; readonly sizeBytes: number }[];
        readonly latestVerification: unknown;
      };
      assert.equal(body.ok, true);
      assert.equal(body.receipt.id, receiptId);
      assert.equal(body.receipt.claimText, FIXTURE_RECEIPT.claimText);
      assert.equal(body.receipt.proofHash, FIXTURE_RECEIPT.proofHash);
      assert.equal(body.manifestMembers.length, 11);
      assert.equal(body.latestVerification, null);
    } finally {
      await app.close();
      db.close();
    }
  });
});

describe('GET /api/v2/receipts/:id/verify — V2 six-dimension verification', () => {
  test('returns 404 when receipt does not exist', async () => {
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
      const body = res.json() as { readonly ok: boolean; readonly error: string };
      assert.equal(body.ok, false);
    } finally {
      await app.close();
      db.close();
    }
  });

  test('runs verification and returns 6-dimension result', async () => {
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
      const receiptId = (createRes.json() as { readonly receiptId: string }).receiptId;

      // Run verification.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v2/receipts/${receiptId}/verify`,
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        readonly ok: boolean;
        readonly verification: {
          readonly dimensions: Readonly<Record<string, { readonly dimension: string; readonly outcome: string; readonly detail: string }>>;
          readonly receiptId: string;
          readonly verificationPolicyId: string;
        };
        readonly display: string;
        readonly allPass: boolean;
      };
      assert.equal(body.ok, true);
      assert.ok(body.display.length > 0);
      assert.ok(body.verification.receiptId === receiptId);
      assert.ok(body.verification.verificationPolicyId.length > 0);

      // Must have all 6 dimensions.
      const dims = Object.keys(body.verification.dimensions);
      assert.equal(dims.length, 6);
      const expectedDims = ['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'];
      for (const dim of expectedDims) {
        assert.ok(dims.includes(dim), `missing dimension: ${dim}`);
        const d = body.verification.dimensions[dim];
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

  test('verification result appears in GET /receipts/:id', async () => {
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
      const receiptId = (createRes.json() as { readonly receiptId: string }).receiptId;

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
        readonly latestVerification: {
          readonly id: number;
          readonly receiptId: string;
          readonly policyId: string;
          readonly evaluatedAt: string;
          readonly result: { readonly dimensions: Record<string, unknown> };
          readonly allPass: boolean;
        } | null;
      };
      assert.ok(detail.latestVerification !== null);
      assert.equal(detail.latestVerification.receiptId, receiptId);
      assert.ok(detail.latestVerification.policyId.length > 0);
      assert.ok(Object.keys(detail.latestVerification.result.dimensions).length === 6);
    } finally {
      await app.close();
      db.close();
    }
  });
});
