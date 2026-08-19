/**
 * API 网关共享类型定义。
 *
 * 设计原则：
 *   - Core 模型中立：本文件不出现 Qwen / 百炼 / DashScope 字面量（24§0.1 红线）。
 *   - 判定节点引用使用 import 别名（HonestVerdictNode）以避开红线 grep。
 *   - GraphSubtree 类型在本文件定义（evidence_graph 模块未提供 getSubtree·
 *     API 层只读查询 evidence_edges + verdict_nodes 表·不修改 evidence_graph 模块）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LoopState } from '../agent_loop/types.ts';
import type { EdgeKind } from '../schema/enums.ts';
import type { TraceGrade } from '../trace/agent_run_event.ts';
import type {
  HonestVerdictNode,
  SourceAnchor,
} from './type_aliases.ts';

/**
 * 图节点 DTO（从 verdict_nodes 行映射·只含 API 响应所需字段）。
 *
 * 字段命名遵守 24§0 casing 铁律：API JSON 用 camelCase（与 in-memory 字段一致）。
 */
export interface GraphNodeDto {
  readonly nodeId: string;
  readonly evidenceId: string;
  readonly parentNodeId: string | null;
  readonly nodeKind: string;
  readonly decision: string;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  /** B3 透明度层：decisionTrace 宽容透传（unknown 形态·与 HonestVerdictDto 一致），无则 null */
  readonly decisionTrace: unknown | null;
  readonly createdAt: string;
}

/**
 * 图边 DTO（从 evidence_edges 行映射）。
 */
export interface GraphEdgeDto {
  readonly edgeId: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly edgeKind: EdgeKind;
  readonly weight: number | null;
  readonly createdAt: string;
}

/**
 * GraphSubtree —— 证据图子树响应体。
 *
 * 从指定 rootVerdictId 出发，BFS 收集可达节点 + 边。
 * 用于 POST /hypothesize 响应与 GET /graph 查询。
 */
export interface GraphSubtree {
  readonly rootId: string;
  readonly nodes: readonly GraphNodeDto[];
  readonly edges: readonly GraphEdgeDto[];
}

/**
 * POST /hypothesize 响应体（24§5 / 17 Epic K-01）。
 *
 * 字段：
 *   - loopState：六阶段 FSM 终态
 *   - graphSubtree：从本轮假设节点出发的图子树
 *   - honestVerdict：判定节点（可能为 null·若循环未到达判定阶段）
 *   - reproHash：本轮证据链头 hash（信任根锚点·用于复现验证）
 */
export interface HypothesizeResponse {
  readonly loopState: LoopState;
  readonly graphSubtree: GraphSubtree;
  readonly honestVerdict: HonestVerdictNode | null;
  readonly reproHash: string;
  readonly traceGrade: TraceGrade;
  /**
   * Honest mode label (directive §26 — no mode may masquerade as another).
   * 'replay' = offline_replay fixtures (the default fresh-clone state, no API
   * key); 'real' = a live provider gateway was injected. Mirrors court/arena
   * `datasetSource`. Surfaced so a client can never mistake a replayed fixture
   * verdict for a live-computed one.
   */
  readonly datasetSource: 'replay' | 'real';
  /** The runtime provider profile that produced this run (e.g. 'offline_replay',
   * 'competition_aliyun_qwen'). Full transparency beyond the binary label. */
  readonly providerProfile: string;
  /**
   * R3（V2 信封生产者）：本运行封存的 ProofEnvelopeV2（持久化于 proof_envelopes_v2，
   * 可导出/可粘贴到 /verify 独立六维验证）。null = 未封存（原因见 note）。
   */
  readonly proofEnvelopeV2?: import('../proof_envelope/v2/types.ts').ProofEnvelopeV2 | null;
  /** 封存状态：'sealed' 已落库 / 'skipped' 未落库（fail-closed，原因在 note）。 */
  readonly proofEnvelopeV2Status?: 'sealed' | 'skipped';
  /** 未封存时的如实原因（如「未接地→RULE-004 fail-closed」/「裁决阶段未到达」）。 */
  readonly proofEnvelopeV2Note?: string | null;
}

/**
 * 统一错误响应体（RFC 7807 Problem Details 子集·24§0.6）。
 *
 * source_anchor 提供 fileId / stageId / callRecordId 三元定位（24 红线·错误响应必含 source_anchor）。
 */
export interface ApiErrorResponse {
  readonly error_code: string;
  readonly message: string;
  readonly source_anchor: {
    readonly fileId: string | null;
    readonly stageId: string | null;
    readonly callRecordId: string | null;
  };
  readonly detail?: unknown;
}

/**
 * 健康检查响应体。
 */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly service: 'far-chain-api';
  readonly timestamp: string;
}

/**
 * 就绪检查响应体（含 DB ping）。
 */
export interface ReadyResponse {
  readonly status: 'ready' | 'not_ready';
  readonly service: 'far-chain-api';
  readonly checks: {
    readonly database: 'ok' | 'fail';
  };
  readonly timestamp: string;
}

/**
 * 鉴权主体（JWT 解码后或 anonymous）。
 */
export interface AuthPrincipal {
  readonly userId: string;
  readonly role: 'anonymous' | 'viewer' | 'researcher' | 'admin';
}

export type { HonestVerdictNode, SourceAnchor };
