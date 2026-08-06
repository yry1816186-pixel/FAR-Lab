/**
 * V2 Receipt Persist routes — CRUD + verification over persisted receipts.
 *
 * Endpoints:
 *   POST   /receipts             — create a receipt (idempotent by proofHash)
 *   GET    /receipts             — list receipts with pagination
 *   GET    /receipts/:id         — get single receipt with manifest members + latest verification
 *   GET    /receipts/:id/verify  — run V2 six-dimension verification, persist result
 *
 * Authority: doc19 §5 (machine envelope), §8 (API lifecycle).
 * Zero-tolerance: no any / @ts-ignore / double assertions / empty catch / stubs.
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import {
  runV2ReceiptVerification,
  formatV2VerificationForDisplay,
} from '../../v2_domain/receipt_verify_v2.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal body fields required to create a receipt. */
interface CreateReceiptBody {
  readonly proofHash: string;
  readonly schemaVersion: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly manifestMembers?: readonly {
    readonly kind: string;
    readonly digest: string;
    readonly sizeBytes: number;
  }[];
  readonly contractBindings?: readonly {
    readonly bindingSetJson: string;
    readonly digest: string;
  }[];
}

/** Receipt row from v2_receipts. */
interface ReceiptRow {
  readonly id: string;
  readonly claim_id: string;
  readonly claim_text: string;
  readonly verdict: string;
  readonly proof_hash: string;
  readonly schema_version: string;
  readonly created_at: string;
  readonly receipt_standing: string;
  readonly preservation_status: string;
}

/** Manifest member row from v2_manifest_members. */
interface ManifestMemberRow {
  readonly id: number;
  readonly receipt_id: string;
  readonly kind: string;
  readonly digest: string;
  readonly size_bytes: number;
}

