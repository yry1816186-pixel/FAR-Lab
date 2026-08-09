/**
 * V2 receipts 响应 zod schema —— 前端运行时契约校验 SSOT。
 *
 * 镜像后端 `src/api/routes/v2_receipts_schemas.ts` 的响应 schema(单一真相源)。
 * 用于 api_client.ts 的 v2 hooks 在边界做运行时 zod parse,消除"TS 类型断言
 * 无运行时校验"的契约漂移风险(counter-case 3 · R-06)。
 *
 * 设计原则(engineering-taste Axis 1 · decode-once-at-boundary):
 *   - 此文件只含 zod schema(纯数据,无 ApiError 依赖,避免循环导入)
 *   - schema 严格镜像 TS 类型(types.ts 的 V2* 接口)的所有必填字段,
 *     使 zod-inferred 类型可赋值给 TS 类型(消除类型不兼容的 typecheck 错误)
 *   - .passthrough() 容忍后端演进新增的额外字段(前向兼容)
 *   - parse 逻辑 + 错误抛出在 api_client.ts 的 parseV2Response 中
 *
 * 模型中立 · 零容忍合规:无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { z } from 'zod';

// ===========================================================================
// 共享子 schema(镜像后端 v2_receipts_schemas.ts + types.ts V2* 接口)
// ===========================================================================

/**
 * 六维保障维度结果 —— 镜像 V2AssuranceDimensionResult (types.ts)。
 * outcome 使用字面量联合,确保 zod-inferred 类型与 TS 类型完全一致。
 */
const V2AssuranceDimensionResultSchema = z
  .object({
    dimension: z.string(),
    outcome: z.enum(['PASS', 'FAIL', 'WARN', 'SKIP', 'NOT_APPLICABLE']),
    reasonCodes: z.array(z.string()),
    detail: z.string(),
  })
  .passthrough();

/**
 * V2 六维验证结果 —— 镜像 V2VerificationResult (types.ts)。
 *
 * 包含全部必填字段(resultVersion / resultId / receiptId / verificationPolicyId /
 * evaluatedAt / dimensions / receiptStanding / preservationStatus / reviewSummary),
 * 使 zod-inferred 类型可赋值给 V2VerificationResult(消除类型不兼容)。
 */
const VerificationResultSchema = z
  .object({
    resultVersion: z.number(),
    resultId: z.string(),
    receiptId: z.string(),
    verificationPolicyId: z.string(),
    evaluatedAt: z.string(),
    dimensions: z.record(z.string(), V2AssuranceDimensionResultSchema),
    receiptStanding: z.string(),
    preservationStatus: z.string(),
    reviewSummary: z.string(),
  })
  .passthrough();

/** Receipt DTO(camelCase · 镜像后端 ReceiptDtoSchema + V2StoredReceipt)。 */
const ReceiptDtoSchema = z
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

/**
 * Demo 收据形态 —— 镜像 V2DemoReceipt (types.ts)。
 * demo 端点使用 receiptId/verdictLabel/isFixtureOnly 字段名(与持久化端点不同)。
 */
const V2DemoReceiptSchema = z
  .object({
    receiptId: z.string(),
    claimText: z.string(),
    verdictLabel: z.string(),
    isFixtureOnly: z.boolean(),
    manifestMembers: z.array(
      z
        .object({
          kind: z.string(),
          digest: z.string(),
          sizeBytes: z.number(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** Manifest member(输出 DTO 形态)。 */
const ManifestMemberSchema = z
  .object({
    kind: z.string(),
    digest: z.string(),
    sizeBytes: z.number(),
  })
  .passthrough();

/** GET /receipts/:id 的 latestVerification 字段(nullable)。 */
const LatestVerificationSchema = z
  .object({
    id: z.number(),
    receiptId: z.string(),
    policyId: z.string(),
    evaluatedAt: z.string(),
    result: VerificationResultSchema,
    allPass: z.boolean(),
  })
  .passthrough()
  .nullable();

// ===========================================================================
// 响应 data schema(信封 { ok: true, data: T } 的 T 部分)
//
// 6 端点全覆盖(counter-case 3 验收要求):
//   POST /receipts/verify    → VerifyEnvelopeDataSchema
//   GET  /receipts/demo      → DemoReceiptDataSchema
//   POST /receipts           → CreateReceiptDataSchema
//   GET  /receipts           → ReceiptListDataSchema
//   GET  /receipts/:id       → ReceiptDetailDataSchema
//   GET  /receipts/:id/verify → ReVerifyDataSchema
// ===========================================================================

/** POST /receipts/verify 的 data。 */
export const VerifyEnvelopeDataSchema = z
  .object({
    verification: VerificationResultSchema,
    display: z.string(),
  })
  .passthrough();

/** GET /receipts/demo 的 data。 */
export const DemoReceiptDataSchema = z
  .object({
    receipt: V2DemoReceiptSchema,
    verification: VerificationResultSchema,
  })
  .passthrough();

/** POST /receipts(persist)的 data。 */
export const CreateReceiptDataSchema = z
  .object({
    receiptId: z.string(),
    idempotent: z.boolean(),
  })
  .passthrough();

/** GET /receipts(persist list)的 data。 */
export const ReceiptListDataSchema = z
  .object({
    receipts: z.array(ReceiptDtoSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .passthrough();

/** GET /receipts/:id(persist detail)的 data。 */
export const ReceiptDetailDataSchema = z
  .object({
    receipt: ReceiptDtoSchema,
    manifestMembers: z.array(ManifestMemberSchema),
    latestVerification: LatestVerificationSchema,
  })
  .passthrough();

/** GET /receipts/:id/verify(复检)的 data。 */
export const ReVerifyDataSchema = z
  .object({
    verification: VerificationResultSchema,
    display: z.string(),
    allPass: z.boolean(),
  })
  .passthrough();
