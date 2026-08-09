/**
 * v2_receipts_schemas —— V2 receipts 端点契约 SSOT（Single Source of Truth）。
 *
 * 设计原则（AGENTS.md §7 trust-kernel 边界 + §6 最小变更）：
 *   - zod schema 是契约唯一真相源：路由层验证、OpenAPI 生成、契约测试均从此派生。
 *   - 不改动 trust-kernel 类型（ProofEnvelopeV2 / VerificationResult / verdict kernel），
 *     仅在 API 层定义请求/响应视图 schema。
 *   - 统一成功信封：{ ok: true, data: T }；统一失败信封：RFC 7807 ApiErrorResponse。
 *   - pagination 统一 limit/offset（不再 page/limit）。
 *   - response schema 使用 .passthrough() 防止 fast-json-stringify 丢弃 data 内额外字段
 *     （verification/receipt 等复杂对象由功能测试覆盖内部结构，契约层只锁定信封 + 顶层字段）。
 *
 * 模型中立 · 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { FastifySchema } from 'fastify';

// ===========================================================================
// 通用 helper
// ===========================================================================

/**
 * 将 zod schema 转为 fastify/ajv 可消费的 JSON schema 对象。
 *
 * zodToJsonSchema 默认内联输出（不生成 $ref/definitions），与 fastify ajv 兼容。
 * 返回类型放宽为 Record<string, unknown> 以匹配 fastify FastifySchema 字段类型。
 */
function toRouteSchema(zodSchema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(zodSchema) as Record<string, unknown>;
}

// ===========================================================================
// 共享子 schema
// ===========================================================================

/** RFC 7807 错误响应体（与 src/api/types.ts ApiErrorResponse 对齐）。 */
export const ApiErrorResponseSchema = z
  .object({
    error_code: z.string(),
    message: z.string(),
    source_anchor: z.object({
      fileId: z.string().nullable(),
      stageId: z.string().nullable(),
      callRecordId: z.string().nullable(),
    }),
    detail: z.unknown().optional(),
  })
  .passthrough();

/** Receipt DTO（来自 receiptRowToDto，camelCase）。 */
export const ReceiptDtoSchema = z
  .object({
    id: z.string(),
    claimId: z.string(),
    claimText: z.string(),
    verdict: z.string(),
    proofHash: z.string(),
    schemaVersion: z.string(),
    createdAt: z.string(),
    receiptStanding: z.string(),
    preservationStatus: z.string(),
  })
  .passthrough();

/** Receipt DB 行视图（v2_receipts 表，snake_case；镜像 schema/migrations/0023_v2_receipts.sql）。 */
export const ReceiptRowSchema = z
  .object({
    id: z.string(),
    claim_id: z.string(),
    claim_text: z.string(),
    verdict: z.string(),
    proof_hash: z.string(),
    schema_version: z.string(),
    created_at: z.string(),
    receipt_standing: z.string(),
    preservation_status: z.string(),
  })
  .passthrough();

/** Manifest member（输出 DTO 形态）。 */
export const ManifestMemberSchema = z
  .object({
    kind: z.string(),
    digest: z.string(),
    sizeBytes: z.number(),
  })
  .passthrough();

/** 已持久化的最新验证结果（GET /receipts/:id 的 latestVerification 字段）。 */
export const LatestVerificationSchema = z
  .object({
    id: z.number(),
    receiptId: z.string(),
    policyId: z.string(),
    evaluatedAt: z.string(),
    result: z.record(z.string(), z.unknown()),
    allPass: z.boolean(),
  })
  .passthrough();

// ===========================================================================
// 请求 schema
// ===========================================================================

/**
 * POST /receipts/verify 请求体 —— ProofEnvelopeV2 视图。
 *
 * 镜像 v2_receipts.ts 原手动校验约束：schemaVersion/proofHash 必填；
 * claim/verdictTrace 为对象（若存在）；datasetBindings/workflowBindings 等为数组（若存在）。
 * 不深挖 trust-kernel 内部结构（ProofEnvelopeV2 16 字段由 proof_envelope/v2/types.ts 权威定义）。
 * 允许额外字段（passthrough）以兼容 envelope 全部字段。
 */
