/**
 * Frontend type definitions — verbatim mirror of backend API DTOs (spec 24 API gateway).
 *
 * Alignment authority: spec 24 §5.3 leaves most response bodies UNspecified (only
 * the probes and a few shapes are named), so the backend implementation is the
 * contract of record for every endpoint. Source-of-truth per type:
 *   - HealthResponse / ReadyResponse        → src/api/routes/health.ts
 *   - EvidenceResponse / EvidenceChainResp. → src/api/routes/evidence.ts
 *   - HonestVerdictDto / VerdictListResp.   → src/api/routes/verdict.ts
 *   - GraphNodeDto / GraphEdgeDto / GraphSubtree / HypothesizeResponse
 *                                            → src/api/types.ts
 *   - VerdictNode (raw) / AgentLoopError / LoopState
 *                                            → src/agent_loop/types.ts + src/falsifiability/types.ts
 *   - enums                                  → src/schema/enums.ts
 *
 * Field names match the backend EXACTLY (camelCase · spec 24 §0 casing rule).
 * No aliasing, no obfuscation: the frontend consumes backend field names verbatim.
 *
 * Two verdict shapes (the backend serializes one concept two ways):
 *   - GET /api/v1/verdict/*  → HonestVerdictDto (parentNodeId, decision) — verdict route maps via toDto.
 *   - POST /api/v1/hypothesize → raw VerdictNode (parentVerdictId, verdict, replayProver) —
 *     executeLoop serializes LoopState verbatim without the toDto mapping.
 * Both shapes are modeled below as observed; they are NOT interchangeable.
 */

import type { DatasetSourceKind } from './dataset_source.ts';

// ---------- Enums (mirror src/schema/enums.ts) ----------

/** 5 verdict values. Authority: src/schema/enums.ts VERDICTS. */
export type VerdictValue =
  | 'CONFIRMED'
  | 'REFUTED'
  | 'INCONCLUSIVE'
  | 'DEGRADED_SCOPE'
  | 'UNTESTED';

/** Authority: src/schema/enums.ts VERDICT_NODE_KINDS. */
export type VerdictNodeKind =
  | 'hypothesis'
  | 'evidence'
  | 'method'
  | 'plan'
  | 'feedback'
  | 'root';

/** Authority: src/schema/enums.ts EDGE_KINDS. */
export type EdgeKind =
  | 'supports'
  | 'refutes'
  | 'derives_from'
  | 'tests'
  | 'iterates';

/** Authority: src/agent_loop/types.ts STAGE_ORDER + stage0_dialogue. */
export type StageId =
  | 'stage0_dialogue'
  | 'stage1_understanding'
  | 'stage2_integration'
  | 'stage3_hypothesis'
  | 'stage4_evidence'
  | 'stage5_plan'
  | 'stage6_feedback';

// ---------- Shared nested specs (mirror src/falsifiability/types.ts) ----------

export type ThresholdSemantics = 'gt' | 'lt' | 'range';

/** Authority: src/falsifiability/types.ts FalsificationSpec. */
export interface FalsificationSpec {
  readonly prediction: string;
  readonly metric: string;
  readonly falsificationThreshold: number;
  readonly thresholdSemantics: ThresholdSemantics;
}

/** Authority: src/falsifiability/types.ts ThresholdSpec. */
export interface ThresholdSpec {
  readonly semantics: ThresholdSemantics;
  readonly value?: number;
  readonly lower?: number;
  readonly upper?: number;
}

// ---------- Graph DTOs (mirror src/api/types.ts) ----------

/** Graph node DTO — maps from a verdict_nodes row (API response fields only). */
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
  readonly createdAt: string;
}

/** Graph edge DTO — maps from an evidence_edges row. */
export interface GraphEdgeDto {
  readonly edgeId: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly edgeKind: EdgeKind;
  readonly weight: number | null;
  readonly createdAt: string;
}

/** GraphSubtree — evidence-graph subtree snapshot. */
export interface GraphSubtree {
  readonly rootId: string;
  readonly nodes: readonly GraphNodeDto[];
  readonly edges: readonly GraphEdgeDto[];
}

// ---------- Verdict shapes ----------

/**
 * HonestVerdictDto — shape returned by GET /api/v1/verdict/* routes.
 * Authority: src/api/routes/verdict.ts HonestVerdictDto (toDto-mapped).
 * Note: `decision` (not `verdict`), `parentNodeId` (not `parentVerdictId`), no replayProver.
 */
export interface HonestVerdictDto {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentNodeId: string | null;
  readonly nodeKind: string;
  readonly decision: VerdictValue;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: unknown;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * A1/B3 决策路径追踪（后端 HonestVerdictDto.decisionTrace·透明度层）。
   * 形状：{ firedRuleId, r7Gate, metrics, totalRulesInTree, cannotProveStatement }。
   * 旧库行（B3 前）无此字段 → API 返回 null。前端消费须安全提取（见 EvidenceTimeline）。
   */
  readonly decisionTrace: unknown;
}

