/**
 * hypothesize 路由——POST /hypothesize（17 Epic K-01）。
 *
 * 职责：
 *   - 接收 researchInput + mode + dialogueMode
 *   - 调用 executeLoop（适配 runAgentLoop）
 *   - 从 DB 查 stage3_hypothesis 关联 evidenceId → 查 GraphSubtree
 *   - 查判定节点（HonestVerdictNode·从 evidence_id 关联）
 *   - 返回 { loopState, graphSubtree, honestVerdict, reproHash }
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import type { AppendRecordOptions } from '../../evidence_log/types.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import { executeLoop } from '../internal/loop_runner.ts';
import { fetchHonestVerdictByEvidenceId } from '../internal/verdict_lookup.ts';
import { extractHypothesisEvidenceId, buildSubtreeFromEvidence } from '../internal/hypothesis_helpers.ts';
import { ApiError } from '../errors/error_handler.ts';
import type { GraphSubtree, HypothesizeResponse } from '../types.ts';

/**
 * hypothesize 路由配置。
 */
export interface HypothesizeRouteConfig {
  readonly db: Database;
  readonly gitCommitSha: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  readonly appendOptions?: AppendRecordOptions;
}

const HypothesizeRequestSchema = z.object({
  researchInput: z.string().min(1).max(2000),
  mode: z.enum(['full', 'quick']).optional(),
  dialogueMode: z.enum(['disabled', 'enabled']).optional(),
});

/**
 * 注册 POST /hypothesize 路由。
 */
export async function registerHypothesizeRoute(
  app: FastifyInstance,
  config: HypothesizeRouteConfig,
): Promise<void> {
  app.post('/hypothesize', async (request, reply) => {
    const parsed = HypothesizeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'hypothesize request schema validation failed',
        detail: parsed.error.issues,
      });
    }

    const { loopState, reproHash, traceGrade } = await executeLoop({
      researchInput: parsed.data.researchInput,
      evidenceLogDb: config.db,
      gitCommitSha: config.gitCommitSha,
      ...(parsed.data.mode === undefined ? {} : { mode: parsed.data.mode }),
      ...(parsed.data.dialogueMode === undefined ? {} : { dialogueMode: parsed.data.dialogueMode }),
      ...(config.gateway === undefined ? {} : { gateway: config.gateway }),
      ...(config.profile === undefined ? {} : { profile: config.profile }),
      ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
    });

    const hypothesisEvidenceId = extractHypothesisEvidenceId(config.db, loopState);
    const graphSubtree: GraphSubtree = hypothesisEvidenceId === null
      ? { rootId: 'none', nodes: [], edges: [] }
      : buildSubtreeFromEvidence(config.db, hypothesisEvidenceId);

    const honestVerdict = hypothesisEvidenceId === null
      ? null
      : fetchHonestVerdictByEvidenceId(config.db, hypothesisEvidenceId);

    const body: HypothesizeResponse = {
      loopState,
      graphSubtree,
      honestVerdict,
      reproHash,
      traceGrade,
    };

    void reply.code(200).send(body);
  });
}