export const ProofEnvelopeV2RequestSchema = z
  .object({
    schemaVersion: z.string().min(1),
    proofHash: z.string().min(1),
    envelopeId: z.string().optional(),
    createdAt: z.string().optional(),
    fecHash: z.string().optional(),
    claim: z.record(z.string(), z.unknown()).optional(),
    fecSnapshot: z.record(z.string(), z.unknown()).optional(),
    protocolFreeze: z.record(z.string(), z.unknown()).optional(),
    datasetBindings: z.array(z.unknown()).optional(),
    workflowBindings: z.array(z.unknown()).optional(),
    experimentRuns: z.array(z.unknown()).optional(),
    measurementResults: z.array(z.unknown()).optional(),
    statisticalResults: z.array(z.unknown()).optional(),
    verdictTrace: z.record(z.string(), z.unknown()).optional(),
    antiTheaterReport: z.record(z.string(), z.unknown()).optional(),
    ledgerRoot: z.string().optional(),
    signatures: z.array(z.unknown()).optional(),
  })
  .passthrough();

/** POST /receipts（persist）请求体 —— 创建 receipt。 */
const ManifestMemberInputSchema = z.object({
  kind: z.string().min(1),
  digest: z.string().min(1),
  sizeBytes: z.number().finite().nonnegative(),
});

const ContractBindingInputSchema = z.object({
  bindingSetJson: z.string().min(1),
  digest: z.string().min(1),
});

export const CreateReceiptBodySchema = z
  .object({
    proofHash: z.string().min(1),
    schemaVersion: z.string().min(1),
    claimId: z.string().min(1),
    claimText: z.string().min(1),
    verdict: z.string().min(1),
    manifestMembers: z.array(ManifestMemberInputSchema).optional(),
    contractBindings: z.array(ContractBindingInputSchema).optional(),
  })
  .passthrough();

/** GET /receipts（persist list）查询参数 —— 统一 limit/offset pagination + claimId 过滤。 */
export const ListReceiptsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    // claimId 过滤：Wizard 保存时 claimId = runId，分享链接 /v2-receipt?runId=xxx 据此定位收据。
    claimId: z.string().min(1).max(256).optional(),
  })
  .passthrough();

/** GET /receipts/:id 与 GET /receipts/:id/verify 路径参数。 */
export const ReceiptIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

// ===========================================================================
// 响应 schema（统一信封 { ok: true, data: T }）
// ===========================================================================

/** POST /receipts/verify 成功响应。 */
export const VerifyResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      verification: z.record(z.string(), z.unknown()),
      display: z.string(),
    })
    .passthrough(),
});

/** GET /receipts/demo 成功响应。 */
export const DemoResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      receipt: z.record(z.string(), z.unknown()),
      verification: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
});

/** POST /receipts（persist）成功响应（201 新建 / 200 幂等）。 */
export const CreateReceiptResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      receiptId: z.string(),
      idempotent: z.boolean(),
    })
    .passthrough(),
});

/** GET /receipts（persist list）成功响应。 */
export const ListReceiptsResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      receipts: z.array(ReceiptDtoSchema),
      total: z.number().int().nonnegative(),
      limit: z.number().int(),
      offset: z.number().int(),
    })
    .passthrough(),
});

/** GET /receipts/:id（persist detail）成功响应。 */
export const ReceiptDetailResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      receipt: ReceiptDtoSchema,
      manifestMembers: z.array(ManifestMemberSchema),
      latestVerification: LatestVerificationSchema.nullable(),
    })
    .passthrough(),
});

/** GET /receipts/:id/verify（复检）成功响应。 */
export const ReVerifyResponseSchema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      verification: z.record(z.string(), z.unknown()),
      display: z.string(),
      allPass: z.boolean(),
    })
    .passthrough(),
});

// ===========================================================================
// Fastify route schema（zod → JSON schema，供路由 + OpenAPI 生成）
// ===========================================================================

/** 错误响应 schema 复用（400/404/500 均映射到 ApiErrorResponseSchema）。 */
const errorResponseSchema = toRouteSchema(ApiErrorResponseSchema);