/**
 * VerdictNode (raw) — shape returned inside POST /api/v1/hypothesize (loopState.verdictNode
 * and top-level honestVerdict). Authority: src/falsifiability/types.ts VerdictNode.
 * Note: `verdict` (not `decision`), `parentVerdictId` (not `parentNodeId`), has replayProver.
 */
export interface VerdictNode {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: VerdictValue;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: unknown;
  readonly replayProver: unknown;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** GET /api/v1/verdict response (paginated). */
export interface VerdictListResponse {
  readonly items: readonly HonestVerdictDto[];
  readonly count: number;
  readonly limit: number;
  readonly offset: number;
}

// ---------- Agent loop (mirror src/agent_loop/types.ts) ----------

/** Authority: src/agent_loop/types.ts AgentLoopError (code union simplified to string). */
export interface AgentLoopError {
  readonly code: string;
  readonly message: string;
  readonly stageId: StageId | null;
  readonly cause?: unknown;
}

/**
 * LoopState — authority: src/agent_loop/types.ts LoopState.
 * `artifacts` is an opaque array on the frontend (full StageArtifact shape is backend-internal);
 * `verdictNode` is the raw VerdictNode shape (see note above).
 */
export interface LoopState {
  readonly runId: string;
  readonly iterationsCompleted: number;
  readonly terminated: boolean;
  readonly terminationReason:
    | 'feedback_converged'
    | 'max_iterations'
    | 'max_tokens'
    | 'max_duration'
    | 'error';
  readonly artifacts: readonly unknown[];
  readonly verdictNode: VerdictNode | null;
  readonly error: AgentLoopError | null;
}

// ---------- API request / response envelopes ----------

/** POST /api/v1/hypothesize request body. Authority: src/api/routes/hypothesize.ts HypothesizeRequestSchema. */
export interface HypothesizeRequest {
  readonly researchInput: string;
  readonly mode?: 'full' | 'quick';
  readonly dialogueMode?: 'disabled' | 'enabled';
  /** 审计 P0-2：客户端幂等键（服务端对同 key 重放返回缓存结果·防双击/网络重试重复执行）。 */
  readonly idempotencyKey?: string;
}

/** POST /api/v1/hypothesize response. Authority: src/api/types.ts HypothesizeResponse. */
export interface HypothesizeResponse {
  readonly loopState: LoopState;
  readonly graphSubtree: GraphSubtree;
  readonly honestVerdict: VerdictNode | null;
  readonly reproHash: string;
}

/** GET /health response. Authority: src/api/routes/health.ts (probe, bare root). */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly service: 'far-chain-api';
  readonly timestamp: string;
}

/** GET /ready response. Authority: src/api/routes/health.ts (probe, bare root). */
export interface ReadyResponse {
  readonly status: 'ready' | 'not_ready';
  readonly service: 'far-chain-api';
  readonly checks: { readonly database: 'ok' | 'fail' };
  readonly timestamp: string;
}

/** GET /api/v1/evidence/:id response. Authority: src/api/routes/evidence.ts EvidenceLogDto. */
export interface EvidenceResponse {
  readonly evidenceId: string;
  readonly callRecordSeq: number;
  readonly stageId: string;
  readonly payloadKind: string;
  readonly evidencePayload: unknown;
  readonly sourceAnchor: unknown;
  readonly createdAt: string;
  /**
   * 关联的判定节点（HonestVerdictDto）——证据条目尚未进入裁决阶段时为 null。
   * Authority: src/api/routes/evidence.ts EvidenceLogDto.verdictNode（fetchHonestVerdictByEvidenceId）。
   * 镜像契约对齐（audit [G]）：此前前端缺该字段，导致前端无法类型安全访问后端已返回的 verdictNode。
   */
  readonly verdictNode: HonestVerdictDto | null;
}

/** GET /api/v1/evidence/chain/:headHash call-record row. Authority: src/api/routes/evidence.ts EvidenceChainDto. */
export interface EvidenceChainCallRecord {
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
}

/** GET /api/v1/evidence/chain/:headHash response. */
export interface EvidenceChainResponse {
  readonly headHash: string;
  readonly callRecord: EvidenceChainCallRecord | null;
  readonly graphSubtree: unknown;
}

/**
 * GET /api/v1/report/:runId response.
 * Authority: src/api/routes/report.ts — the endpoint returns an HTML document
 * (Content-Type: text/html; charset=utf-8), per Epic K-05b HTML template stub.
 * Full JSON aggregation (ResearchPaperOutput) lands with K-05a; until then the
 * response body is a raw HTML string (render via a sandboxed iframe, never
 * dangerouslySetInnerHTML — per frontend rule).
 */
export type ReportResponse = string;

// ---------- Integrity trust-root DTOs (mirror src/api/routes/integrity.ts) ----------

