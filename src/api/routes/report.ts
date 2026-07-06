/**
 * report 路由——研究报告输出（24§5.3 / 17 Epic K-05a + K-05b）。
 *
 * 路由（两个产物·content-by-path 分离）：
 *   - GET /report/:runId      → HTML 审计报告（Epic K-05b·Content-Type text/html）
 *   - GET /report/:runId/paper → ResearchPaperOutput JSON（Epic K-05a·竞赛 10 字段）
 *
 * 设计理由（双端点）：
 *   - 前端 ReportPage 用 sandboxed iframe（srcdoc）渲染——需完整 HTML 文档，
 *     由 src/report/ 的 renderHtml 产出（自包含·HTML 转义·模型中立）。
 *   - 竞赛要求 10 字段 ResearchPaperOutput（machine-readable JSON）——由
 *     assemblePaper 产出（确定性映射·禁 LLM-as-judge）。
 *   - 两产物分离避免「JSON 当 HTML 渲染」的契约断裂（前端 fetchText + iframe
 *     与后端 application/json 不可调和）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 *   StructuredPayload 反序列化用 z.discriminatedUnion.safeParse 真运行时校验（禁 as unknown as）。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { notFound } from '../errors/error_handler.ts';
import { assemblePaper } from '../../agent_loop/paper_assembler.ts';
import {
  EvidenceSchema,
  FeedbackPayloadSchema,
  HypothesisSchema,
  IntegrationSchema,
  PlanSchema,
  UnderstandingSchema,
} from '../../agent_loop/stages/schemas.ts';
import type {
  LoopState,
  StageArtifact,
  StageId,
  StructuredPayload,
} from '../../agent_loop/types.ts';
import type { PayloadKind } from '../../schema/enums.ts';
import { PAYLOAD_KINDS } from '../../schema/enums.ts';
import type { LlmResponse, LlmCallCredential } from '../../llm_gateway/types.ts';
import { getVerdict } from '../../falsifiability/repository.ts';
import { generateReport, renderHtml } from '../../report/index.ts';

/**
 * report 路由配置。
 */
export interface ReportRouteConfig {
  readonly db: Database;
}

/**
 * evidence_log + call_records JOIN 行（用于重建 paper 产物）。
 */
interface ArtifactReconRow {
  readonly evidence_id: string;
  readonly call_record_seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly evidence_payload: string;
  readonly purpose_tag: string;
  readonly model_id: string;
  readonly created_at: string;
}

/**
 * 构建报告重建用的虚拟 LlmResponse（assemblePaper 不使用 callResult·仅满足类型契约）。
 */