/** POST /receipts/verify route schema。 */
export const verifyRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'Verify a ProofEnvelopeV2 (six-dimension result)',
  description:
    'Verify a submitted ProofEnvelopeV2. Returns unified envelope { ok: true, data: { verification, display } }. ' +
    'Validation errors return RFC 7807 { error_code, message, source_anchor, detail? }.',
  body: toRouteSchema(ProofEnvelopeV2RequestSchema),
  response: {
    200: toRouteSchema(VerifyResponseSchema),
    400: errorResponseSchema,
  },
};

/** GET /receipts/demo route schema。 */
export const demoRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'Demo sample receipt verification',
  description: 'Returns the demo sample receipt with six-dimension verification ({ ok: true, data: { receipt, verification } }).',
  response: {
    200: toRouteSchema(DemoResponseSchema),
  },
};

/** POST /receipts（persist create）route schema。 */
export const createReceiptRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'Create a receipt (idempotent by proofHash)',
  description:
    'Create a persisted receipt. Idempotent: same proofHash returns existing receiptId with 200 + idempotent=true. ' +
    'New receipt returns 201 + idempotent=false. Response: { ok: true, data: { receiptId, idempotent } }.',
  body: toRouteSchema(CreateReceiptBodySchema),
  response: {
    200: toRouteSchema(CreateReceiptResponseSchema),
    201: toRouteSchema(CreateReceiptResponseSchema),
    400: errorResponseSchema,
  },
};

/** GET /receipts（persist list）route schema。 */
export const listReceiptsRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'List receipts (limit/offset pagination, optional claimId filter)',
  description:
    'List persisted receipts with limit/offset pagination. Response: { ok: true, data: { receipts, total, limit, offset } }. ' +
    'limit: 1..100 (default 20), offset: >=0 (default 0), claimId: optional exact-match filter (runId of a wizard run).',
  querystring: toRouteSchema(ListReceiptsQuerySchema),
  response: {
    200: toRouteSchema(ListReceiptsResponseSchema),
    400: errorResponseSchema,
  },
};

/** GET /receipts/:id（persist detail）route schema。 */
export const receiptDetailRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'Get receipt detail (manifest members + latest verification)',
  description:
    'Get a single receipt with manifest members and latest persisted verification. ' +
    'Response: { ok: true, data: { receipt, manifestMembers, latestVerification } }. 404 if not found (RFC 7807).',
  params: toRouteSchema(ReceiptIdParamsSchema),
  response: {
    200: toRouteSchema(ReceiptDetailResponseSchema),
    404: errorResponseSchema,
  },
};

/** GET /receipts/:id/verify（复检）route schema。 */
export const reVerifyRouteSchema: FastifySchema = {
  tags: ['v2-receipts'],
  summary: 'Re-verify a receipt (run + persist six-dimension result)',
  description:
    'Run V2 six-dimension verification on a persisted receipt, persist the result, return it. ' +
    'Response: { ok: true, data: { verification, display, allPass } }. 404 if not found (RFC 7807).',
  params: toRouteSchema(ReceiptIdParamsSchema),
  response: {
    200: toRouteSchema(ReVerifyResponseSchema),
    404: errorResponseSchema,
  },
};

// ===========================================================================
// 类型导出（从 zod schema 推导，供路由/测试使用）
// ===========================================================================

export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type DemoResponse = z.infer<typeof DemoResponseSchema>;
export type CreateReceiptResponse = z.infer<typeof CreateReceiptResponseSchema>;
export type ListReceiptsResponse = z.infer<typeof ListReceiptsResponseSchema>;
export type ReceiptDetailResponse = z.infer<typeof ReceiptDetailResponseSchema>;
export type ReVerifyResponse = z.infer<typeof ReVerifyResponseSchema>;
export type ApiErrorResponseBody = z.infer<typeof ApiErrorResponseSchema>;
// P1-A-2：persist 路由请求体 / DB 行类型（消除 v2_receipts_persist.ts 手写重复，SSOT 单一真相源）。
export type CreateReceiptBody = z.infer<typeof CreateReceiptBodySchema>;
export type ReceiptRow = z.infer<typeof ReceiptRowSchema>;
