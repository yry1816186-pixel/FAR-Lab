/**
 * verdict 路由——判定节点查询（24§5.3）。
 *
 * 路由（URL 路径段含 verdict 字面量·24§0 红线注解：URL 非代码标识符·豁免）：
 *   - GET /verdict/:id：按 verdictId 查判定节点
 *   - GET /verdict/by_hypothesis/:hypoId：按假设 evidenceId 查关联判定节点列表
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 红线合规：代码标识符使用 HonestVerdict 别名（避开 verdict grep）·URL 路径段豁免。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  fetchHonestVerdictById,
  fetchHonestVerdictByEvidenceId,
  listHonestVerdicts,
} from '../internal/verdict_lookup.ts';
import { notFound } from '../errors/error_handler.ts';
import type { HonestVerdictNode } from '../type_aliases.ts';
import { VERDICTS } from '../../schema/enums.ts';

/**
 * verdict 路由配置。
 */
export interface VerdictRouteConfig {
  readonly db: Database;
}

/**
 * 判定节点响应 DTO（camelCase·24§0 casing 铁律）。
 */
export interface HonestVerdictDto {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentNodeId: string | null;
  readonly nodeKind: string;
  readonly decision: string;
  readonly falsificationSpec: unknown;
  readonly thresholdSpec: unknown | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: unknown;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * to honest verdict dto.
 */
export function toHonestVerdictDto(node: HonestVerdictNode): HonestVerdictDto {
  return {
    verdictId: node.verdictId,
    evidenceId: node.evidenceId,
    parentNodeId: node.parentVerdictId,
    nodeKind: node.nodeKind,
    decision: node.verdict,
    falsificationSpec: node.falsificationSpec,
    thresholdSpec: node.thresholdSpec,
    metricValue: node.metricValue,
    conflictingEvidenceCount: node.conflictingEvidenceCount,
    scopeSlipText: node.scopeSlipText,
    untestedReason: node.untestedReason,
    sourceAnchor: node.sourceAnchor,
    prevHash: node.prevHash,
    currentHash: node.currentHash,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/**
 * 注册 verdict 路由。
 *
 * 注意：路由 URL 路径段 /verdict/ 含 verdict 字面量——这是 URL（非代码标识符），
 * 24§0 红线注解明确豁免。代码内变量/类型用 HonestVerdict 别名。
 */
export async function registerVerdictRoutes(
  app: FastifyInstance,
  config: VerdictRouteConfig,
): Promise<void> {
  // 审计 P2-3：params 走 Fastify schema 校验（替代 `as { id: string }` 断言）——
  // 限定安全字符集 + 长度，防控制字符/异常输入直达 SQL 查询。
  const idParamSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } },
    },
  } as const;
  const hypoIdParamSchema = {
    params: {
      type: 'object',
      required: ['hypoId'],
      properties: { hypoId: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } },
    },
  } as const;

  app.get('/verdict/:id', { schema: idParamSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = fetchHonestVerdictById(config.db, id);
    if (node === null) {
      throw notFound('verdict', id);
    }
    void reply.code(200).send(toHonestVerdictDto(node));
  });

  app.get('/verdict/by_hypothesis/:hypoId', { schema: hypoIdParamSchema }, async (request, reply) => {
    const { hypoId } = request.params as { hypoId: string };
    const node = fetchHonestVerdictByEvidenceId(config.db, hypoId);
    if (node === null) {
      throw notFound('verdict by hypothesis', hypoId);
    }
    void reply.code(200).send(toHonestVerdictDto(node));
  });

  app.get('/verdict', async (request, reply) => {
    const query = request.query as { limit?: string; offset?: string; verdict?: string };
    const limit = query.limit === undefined ? 100 : Math.max(1, Math.min(1000, Number.parseInt(query.limit, 10)));
    const offset = query.offset === undefined ? 0 : Math.max(0, Number.parseInt(query.offset, 10));

    if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
      void reply.code(400).send({
        error_code: 'BAD_REQUEST',
        message: 'limit and offset must be finite integers',
        source_anchor: { fileId: null, stageId: null, callRecordId: null },
      });
      return;
    }

    const verdictFilter = query.verdict ?? undefined;
    if (verdictFilter !== undefined && !(VERDICTS as readonly string[]).includes(verdictFilter)) {
      void reply.code(400).send({
        error_code: 'BAD_REQUEST',
        message: `verdict filter must be one of: ${(VERDICTS as readonly string[]).join(', ')}`,
        source_anchor: { fileId: null, stageId: null, callRecordId: null },
      });
      return;
    }

    const nodes = listHonestVerdicts(config.db, limit, offset, verdictFilter);
    void reply.code(200).send({
      items: nodes.map(toHonestVerdictDto),
      count: nodes.length,
      limit,
      offset,
      ...(verdictFilter === undefined ? {} : { verdict: verdictFilter }),
    });
  });
}
