/**
 * planning API routes — /api/v1/planning endpoints.
 *
 * 规划门禁方法论源代码化的 HTTP 层：确定性门禁引擎（src/planning/）经 REST 暴露，
 * 供前端规划面板 / 外部工具 / 自动化管线调用。
 *
 * 端点（全部确定性、无 LLM）：
 *   POST /api/v1/planning/risk    — 风险分级 P0-P4（gradeRisk）
 *   POST /api/v1/planning/plan    — Plan DAG 校验（validatePlan）→ violations + 拓扑执行序
 *   POST /api/v1/planning/spec    — Spec 可验证规格校验（validateSpec）
 *   POST /api/v1/planning/gate    — 四步门函数验证报告（buildGateReport）
 *
 * 契约：handler 显式返回 { ok: true, data: T }；v1 preSerialization hook 识别后不双包；
 * ajv 校验失败 → 400 VALIDATION_FAILED（RFC 7807）。
 */

import type { FastifyInstance } from 'fastify';

import { buildGateReport } from '../../planning/gate.ts';
import { validatePlan } from '../../planning/plan.ts';
import { gradeRisk } from '../../planning/risk.ts';
import { validateSpec } from '../../planning/spec.ts';
import type { Plan, Spec } from '../../planning/types.ts';
import type { RiskSignalsInput } from './planning_schemas.ts';
import {
  GateRouteSchema,
  PlanRouteSchema,
  RiskRouteSchema,
  SpecRouteSchema,
} from './planning_schemas.ts';

/**
 * Register planning API routes under the given Fastify instance (prefix /api/v1).
 */
export async function registerPlanningRoutes(app: FastifyInstance): Promise<void> {
  // POST /planning/risk — 风险分级（信号布尔集 → P0-P4 + 可审计 reasons）。
  // 手动包统一信封（原因见 planning_schemas.ts 注释：门禁结果含 ok 键，与 v1 onSend 判据冲突）。
  app.post('/planning/risk', { schema: RiskRouteSchema }, async (request, reply) => {
    const signals = request.body as RiskSignalsInput;
    const result = gradeRisk({
      readOnly: signals.readOnly,
      docOnly: signals.docOnly,
      boundedWrite: signals.boundedWrite,
      touchesTrustKernel: signals.touchesTrustKernel,
      newCliOrApi: signals.newCliOrApi,
      crossModule: signals.crossModule,
      destructive: signals.destructive,
      irreversible: signals.irreversible,
      ambiguous: signals.ambiguous,
    });
    return reply.code(200).send({ ok: true, data: result });
  });

  // POST /planning/plan — Plan DAG 校验（依赖完整/环检测/每步可验证 → 拓扑序）。
  app.post('/planning/plan', { schema: PlanRouteSchema }, async (request, reply) => {
    const plan = request.body as Plan;
    return reply.code(200).send({ ok: true, data: validatePlan(plan) });
  });

  // POST /planning/spec — Spec 可验证规格校验（AC ≥3 / Delta / trust-kernel 声明）。
  app.post('/planning/spec', { schema: SpecRouteSchema }, async (request, reply) => {
    const spec = request.body as Spec;
    return reply.code(200).send({ ok: true, data: validateSpec(spec) });
  });

  // POST /planning/gate — 四步门函数报告（not_run fail-closed → DONE/UNVERIFIED/BLOCKED）。
  app.post('/planning/gate', { schema: GateRouteSchema }, async (request, reply) => {
    const body = request.body as { items: Parameters<typeof buildGateReport>[0]; results: Parameters<typeof buildGateReport>[1] };
    return reply.code(200).send({ ok: true, data: buildGateReport(body.items, body.results) });
  });
}