/**
 * GET /api/v1/integrity/root 响应：整链折叠成单一 Merkle 根 + 链头定位。
 * Authority: src/api/routes/integrity.ts IntegrityRootDto.
 * chainHeadHash 即 reproHash（链头 current_hash）——run 的主信任锚。
 */
export interface IntegrityRootDto {
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
}

/**
 * GET /api/v1/integrity/proof/:seq 响应：单条证据的 Merkle 包含证明（audit path）。
 * Authority: src/api/routes/integrity.ts IntegrityProofDto.
 * 审计方持有此证明 + run 的 merkleRoot 即可独立验证（无需下载全部 call_records）。
 */
export interface IntegrityProofDto {
  readonly seq: number;
  readonly leafIndex: number;
  readonly leaf: string;
  readonly siblings: readonly string[];
  readonly expectedRoot: string;
  readonly leafCount: number;
}

/**
 * GET /api/v1/integrity/receipt 响应：可移植整链信任根快照。
 * Authority: src/api/routes/integrity.ts ReproReceipt.
 * schemaVersion 锁定契约演进——钉入论文/CI artifact。
 */
export interface ReproReceipt {
  readonly schemaVersion: 1;
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
  readonly gitCommitSha: string | null;
  readonly generatedAt: string;
}

// ---------- Benchmark leaderboard DTOs (mirror src/benchmark/types.ts) ----------

/**
 * 单个 Science-125 problem 的完整性条目（一行 leaderboard 记录）。
 * Authority: src/benchmark/types.ts BenchmarkEntry.
 * verdict 由 offline fixture 产出（非真实科学裁决·honestyNotes 明示）。
 */
export interface BenchmarkEntryDto {
  readonly problemId: string;
  readonly problemTitle: string;
  readonly domain: string;
  readonly science125Tag: string;
  readonly verdict: VerdictValue;
  /** 该 problem 证据链的 Merkle 根（64-hex·整链折叠指纹）。 */
  readonly integrityRoot: string;
  readonly leafCount: number;
  /** run 实例标识（含 ulid·每次生成不同·非 CI golden 锚对象）。 */
  readonly reproHash: string;
  readonly stagesCompleted: number;
  readonly converged: boolean;
  readonly chainVerified: boolean;
  readonly sourceId: string;
}

/**
 * GET /api/v1/benchmark 响应：Science-125 完整性广度套件聚合报告。
 * Authority: src/benchmark/types.ts BenchmarkReport.
 * suiteIntegrityRoot = 各 problem 的 integrityRoot 再 Merkle 折叠 → 套件级密码学指纹
 * （单链完整性 → 跨链可聚合审计·差异化护城河）。
 */
export interface BenchmarkReportDto {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly problemCount: number;
  readonly entries: readonly BenchmarkEntryDto[];
  readonly suiteIntegrityRoot: string;
  readonly totalLeaves: number;
  readonly verdictDistribution: Readonly<Record<VerdictValue, number>>;
  readonly domainDistribution: Readonly<Record<string, number>>;
  readonly gitCommitSha: string | null;
  readonly honestyNotes: readonly string[];
}

// ---------- API error envelope ----------

/**
 * 跨模型可靠性证书（GET /api/v1/court/demo）·Authority: src/api/internal/court_service.ts ReliabilityCertificate。
 */
export interface CourtModelVerdictDto {
  readonly model: string;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly chainHead: string | null;
  readonly error: string | null;
}

export interface CourtCertificateDto {
  readonly certificateId: string;
  readonly claim: string;
  readonly modelCount: number;
  readonly verdicts: readonly CourtModelVerdictDto[];
  readonly distinctVerdicts: readonly string[];
  readonly agreement: 'unanimous' | 'majority' | 'split';
  readonly honestNote: string;
  /** IC-11:数据来源标注(后端事实;前端只呈现不推断) */
  readonly datasetSource: DatasetSourceKind;
}

/**
 * 对抗竞技场结果（GET /api/v1/arena/demo）·Authority: src/api/internal/arena_service.ts ArenaResult。
 */
export interface RefuteAttemptDto {
  readonly refuter: string;
  readonly verdict: string | null;
  readonly attackLanded: boolean;
  readonly error: string | null;
}

export interface ArenaResultDto {
  readonly arenaId: string;
  readonly hypothesis: string;
  readonly originalVerdict: string | null;
  readonly originalRule: string | null;
  readonly attempts: readonly RefuteAttemptDto[];
  readonly landedCount: number;
  readonly robust: boolean;
  readonly honestNote: string;
  /** IC-11:数据来源标注(后端事实;前端只呈现不推断) */
  readonly datasetSource: DatasetSourceKind;
}

/**
 * Unified API error response (RFC 7807 Problem Details subset, spec 24 §0.6).
 * Authority: src/api/types.ts ApiErrorResponse.
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