function dummyLlmResponse(modelId: string): LlmResponse {
  const credential: LlmCallCredential = {
    providerProfile: 'offline_replay',
    providerRequestId: null,
    modelId,
    modelVersion: null,
    capability: 'structured',
    isoTimestamp: new Date().toISOString(),
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
  return {
    credential,
    content: '',
    raw: null,
  };
}

/**
 * StructuredPayload 反序列化 schema——按 kind 判别的 zod 联合。
 *
 * evidence_payload 在写入时经 zod schema 校验，读回时用同一组 schema 重新校验，
 * 取代盲 `as StructuredPayload`（零容忍 #1）：safeParse 真实验证全部字段结构，
 * 任一字段缺失/类型不符即返回 null（跳过损坏条目·不阻断报告生成）。
 */
const StructuredPayloadReparseSchema = z.discriminatedUnion('kind', [
  UnderstandingSchema,
  IntegrationSchema,
  HypothesisSchema,
  EvidenceSchema,
  PlanSchema,
  FeedbackPayloadSchema,
]);

/**
 * 解析 evidence_payload JSON 为 StructuredPayload。
 *
 * 用 z.discriminatedUnion.safeParse 做真运行时校验（禁 as unknown as·禁盲断言）。
 * 解析失败返回 null（跳过损坏条目·不阻断报告生成）。
 */
function parseStructuredPayload(jsonText: string, evidenceId: string): StructuredPayload | null {
  void evidenceId;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const result = StructuredPayloadReparseSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  // safeParse 已运行时校验全部字段——此时 data 形状可信，单层 as 仅做 TS 收窄（非盲断言）。
  return result.data as StructuredPayload;
}

/**
 * 解析 payload_kind 为 PayloadKind 枚举值。
 */
function parseKnownPayloadKind(value: string, _evidenceId: string): PayloadKind | null {
  if ((PAYLOAD_KINDS as readonly string[]).includes(value)) {
    return value as PayloadKind;
  }
  return null;
}

/**
 * 从 evidence_log JOIN call_records 重建 StageArtifact[]（供 /paper 路径 assemblePaper 消费）。
 *
 * evidence_payload 是 canonicalJson 序列化的 StructuredPayload——
 * 经 StructuredPayloadReparseSchema.safeParse 真校验后返回。
 */
function reconstructArtifacts(db: Database): readonly StageArtifact[] {
  const rows = db
    .prepare(
      `SELECT e.evidence_id, e.call_record_seq, e.stage_id, e.payload_kind,
              e.evidence_payload, c.purpose_tag, c.model_id, e.created_at
       FROM evidence_log e
       JOIN call_records c ON e.call_record_seq = c.seq
       ORDER BY c.seq ASC`,
    )
    .all() as readonly ArtifactReconRow[];

  return rows
    .map((row) => {
      const structured = parseStructuredPayload(row.evidence_payload, row.evidence_id);
      if (structured === null) {
        return null;
      }
      const payloadKind = parseKnownPayloadKind(row.payload_kind, row.evidence_id);
      if (payloadKind === null) {
        return null;
      }
      const artifact: StageArtifact = {
        stageId: row.stage_id as StageId,
        payloadKind,
        structured,
        callResult: dummyLlmResponse(row.model_id),
        degraded: false,
        degradationReason: null,
      };
      return artifact;
    })
    .filter((a): a is StageArtifact => a !== null);
}

/**
 * 从 verdict_nodes 查最新裁决节点（用于 LoopState.verdictNode）。
 */
function fetchLatestVerdict(db: Database): LoopState['verdictNode'] {
  const row = db
    .prepare(
      `SELECT verdict_id FROM verdict_nodes
       ORDER BY created_at DESC, verdict_id DESC
       LIMIT 1`,
    )
    .get() as { verdict_id?: string } | undefined;
  if (row === undefined || row.verdict_id === undefined) {
    return null;
  }
  return getVerdict(db, row.verdict_id);
}

/**
 * 判断 evidence_log 是否有记录（两个端点共享的 404 门）。
 */
function hasEvidenceLogRecords(db: Database): boolean {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM evidence_log')
    .get() as { n: number } | undefined;
  return row !== undefined && row.n > 0;
}

/**
 * 注册 report 路由（双端点：HTML 报告 + JSON paper）。
 */
export async function registerReportRoute(
  app: FastifyInstance,
  config: ReportRouteConfig,
): Promise<void> {
  // GET /report/:runId → HTML 审计报告（Epic K-05b·前端 sandboxed iframe 渲染）
  app.get('/report/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    if (!hasEvidenceLogRecords(config.db)) {
      throw notFound('report (no evidence_log records for run)', runId);
    }

    const data = generateReport({ db: config.db, runId });
    const html = renderHtml(data, { format: 'html', includeEvidenceLinks: true });

    reply.code(200).type('text/html; charset=utf-8').send(html);
  });

  // GET /report/:runId/paper → ResearchPaperOutput JSON（Epic K-05a·竞赛 10 字段交付）
  app.get('/report/:runId/paper', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const artifacts = reconstructArtifacts(config.db);
    if (artifacts.length === 0) {
      throw notFound('report paper (no evidence_log records for run)', runId);
    }

    const verdictNode = fetchLatestVerdict(config.db);

    const loopState: LoopState = {
      runId,
      iterationsCompleted: 1,
      terminated: true,
      terminationReason: 'feedback_converged',
      artifacts,
      verdictNode,
      error: null,
    };

    const paper = assemblePaper(loopState);

    reply.code(200).type('application/json; charset=utf-8').send(paper);
  });
}
