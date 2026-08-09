/**
 * planning_schemas —— far planning 端点契约 SSOT。
 *
 * 设计原则（与 v2_receipts_schemas 同模式）：
 *   - zod schema 是契约唯一真相源：路由层验证、OpenAPI 生成、契约测试均从此派生。
 *   - 业务 schema（Plan/Spec/VerificationReport/Checkpoint）来自 src/planning/types.ts（单一真相源，
 *     不重复定义）；本文件只定义 API 视图层：RiskSignals 请求 + 响应视图。
 *   - 统一成功信封 { ok: true, data: T }（v1 onSend hook 自动包装）+ 失败 RFC 7807（error_handler）。
 *   - 响应 schema 使用 .passthrough() 防止 fast-json-stringify 丢弃 data 内额外字段。
 *
 * 端点清单：
 *   POST /api/v1/planning/risk    — 风险分级 P0-P4（gradeRisk）
 *   POST /api/v1/planning/plan    — Plan DAG 校验（validatePlan）
 *   POST /api/v1/planning/spec    — Spec 可验证规格校验（validateSpec）
 *   POST /api/v1/planning/gate    — 四步门函数验证报告（buildGateReport）
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩代码。
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { FastifySchema } from 'fastify';

import { PlanSchema, SpecSchema, VerificationReportSchema } from '../../planning/types.ts';

// ===========================================================================
// 通用 helper
// ===========================================================================

/** 将 zod schema 转为 fastify/ajv 可消费的 JSON schema 对象（与 v2 同模式）。 */
function toRouteSchema(zodSchema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(zodSchema) as Record<string, unknown>;
}

// ===========================================================================
// 请求 schema
// ===========================================================================

/** RiskSignals 请求体（对应 src/planning/risk.ts gradeRisk 输入信号）。 */
export const RiskSignalsSchema = z.object({
  readOnly: z.boolean(),
  docOnly: z.boolean(),
  boundedWrite: z.boolean(),
  touchesTrustKernel: z.boolean(),
  newCliOrApi: z.boolean(),
  crossModule: z.boolean(),
  destructive: z.boolean(),
  irreversible: z.boolean(),
  ambiguous: z.boolean(),
});
export type RiskSignalsInput = z.infer<typeof RiskSignalsSchema>;

/** gate 请求体 = VerificationReportSchema（items + results，SSOT 在 planning/types.ts）。 */
export const GateRequestSchema = VerificationReportSchema;

// ===========================================================================
// 响应 schema（统一信封 data 视图）
// ===========================================================================

/** 风险分级响应 data（gradeRisk 输出）。 */
export const RiskGradeResponseSchema = z
  .object({
    level: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
    reasons: z.array(z.string()),
  })
  .passthrough();

/** plan 校验响应 data（validatePlan 输出）。 */
export const PlanValidationResponseSchema = z
  .object({
    ok: z.boolean(),
    violations: z.array(
      z.object({
        stepId: z.string(),
        code: z.string(),
        message: z.string(),
      }),
    ),
    executionOrder: z.array(z.string()),
  })
  .passthrough();

/** spec 校验响应 data（validateSpec 输出）。 */
export const SpecValidationResponseSchema = z
  .object({
    ok: z.boolean(),
    violations: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
      }),
    ),
  })
  .passthrough();

/** gate 报告响应 data（buildGateReport 输出）。 */
export const GateReportResponseSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        command: z.string(),
        expected: z.string(),
      }),
    ),
    results: z.record(z.string(), z.object({ actual: z.string(), status: z.enum(['pass', 'fail', 'not_run']) })),
    passed: z.array(z.string()),
    failed: z.array(z.string()),
    notRun: z.array(z.string()),
    conclusion: z.enum(['DONE', 'IMPLEMENTED_UNVERIFIED', 'BLOCKED']),
    rationale: z.string(),
  })
  .passthrough();

// ===========================================================================
// Fastify route schema（zod → JSON schema，供路由 + OpenAPI 生成）
// ===========================================================================
//
// 注意：planning 路由的 handler **手动返回统一信封** { ok: true, data: T }
// （与 v2_receipts 同模式，src/api/routes/v2_receipts.ts）。原因：v1 onSend hook
// 用 `!('ok' in body)` 判断是否已包装——plan/spec 门禁结果本身含 ok 键（{ok,
// violations, ...}），若返回裸对象会被 hook 误判为"已包装"而跳过信封包装。
// 手动包信封 + response schema 带信封（ok 字段），序列化与 wire 形态一致。

/** 错误响应 schema 复用（400/404/500 均映射到 RFC 7807）。 */
const errorSchema = z
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

/** 统一成功信封 schema。 */
function envelope(data: z.ZodTypeAny): z.ZodTypeAny {
  return z.object({ ok: z.literal(true), data }).passthrough();
}

export const RiskRouteSchema: FastifySchema = {
  body: toRouteSchema(RiskSignalsSchema),
  response: {
    200: toRouteSchema(envelope(RiskGradeResponseSchema)),
    400: toRouteSchema(errorSchema),
  },
};

export const PlanRouteSchema: FastifySchema = {
  body: toRouteSchema(PlanSchema),
  response: {
    200: toRouteSchema(envelope(PlanValidationResponseSchema)),
    400: toRouteSchema(errorSchema),
  },
};

export const SpecRouteSchema: FastifySchema = {
  body: toRouteSchema(SpecSchema),
  response: {
    200: toRouteSchema(envelope(SpecValidationResponseSchema)),
    400: toRouteSchema(errorSchema),
  },
};

export const GateRouteSchema: FastifySchema = {
  body: toRouteSchema(GateRequestSchema),
  response: {
    200: toRouteSchema(envelope(GateReportResponseSchema)),
    400: toRouteSchema(errorSchema),
  },
};
