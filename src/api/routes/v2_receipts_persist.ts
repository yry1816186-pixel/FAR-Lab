/**
 * V2 Receipt Persist routes — CRUD + verification over persisted receipts.
 *
 * Endpoints:
 *   POST   /receipts             — create a receipt (idempotent by proofHash)
 *   GET    /receipts             — list receipts with pagination (limit/offset)
 *   GET    /receipts/:id         — get single receipt with manifest members + latest verification
 *   GET    /receipts/:id/verify  — run V2 six-dimension verification, persist result
 *
 * 契约（R-05 统一）：
 *   - 成功响应统一信封 { ok: true, data: T }
 *   - 失败响应统一 RFC 7807（抛 ApiError → error_handler 格式化）
 *   - pagination 统一 limit/offset（不再 page/limit）
 *   - 请求体/查询参数/路径参数由 zod schema（fastify/ajv）验证
 *
 * Authority: doc19 §5 (machine envelope), §8 (API lifecycle).
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import {
  runV2ReceiptVerification,
  formatV2VerificationForDisplay,
} from '../../v2_domain/receipt_verify_v2.ts';
import { notFound } from '../errors/error_handler.ts';
import {
  createReceiptRouteSchema,
  listReceiptsRouteSchema,
  receiptDetailRouteSchema,
  reVerifyRouteSchema,
} from './v2_receipts_schemas.ts';
import type {
  CreateReceiptBody,
  ReceiptRow,
} from './v2_receipts_schemas.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// CreateReceiptBody / ReceiptRow 由 v2_receipts_schemas.ts 的 zod schema 派生
// （z.infer，SSOT 单一真相源），不再手写重复定义（P1-A-2）。

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
  //
  // 请求体结构校验由 CreateReceiptBodySchema（fastify/ajv）接管：
  //   - proofHash/schemaVersion/claimId/claimText/verdict 必填 string
  //   - manifestMembers[].{kind,digest,sizeBytes} 元素级校验
  //   - contractBindings[].{bindingSetJson,digest} 元素级校验
  // 验证失败 → error_handler 转 400 VALIDATION_FAILED（RFC 7807）。
  // -----------------------------------------------------------------------
  app.post('/receipts', { schema: createReceiptRouteSchema }, async (request, reply) => {
    const body = request.body as CreateReceiptBody;

    const createdAt = new Date().toISOString();

    // Idempotency: check if a receipt with this proofHash already exists.
    const existing = db
      .prepare('SELECT id FROM v2_receipts WHERE proof_hash = ?')
      .get(body.proofHash) as { readonly id: string } | undefined;

    if (existing !== undefined) {
      return reply.code(200).send({
        ok: true,
        data: {
          receiptId: existing.id,
          idempotent: true,
        },
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
      data: {
        receiptId,
        idempotent: false,
      },
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts — list with pagination (limit/offset)
  //
  // 查询参数由 ListReceiptsQuerySchema（fastify/ajv）验证 + coerce + 填充默认值：
  //   - limit: 1..100，默认 20
  //   - offset: >=0，默认 0
  // -----------------------------------------------------------------------
  app.get('/receipts', { schema: listReceiptsRouteSchema }, async (request, reply) => {
    const query = request.query as {
      readonly limit?: number;
      readonly offset?: number;
      readonly claimId?: string;
    };
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const claimId = query.claimId;

    // claimId 过滤（Wizard 分享链接 ?runId=xxx 定位收据：保存时 claimId = runId）。
    let total: number;
    let rows: readonly ReceiptRow[];
    if (claimId !== undefined) {
      const totalRow = db
        .prepare('SELECT COUNT(*) AS cnt FROM v2_receipts WHERE claim_id = ?')
        .get(claimId) as { readonly cnt: number };
      total = totalRow.cnt;
      rows = db
        .prepare('SELECT * FROM v2_receipts WHERE claim_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(claimId, limit, offset) as readonly ReceiptRow[];
    } else {
      const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM v2_receipts').get() as { readonly cnt: number };
      total = totalRow.cnt;
      rows = db
        .prepare('SELECT * FROM v2_receipts ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as readonly ReceiptRow[];
    }

    const receipts = rows.map((row) => receiptRowToDto(row));

    return reply.code(200).send({
      ok: true,
      data: {
        receipts,
        total,
        limit,
        offset,
      },
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts/:id — single receipt with manifest + latest verification
  //
  // 路径参数由 ReceiptIdParamsSchema（fastify/ajv）验证（id 非空，长度 <=128）。
  // 资源不存在 → 抛 notFound（ApiError 404）→ error_handler 转 RFC 7807。
  // -----------------------------------------------------------------------
  app.get('/receipts/:id', { schema: receiptDetailRouteSchema }, async (request, reply) => {
    const params = request.params as { id: string };
    const row = db.prepare('SELECT * FROM v2_receipts WHERE id = ?').get(params.id) as ReceiptRow | undefined;

    if (row === undefined) {
      throw notFound('Receipt', params.id);
    }

    const members = db
      .prepare('SELECT kind, digest, size_bytes FROM v2_manifest_members WHERE receipt_id = ?')
      .all(params.id) as readonly ManifestMemberRow[];

    const latestVerification = db
      .prepare('SELECT * FROM v2_verification_results WHERE receipt_id = ? ORDER BY id DESC LIMIT 1')
      .get(params.id) as VerificationResultRow | undefined;

    return reply.code(200).send({
      ok: true,
      data: {
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
      },
    });
  });

  // -----------------------------------------------------------------------
  // GET /receipts/:id/verify — run V2 six-dimension verification
  //
  // 资源不存在 → 抛 notFound（ApiError 404）→ error_handler 转 RFC 7807。
  // 验证逻辑（runV2ReceiptVerification）与持久化逻辑不动（trust-kernel 边界）。
  // -----------------------------------------------------------------------
  app.get('/receipts/:id/verify', { schema: reVerifyRouteSchema }, async (request, reply) => {
    const params = request.params as { id: string };
    const row = db.prepare('SELECT * FROM v2_receipts WHERE id = ?').get(params.id) as ReceiptRow | undefined;

    if (row === undefined) {
      throw notFound('Receipt', params.id);
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
      data: {
        verification: result,
        display,
        allPass,
      },
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
