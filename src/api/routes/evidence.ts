/**
 * evidence 路由——证据日志查询（24§5.3）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §5.3.
 *
 * 路由：
 *   - GET /evidence/:id：按 evidenceId 查证据日志条目
 *   - GET /evidence/chain/:headHash：按证据链头 hash 查证据链
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  getEvidenceLogEntry,
  getCallRecordBySeq,
} from '../../evidence_log/repository.ts';
import type { EvidenceLogEntry } from '../../evidence_log/types.ts';
import { getSubtreeByChainHead } from '../internal/graph_subtree.ts';
import { fetchHonestVerdictByEvidenceId } from '../internal/verdict_lookup.ts';
import { ApiError, notFound } from '../errors/error_handler.ts';
import { toHonestVerdictDto, type HonestVerdictDto } from './verdict.ts';

/**
 * evidence 路由配置。
 */
export interface EvidenceRouteConfig {
  readonly db: Database;
}

/**
 * 证据日志条目响应 DTO（camelCase·24§0 casing 铁律）。
 *
 * verdictNode 为关联的判定节点（可能为 null——证据条目尚未进入裁决阶段时）。
 */
export interface EvidenceLogDto {
  readonly evidenceId: string;
  readonly callRecordSeq: number;
  readonly stageId: string;
  readonly payloadKind: string;
  readonly evidencePayload: unknown;
  readonly sourceAnchor: unknown;
  readonly createdAt: string;
  readonly verdictNode: HonestVerdictDto | null;
}

/**
 * 证据链响应体（含链头 call_record + 关联 graphSubtree）。
 */
export interface EvidenceChainDto {
  readonly headHash: string;
  readonly callRecord: {
    readonly seq: number;
    readonly stageId: string;
    readonly payloadKind: string;
    readonly purposeTag: string;
    readonly modelId: string;
    readonly reproHash: string;
    readonly gitCommitSha: string;
    readonly isoTimestamp: string;
    readonly finishReason: string;
    readonly usageTokensTotal: number | null;
    readonly prevHash: string;
    readonly currentHash: string;
    readonly createdAt: string;
  } | null;
  readonly graphSubtree: unknown;
}

/**
 * 注册 evidence 路由。
 */
export async function registerEvidenceRoutes(
  app: FastifyInstance,
  config: EvidenceRouteConfig,
): Promise<void> {
  app.get('/evidence/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    let entry: EvidenceLogEntry;
    try {
      entry = getEvidenceLogEntry(config.db, id);
    } catch {
      throw notFound('evidence', id);
    }

    const verdictNode = fetchHonestVerdictByEvidenceId(config.db, id);

    const body: EvidenceLogDto = {
      evidenceId: entry.evidenceId,
      callRecordSeq: entry.callRecordSeq,
      stageId: entry.stageId,
      payloadKind: entry.payloadKind,
      evidencePayload: JSON.parse(entry.evidencePayload) as unknown,
      sourceAnchor: entry.sourceAnchor,
      createdAt: entry.createdAt,
      verdictNode: verdictNode === null ? null : toHonestVerdictDto(verdictNode),
    };

    void reply.code(200).send(body);
  });

  app.get('/evidence/chain/:headHash', async (request, reply) => {
    const { headHash } = request.params as { headHash: string };
    if (!/^[0-9a-f]{64}$/.test(headHash)) {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'BAD_REQUEST',
        message: 'headHash must be a 64-character hex string',
      });
    }

    const graphSubtree = getSubtreeByChainHead(config.db, headHash);

    const row = config.db
      .prepare(
        `SELECT seq, stage_id, payload_kind, purpose_tag, model_id, repro_hash,
                git_commit_sha, iso_timestamp, finish_reason, usage_tokens_total,
                prev_hash, current_hash, created_at
         FROM call_records
         WHERE current_hash = ?
         LIMIT 1`,
      )
      .get(headHash) as {
        seq: number;
        stage_id: string;
        payload_kind: string;
        purpose_tag: string;
        model_id: string;
        repro_hash: string;
        git_commit_sha: string;
        iso_timestamp: string;
        finish_reason: string;
        usage_tokens_total: number | null;
        prev_hash: string;
        current_hash: string;
        created_at: string;
      } | undefined;

    const body: EvidenceChainDto = {
      headHash,
      callRecord: row === undefined ? null : {
        seq: row.seq,
        stageId: row.stage_id,
        payloadKind: row.payload_kind,
        purposeTag: row.purpose_tag,
        modelId: row.model_id,
        reproHash: row.repro_hash,
        gitCommitSha: row.git_commit_sha,
        isoTimestamp: row.iso_timestamp,
        finishReason: row.finish_reason,
        usageTokensTotal: row.usage_tokens_total,
        prevHash: row.prev_hash,
        currentHash: row.current_hash,
        createdAt: row.created_at,
      },
      graphSubtree,
    };

    void reply.code(200).send(body);
  });

  void getCallRecordBySeq;
}
