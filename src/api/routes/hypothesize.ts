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
import { buildAndSealAskEnvelope } from '../../proof_envelope/v2/ask_envelope.ts';
import { createReplayAdapter } from '../../retrieval/index.ts';
import { RESEARCH_DEMO_DOCS } from '../../research/research_fixtures.ts';
import type { GraphSubtree, HypothesizeResponse } from '../types.ts';
import type { AgentEventBus } from '../../agent_loop/events.ts';

/**
 * hypothesize 路由配置。
 */
export interface HypothesizeRouteConfig {
  readonly db: Database.Database;
  readonly gitCommitSha: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  /**
   * G3 LLM 环境锚：live profile 必需（否则 executeLoop 抛 REPRO_BRIDGE_NOT_CONFIGURED
   * 裸 500——曾实测生产 500 根因即 server 未把 modelSnapshot 转发进本路由）。
   */
  readonly modelSnapshot?: string;
  readonly appendOptions?: AppendRecordOptions;
  /**
   * P0-4 运行时事件流：注入则本路由把 loop 事件发布到总线（/events/stream
   * SSE 订阅者实时可见）。未注入零行为变化（onEvent 透传是 ADDITIVE ONLY）。
   */
  readonly eventBus?: AgentEventBus;
}

const HypothesizeRequestSchema = z.object({
  researchInput: z.string().min(1).max(2000),
  mode: z.enum(['full', 'quick']).optional(),
  dialogueMode: z.enum(['disabled', 'enabled']).optional(),
  /**
   * R3：接地开关（opt-in）。true → 裁决前先跑文献接地（replay 模式用已提交的
   * 重放语料·live 模式走真实源）——V2 证明信封的 datasetBinding 只有在接地运行
   * 上才存在（RULE-004 fail-closed：未接地运行不产信封，如实说明）。
   */
  grounded: z.boolean().optional(),
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
    // API1 BOLA 修复：受保护模式下（principal 非 anonymous）
    // 写路由须 researcher+ 角色。offline 模式（principal 未挂载或 anonymous）全放行（设计·24§3.1 双轨）。
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      throw new ApiError({
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'viewer role is read-only (hypothesize: researcher/admin required)',
      });
    }
    const parsed = HypothesizeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'hypothesize request schema validation failed',
        detail: parsed.error.issues,
      });
    }

    // 无 LLM 网关（未配置 key）→ 503 fail-closed：绝不静默回放离线 fixture 冒充
    // 对任意问题的六阶段科研产出（同 research 路由的 no-key 纪律）。
    if (config.gateway === undefined) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'hypothesize_live_profile_unavailable',
        message: 'live hypothesis runs need an API key in the environment (see far doctor)',
        detail: {
          guidance:
            'set the live-provider API key in the environment (see far doctor) for live runs; ' +
            'replay fixtures exist only for explicit test wiring (far ask --profile offline_replay), never as a served result',
        },
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
        // datasetSource is a property of the running server instance (not the
        // cached result), so recompute it at serve time — old cached rows from
        // before this field existed get an honest label too.
        void reply.code(200).send({
          ...cachedBody,
          cached: true,
          datasetSource: config.gateway === undefined ? 'replay' : 'real',
          providerProfile: config.profile ?? 'offline_replay',
        });
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
    // R3：裁决计算观测容器（onComputation 回调在 verdict 事务提交后点火一次）。
    let capturedComputation: import('../../agent_loop/verdict_stage.ts').VerdictComputation | null = null;
    const requestStartedAt = new Date().toISOString();
    try {
      loopResult = await executeLoop({
        researchInput: parsed.data.researchInput,
        evidenceLogDb: config.db,
        gitCommitSha: config.gitCommitSha,
        ...(parsed.data.mode === undefined ? {} : { mode: parsed.data.mode }),
        ...(parsed.data.dialogueMode === undefined ? {} : { dialogueMode: parsed.data.dialogueMode }),
        ...(config.gateway === undefined ? {} : { gateway: config.gateway }),
        ...(config.profile === undefined ? {} : { profile: config.profile }),
        ...(config.modelSnapshot === undefined ? {} : { modelSnapshot: config.modelSnapshot }),
        ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
        ...(config.eventBus === undefined ? {} : { onEvent: (evt) => config.eventBus?.emit(evt) }),
        onComputation: (c) => {
          capturedComputation = c;
        },
        // R3 接地（opt-in）：replay 面用已提交重放语料（hermetic·如实 replay 标注），
        // live 面走真实源（live adapter 默认）。不接地在参数层面即不可能。
        ...(parsed.data.grounded === true
          ? {
              grounding: {
                question: parsed.data.researchInput,
                source: 'openalex' as const,
                maxPerQuery: 5,
                ...(config.profile === undefined || config.profile === 'offline_replay'
                  ? { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) }
                  : {}),
              },
            }
          : {}),
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

    // R3：V2 证明信封封存（断言检验路径的「产出→可独立验证」闭环）。
    // 裁决计算在则尝试；validator FAIL（如未接地→RULE-004）→ fail-closed 不落库，
    // 状态与原因如实进响应。信封失败绝不回滚裁决（派生产物纪律）。
    let proofEnvelopeV2: import('../../proof_envelope/v2/types.ts').ProofEnvelopeV2 | null = null;
    let proofEnvelopeV2Status: 'sealed' | 'skipped' = 'skipped';
    let proofEnvelopeV2Note: string | null = null;
    if (capturedComputation !== null) {
      const seal = buildAndSealAskEnvelope(
        config.db,
        capturedComputation,
        loopResult.grounding,
        {
          runId,
          researchInput: parsed.data.researchInput,
          reproHash,
          gitCommitSha: config.gitCommitSha,
          startedAt: requestStartedAt,
          actor: 'api-hypothesize',
          networkPolicy: config.gateway === undefined ? 'off' : 'allowlist',
        },
      );
      if (seal.persisted) {
        proofEnvelopeV2 = seal.envelope;
        proofEnvelopeV2Status = 'sealed';
      } else {
        proofEnvelopeV2Note = seal.skipReason;
      }
    } else {
      proofEnvelopeV2Note = 'no verdict computation captured (loop did not reach the verdict stage)';
    }

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
      datasetSource: config.gateway === undefined ? 'replay' : 'real',
      providerProfile: config.profile ?? 'offline_replay',
      proofEnvelopeV2,
      proofEnvelopeV2Status,
      proofEnvelopeV2Note,
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
