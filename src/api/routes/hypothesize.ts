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
import type Database from 'better-sqlite3';
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
  readonly db: Database.Database;
  readonly gitCommitSha: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  readonly appendOptions?: AppendRecordOptions;
}

const HypothesizeRequestSchema = z.object({
  researchInput: z.string().min(1).max(2000),
  mode: z.enum(['full', 'quick']).optional(),
  dialogueMode: z.enum(['disabled', 'enabled']).optional(),
  // 审计 P0-2：客户端幂等键（确定性生成·防双击/网络重试重复执行）。安全字符集 + 长度限制。
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

/**
 * 幂等键注册：INSERT OR IGNORE 原子占位（防并发同 key 双跑）。
 * @returns 'claimed'（本请求执行）/ 'cached'（返回已存结果）/ 'pending'（并发进行中·409）
 */
function claimIdempotency(
  db: Database.Database,
  key: string,
  input: { researchInput: string; mode?: string; dialogueMode?: string },
): 'claimed' | 'cached' | 'pending' {
  const claimed = db
    .prepare(
      `INSERT OR IGNORE INTO hypothesize_idempotency
        (idempotency_key, research_input, mode, dialogue_mode, status)
       VALUES (?, ?, ?, ?, 'pending')`,
    )
    .run(key, input.researchInput, input.mode ?? null, input.dialogueMode ?? null);
  if (claimed.changes === 1) {
    return 'claimed';
  }
  const existing = db
    .prepare(
      `SELECT status, run_id, response_json FROM hypothesize_idempotency WHERE idempotency_key = ?`,
    )
    .get(key) as { status: string; run_id: string | null; response_json: string | null } | undefined;
  if (existing !== undefined && existing.status === 'done' && existing.response_json !== null) {
    return 'cached';
  }
  return 'pending';
}

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

    const idemKey = parsed.data.idempotencyKey;

    // 审计 P0-2 幂等路径：已完成的同 key 请求直接返回缓存结果（不重跑 LLM / 不重复写证据链）。
    if (idemKey !== undefined) {
      const claim = claimIdempotency(config.db, idemKey, {
        researchInput: parsed.data.researchInput,
        ...(parsed.data.mode === undefined ? {} : { mode: parsed.data.mode }),
        ...(parsed.data.dialogueMode === undefined ? {} : { dialogueMode: parsed.data.dialogueMode }),
      });
      if (claim === 'cached') {
        const existing = config.db
          .prepare(
            `SELECT response_json FROM hypothesize_idempotency WHERE idempotency_key = ?`,
          )
          .get(idemKey) as { response_json: string };
        const cachedBody = JSON.parse(existing.response_json) as HypothesizeResponse;
        void reply.code(200).send({ ...cachedBody, cached: true });
        return;
      }
      if (claim === 'pending') {
        throw new ApiError({
          statusCode: 409,
          errorCode: 'IDEMPOTENCY_PENDING',
          message: 'a run with this idempotencyKey is already in progress',
          detail: { idempotencyKey: idemKey },
        });
      }
    }

    let loopResult: Awaited<ReturnType<typeof executeLoop>>;
    try {
      loopResult = await executeLoop({
        researchInput: parsed.data.researchInput,
        evidenceLogDb: config.db,
        gitCommitSha: config.gitCommitSha,
        ...(parsed.data.mode === undefined ? {} : { mode: parsed.data.mode }),
        ...(parsed.data.dialogueMode === undefined ? {} : { dialogueMode: parsed.data.dialogueMode }),
        ...(config.gateway === undefined ? {} : { gateway: config.gateway }),
        ...(config.profile === undefined ? {} : { profile: config.profile }),
        ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
      });
    } catch (err) {
      // 失败不残留 pending 占位——删除记录让重试可重新执行。
      if (idemKey !== undefined) {
        config.db
          .prepare(`DELETE FROM hypothesize_idempotency WHERE idempotency_key = ?`)
          .run(idemKey);
      }
      throw err;
    }
    const { loopState, reproHash, runId, traceGrade } = loopResult;

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

    // 幂等记录：规范化（JSON round-trip 保证重放字节一致）后持久化。
    if (idemKey !== undefined) {
      const normalized = JSON.stringify(body);
      config.db
        .prepare(
          `UPDATE hypothesize_idempotency
           SET status = 'done', run_id = ?, response_json = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
           WHERE idempotency_key = ?`,
        )
        .run(runId, normalized, idemKey);
    }

    void reply.code(200).send(body);
  });
}