/** Verification result row from v2_verification_results. */
interface VerificationResultRow {
  readonly id: number;
  readonly receipt_id: string;
  readonly policy_id: string;
  readonly evaluated_at: string;
  readonly result_json: string;
  readonly all_pass: number;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

/**
 * Register V2 receipt persistence routes.
 *
 * @param app  Fastify sub-application (already under /api/v2 prefix)
 * @param db   better-sqlite3 database handle
 */
export async function registerV2ReceiptPersistRoutes(
  app: FastifyInstance,
  db: Database.Database,
): Promise<void> {
  // -----------------------------------------------------------------------
  // POST /receipts — create receipt (idempotent by proofHash)
  // -----------------------------------------------------------------------
  app.post('/receipts', async (request, reply) => {
    const body = request.body as CreateReceiptBody | null;
    if (body === null || typeof body !== 'object') {
      return reply.code(400).send({
        ok: false,
        error: 'Request body must be a JSON object with proofHash, schemaVersion, claimId, claimText, verdict',
      });
    }

    if (
      typeof body.proofHash !== 'string' ||
      typeof body.schemaVersion !== 'string' ||
      typeof body.claimId !== 'string' ||
      typeof body.claimText !== 'string' ||
      typeof body.verdict !== 'string'
    ) {
      return reply.code(400).send({
        ok: false,
        error: 'Missing required fields: proofHash, schemaVersion, claimId, claimText, verdict',
      });
    }

    const createdAt = new Date().toISOString();

    // 审计 P2-2：数组元素级校验——半损坏的 manifestMembers/contractBindings 元素
    // 不得直插 DB（member.kind 等访问前先 shape 校验，防 500/脏数据）。
    if (body.manifestMembers !== undefined) {
      for (const member of body.manifestMembers) {
        if (
          typeof member !== 'object' || member === null ||
          typeof member.kind !== 'string' ||
          typeof member.digest !== 'string' ||
          typeof member.sizeBytes !== 'number' ||
          !Number.isFinite(member.sizeBytes) || member.sizeBytes < 0
        ) {
          return reply.code(400).send({
            ok: false,
            error: 'Malformed manifestMembers: each member must be { kind: string, digest: string, sizeBytes: number }',
          });
        }
      }
    }
    if (body.contractBindings !== undefined) {
      for (const binding of body.contractBindings) {
        if (
          typeof binding !== 'object' || binding === null ||
          typeof binding.bindingSetJson !== 'string' ||
          typeof binding.digest !== 'string'
        ) {
          return reply.code(400).send({
            ok: false,
            error: 'Malformed contractBindings: each binding must be { bindingSetJson: string, digest: string }',
          });
        }
      }
    }

    // Idempotency: check if a receipt with this proofHash already exists.
    const existing = db
      .prepare('SELECT id FROM v2_receipts WHERE proof_hash = ?')
      .get(body.proofHash) as { readonly id: string } | undefined;

    if (existing !== undefined) {
      return reply.code(200).send({
        ok: true,
        receiptId: existing.id,
        idempotent: true,
      });
    }

    const receiptId = randomUUID();

    const insertReceipt = db.prepare(
      `INSERT INTO v2_receipts (id, claim_id, claim_text, verdict, proof_hash, schema_version, created_at, receipt_standing, preservation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'AVAILABLE')`,
    );
    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO v2_manifest_members (receipt_id, kind, digest, size_bytes) VALUES (?, ?, ?, ?)',
    );
    const insertBinding = db.prepare(
      'INSERT INTO v2_contract_bindings (receipt_id, binding_set_json, digest, created_at) VALUES (?, ?, ?, ?)',
    );

    const tx = db.transaction(() => {
      insertReceipt.run(receiptId, body.claimId, body.claimText, body.verdict, body.proofHash, body.schemaVersion, createdAt);

      if (body.manifestMembers !== undefined) {
        for (const member of body.manifestMembers) {
          insertMember.run(receiptId, member.kind, member.digest, member.sizeBytes);
        }
      }

      if (body.contractBindings !== undefined) {
        for (const binding of body.contractBindings) {
          insertBinding.run(receiptId, binding.bindingSetJson, binding.digest, createdAt);
        }
      }
    });

    tx();

    return reply.code(201).send({
      ok: true,
      receiptId,
      idempotent: false,
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts — list with pagination
  // -----------------------------------------------------------------------
  app.get('/receipts', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM v2_receipts').get() as { readonly cnt: number };
    const total = totalRow.cnt;

    const rows = db
      .prepare('SELECT * FROM v2_receipts ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as readonly ReceiptRow[];

    const receipts = rows.map((row) => receiptRowToDto(row));

    return reply.code(200).send({
      ok: true,
      receipts,
      total,
      page,
      limit,
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts/:id — single receipt with manifest + latest verification
  // -----------------------------------------------------------------------
  app.get('/receipts/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const row = db.prepare('SELECT * FROM v2_receipts WHERE id = ?').get(params.id) as ReceiptRow | undefined;

    if (row === undefined) {
      return reply.code(404).send({
        ok: false,
        error: `Receipt not found: ${params.id}`,
      });
    }

    const members = db
      .prepare('SELECT kind, digest, size_bytes FROM v2_manifest_members WHERE receipt_id = ?')
      .all(params.id) as readonly ManifestMemberRow[];

    const latestVerification = db
      .prepare('SELECT * FROM v2_verification_results WHERE receipt_id = ? ORDER BY id DESC LIMIT 1')
      .get(params.id) as VerificationResultRow | undefined;

    return reply.code(200).send({
      ok: true,
      receipt: receiptRowToDto(row),
      manifestMembers: members.map((m) => ({
        kind: m.kind,
        digest: m.digest,
        sizeBytes: m.size_bytes,
      })),
      latestVerification: latestVerification !== undefined
        ? {
            id: latestVerification.id,
            receiptId: latestVerification.receipt_id,
            policyId: latestVerification.policy_id,
            evaluatedAt: latestVerification.evaluated_at,
            result: JSON.parse(latestVerification.result_json),
            allPass: latestVerification.all_pass === 1,
          }
        : null,
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts/:id/verify — run V2 six-dimension verification
  // -----------------------------------------------------------------------
  app.get('/receipts/:id/verify', async (request, reply) => {
    const params = request.params as { id: string };
    const row = db.prepare('SELECT * FROM v2_receipts WHERE id = ?').get(params.id) as ReceiptRow | undefined;

    if (row === undefined) {
      return reply.code(404).send({
        ok: false,
        error: `Receipt not found: ${params.id}`,
      });
    }

    const memberRows = db
      .prepare('SELECT kind, digest, size_bytes FROM v2_manifest_members WHERE receipt_id = ?')
      .all(params.id) as readonly ManifestMemberRow[];

    const receiptInput = {
      receiptId: row.id,
      claimText: row.claim_text,
      verdictLabel: row.verdict,
      manifestMembers: memberRows.map((m) => ({
        kind: m.kind as 'claim' | 'fecSnapshot' | 'protocolFreeze' | 'datasetBindings' | 'workflowBindings' | 'experimentRuns' | 'measurementResults' | 'statisticalResults' | 'verdictTrace' | 'antiTheaterReport' | 'ledgerRoot',
        digest: m.digest,
        sizeBytes: m.size_bytes,
      })),
      receiptStanding: (row.receipt_standing ?? 'ACTIVE') as 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN',
      preservationStatus: (row.preservation_status ?? 'AVAILABLE') as 'AVAILABLE' | 'ARCHIVED',
      effectSize: 0,
      pValue: null,
      isFixtureOnly: true,
    };

    const result = runV2ReceiptVerification(receiptInput);
    const display = formatV2VerificationForDisplay(result);
    const evaluatedAt = new Date().toISOString();

    // Determine allPass: all non-NOT_APPLICABLE dims must be PASS.
    const allPass = Object.values(result.dimensions).every(
      (d) => d.outcome === 'PASS' || d.outcome === 'NOT_APPLICABLE',
    );

    const policyId = result.verificationPolicyId;

    const insertVerification = db.prepare(
      'INSERT INTO v2_verification_results (receipt_id, policy_id, evaluated_at, result_json, all_pass) VALUES (?, ?, ?, ?, ?)',
    );
    insertVerification.run(
      params.id,
      policyId,
      evaluatedAt,
      JSON.stringify(result),
      allPass ? 1 : 0,
    );

    return reply.code(200).send({
      ok: true,
      verification: result,
      display,
      allPass,
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a DB row to the API DTO (camelCase). */
function receiptRowToDto(row: ReceiptRow): {
  readonly id: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly proofHash: string;
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly receiptStanding: string;
  readonly preservationStatus: string;
} {
  return {
    id: row.id,
    claimId: row.claim_id,
    claimText: row.claim_text,
    verdict: row.verdict,
    proofHash: row.proof_hash,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    receiptStanding: row.receipt_standing,
    preservationStatus: row.preservation_status,
  };
}
