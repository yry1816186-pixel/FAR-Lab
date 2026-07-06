/**
 * generator.ts —— 报告生成器：从 evidence_log + falsifiability repository 读取数据，
 * 聚合为 ReportData，不含任何 LLM 调用。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/17_最终设计审计与开发任务包_FINAL_AUDIT.md Epic K-05a/K-05b.
 *
 * 模型中立：本文件不含任何 provider / model 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import type Database from 'better-sqlite3';
import { verifyChainHead } from '../evidence_log/verifier.ts';
import type { VerifyResult } from '../evidence_log/types.ts';
import { rowToVerdictNode } from '../falsifiability/repository.ts';
import type { VerdictNodeRow } from '../falsifiability/repository.ts';
import type { VerdictNode } from '../falsifiability/types.ts';
import type { ReportData, ReportSection } from './types.ts';

// ---------------------------------------------------------------------------
// 数据库行类型（补充·report 模块独有）
// ---------------------------------------------------------------------------

interface EvidenceLogRow {
  readonly evidence_id: string;
  readonly call_record_seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly evidence_payload: string;
  readonly source_anchor: string;
  readonly created_at: string;
}

interface CallRecordSummaryRow {
  readonly seq: number;
  readonly stage_id: string;
  readonly payload_kind: string;
  readonly purpose_tag: string;
  readonly model_id: string;
  readonly finish_reason: string;
  readonly usage_tokens_total: number | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
}

interface EvidenceEdgeRow {
  readonly edge_id: string;
  readonly from_node: string;
  readonly to_node: string;
  readonly edge_kind: string;
  readonly weight: number | null;
}

interface ReproRunRow {
  readonly repro_run_id: string;
  readonly repro_hash: string;
  readonly status: string;
}

// ---------------------------------------------------------------------------
// 查询函数
// ---------------------------------------------------------------------------

function queryVerdictNodes(db: Database.Database): VerdictNode[] {
  const rows = db
    .prepare(
      `SELECT verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
              scope_slip_text, untested_reason, source_anchor, replay_prover,
              verdict_trace_json, verdict_trace_hash, superseded_by,
              prev_hash, current_hash, created_at, updated_at
       FROM verdict_nodes
       ORDER BY created_at ASC`,
    )
    .all() as VerdictNodeRow[];

  return rows.map((row) => rowToVerdictNode(row));
}

function queryEvidenceLog(db: Database.Database): EvidenceLogRow[] {
  return db
    .prepare(
      `SELECT evidence_id, call_record_seq, stage_id, payload_kind,
              evidence_payload, source_anchor, created_at
       FROM evidence_log
       ORDER BY created_at ASC`,
    )
    .all() as EvidenceLogRow[];
}

function queryCallRecords(db: Database.Database): CallRecordSummaryRow[] {
  return db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              finish_reason, usage_tokens_total, prev_hash, current_hash, created_at
       FROM call_records
       ORDER BY seq ASC`,
    )
    .all() as CallRecordSummaryRow[];
}

function queryEdges(db: Database.Database): EvidenceEdgeRow[] {
  return db
    .prepare(
      `SELECT edge_id, from_node, to_node, edge_kind, weight
       FROM evidence_edges
       ORDER BY created_at ASC`,
    )
    .all() as EvidenceEdgeRow[];
}

function queryLatestReproHash(db: Database.Database): string {
  const row = db
    .prepare(
      `SELECT repro_hash, status
       FROM repro_runs
       WHERE status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get() as ReproRunRow | undefined;

  return row?.repro_hash ?? '';
}

// ---------------------------------------------------------------------------
// 阶段中文标签
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  stage0_dialogue: 'Stage 0 · 对话',
  stage1_understanding: 'Stage 1 · 问题理解',
  stage2_integration: 'Stage 2 · 知识整合',
  stage3_hypothesis: 'Stage 3 · 假设生成',
  stage4_evidence: 'Stage 4 · 证据收集',
  stage5_plan: 'Stage 5 · 实验计划',
  stage6_feedback: 'Stage 6 · 反馈迭代',
};

function stageLabel(stageId: string): string {
  return STAGE_LABEL[stageId] ?? stageId;
}

// ---------------------------------------------------------------------------
// 裁决中文标签
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  CONFIRMED: '已确认',
  REFUTED: '已证伪',
  INCONCLUSIVE: '不确定',
  DEGRADED_SCOPE: '降级范围',
  UNTESTED: '未测试',
};

function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? verdict;
}

// ---------------------------------------------------------------------------
// 主体：从数据库生成 ReportData
// ---------------------------------------------------------------------------

export interface GenerateReportInput {
  readonly db: Database.Database;
  readonly runId: string;
}

/**
 * generateReport —— 聚合 evidence_log + falsifiability repository 数据，
 * 生成结构化的 ReportData。
 *
 * 流程：
 *   1. 读取 verdict_nodes 全部记录
 *   2. 读取 evidence_log 全部条目
 *   3. 读取 call_records 哈希链并验证
 *   4. 读取 evidence_edges 图拓扑
 *   5. 读取 repro_runs 最新 repro_hash
 *   6. 组装为 ReportData
 *
 * 完全确定性：无 LLM 调用，无网络依赖，输出仅由数据库内容决定。
 */
export function generateReport(input: GenerateReportInput): ReportData {
  const { db, runId } = input;

  if (runId.trim().length === 0) {
    throw new Error('generateReport: runId must be non-empty');
  }

  const verdictNodes = queryVerdictNodes(db);
  const evidenceLog = queryEvidenceLog(db);
  const callRecords = queryCallRecords(db);
  const edges = queryEdges(db);
  const hashVerification = verifyChainHead(db);
  const reproHash = queryLatestReproHash(db);

  const sections: ReportSection[] = buildSections(
    runId,
    verdictNodes,
    evidenceLog,
    callRecords,
    edges,
    hashVerification,
    reproHash,
  );

  const verdictSummary: Record<string, number> = {
    CONFIRMED: 0,
    REFUTED: 0,
    INCONCLUSIVE: 0,
    DEGRADED_SCOPE: 0,
    UNTESTED: 0,
  };
  for (const node of verdictNodes) {
    const k = node.verdict;
    verdictSummary[k] = (verdictSummary[k] ?? 0) + 1;
  }

  return {
    runId,
    generatedAt: new Date().toISOString(),
    sections,
    reproHash,
    verdictSummary,
    sourceAnchorCount: evidenceLog.length,
  };
}

// ---------------------------------------------------------------------------
// 报告段落构建
// ---------------------------------------------------------------------------

function buildSections(
  runId: string,
  verdictNodes: VerdictNode[],
  evidenceLog: EvidenceLogRow[],
  callRecords: CallRecordSummaryRow[],
  edges: EvidenceEdgeRow[],
  hashVerification: VerifyResult,
  reproHash: string,
): ReportSection[] {
  return [
    buildSummarySection(runId, verdictNodes, callRecords, reproHash),
    buildStageSummarySection(callRecords, evidenceLog),
    buildVerdictNodesSection(verdictNodes),
    buildEvidenceGraphSection(verdictNodes, edges),
    buildHashChainSection(callRecords, hashVerification),
    buildLimitationsSection(),
  ];
}

// ---------------------------------------------------------------------------
// §1 执行摘要
// ---------------------------------------------------------------------------

function buildSummarySection(
  runId: string,
  verdictNodes: VerdictNode[],
  callRecords: CallRecordSummaryRow[],
  reproHash: string,
): ReportSection {
  const totalVerdicts = verdictNodes.length;
  const confirmedCount = verdictNodes.filter((n) => n.verdict === 'CONFIRMED').length;
  const refutedCount = verdictNodes.filter((n) => n.verdict === 'REFUTED').length;
  const stageIds = [...new Set(callRecords.map((r) => r.stage_id))];

  const body = [
    `**Run ID**: \`${runId}\``,
    `**调用记录数**: ${callRecords.length}`,
    `**涉及阶段**: ${stageIds.map(stageLabel).join(', ')}`,
    `**裁决总数**: ${totalVerdicts}（已确认 ${confirmedCount} / 已证伪 ${refutedCount}）`,
    reproHash.length > 0
      ? `**复现哈希**: \`${reproHash}\``
      : '**复现哈希**: (无)',
  ].join('\n\n');

  return {
    title: '执行摘要',
    body,
    evidenceRefs: [],
  };
}

// ---------------------------------------------------------------------------
// §2 六阶段输出摘要
// ---------------------------------------------------------------------------

function buildStageSummarySection(
  callRecords: CallRecordSummaryRow[],
  evidenceLog: EvidenceLogRow[],
): ReportSection {
  if (callRecords.length === 0) {
    return {
      title: '六阶段输出摘要',
      body: '(无调用记录)',
      evidenceRefs: [],
    };
  }

  // 按 stage_id 分组
  const stageMap = new Map<string, CallRecordSummaryRow[]>();
  for (const record of callRecords) {
    const existing = stageMap.get(record.stage_id);
    if (existing === undefined) {
      stageMap.set(record.stage_id, [record]);
    } else {
      existing.push(record);
    }
  }

  const evidenceRefs: string[] = [];
  const lines: string[] = [];

  for (const [stageId, records] of stageMap) {
    const stageEvidence = evidenceLog.filter((e) => e.stage_id === stageId);
    for (const ev of stageEvidence) {
      evidenceRefs.push(ev.evidence_id);
    }

    const totalTokens = records.reduce(
      (sum, r) => sum + (r.usage_tokens_total ?? 0),
      0,
    );
    const finishReasons = [
      ...new Set(records.map((r) => r.finish_reason)),
    ].join(', ');

    lines.push(`### ${stageLabel(stageId)}`);
    lines.push('');
    lines.push(`- 调用次数: ${records.length}`);
    lines.push(`- 累计 Token: ${totalTokens}`);
    lines.push(`- 完成原因: ${finishReasons}`);
    lines.push(`- 证据条目数: ${stageEvidence.length}`);
    lines.push('');
  }

  return {
    title: '六阶段输出摘要',
    body: lines.join('\n'),
    evidenceRefs,
  };
}

// ---------------------------------------------------------------------------
// §3 裁决节点
// ---------------------------------------------------------------------------

function buildVerdictNodesSection(verdictNodes: VerdictNode[]): ReportSection {
  if (verdictNodes.length === 0) {
    return {
      title: '裁决节点',
      body: '(无裁决节点)',
      evidenceRefs: [],
    };
  }

  const evidenceRefs: string[] = [];
  const lines: string[] = [];

  lines.push(`| # | 裁决 ID | 类型 | 裁决 | 指标值 | 冲突证据 | 前一哈希 |`);
  lines.push(`|---|---------|------|------|--------|----------|----------|`);

  for (let i = 0; i < verdictNodes.length; i++) {
    const node = verdictNodes[i];
    if (node === undefined) continue;

    evidenceRefs.push(node.evidenceId);

    const metricStr =
      node.metricValue !== null ? node.metricValue.toFixed(4) : '—';
    const shortVerdictId = node.verdictId.slice(0, 12);
    const shortPrevHash = node.prevHash.slice(0, 12);

    lines.push(
      `| ${i + 1} | \`${shortVerdictId}\` | ${node.nodeKind} | **${verdictLabel(node.verdict)}** | ${metricStr} | ${node.conflictingEvidenceCount} | \`${shortPrevHash}\` |`,
    );
  }

  // Append detail sections for each verdict
  lines.push('');
  for (const node of verdictNodes) {
    lines.push(`### 裁决 \`${node.verdictId}\``);
    lines.push('');
    lines.push(`- **类型**: ${node.nodeKind}`);
    lines.push(`- **裁决**: ${verdictLabel(node.verdict)}`);
    lines.push(
      `- **可证伪断言**: ${node.falsificationSpec.prediction}`,
    );
    lines.push(
      `- **度量**: ${node.falsificationSpec.metric} ${node.falsificationSpec.thresholdSemantics} ${node.falsificationSpec.falsificationThreshold}`,
    );
    if (node.metricValue !== null) {
      lines.push(`- **指标值**: ${node.metricValue.toFixed(4)}`);
    }
    lines.push(`- **冲突证据数**: ${node.conflictingEvidenceCount}`);
    if (node.scopeSlipText !== null && node.scopeSlipText.length > 0) {
      lines.push(`- **范围降级**: ${node.scopeSlipText}`);
    }
    if (node.untestedReason !== null && node.untestedReason.length > 0) {
      lines.push(`- **未测试原因**: ${node.untestedReason}`);
    }
    lines.push(`- **证据 ID**: \`${node.evidenceId}\``);
    lines.push(
      `- **哈希链**: \`${node.prevHash.slice(0, 16)}…\` → \`${node.currentHash.slice(0, 16)}…\``,
    );
    lines.push(`- **创建时间**: ${node.createdAt}`);
    lines.push('');
  }

  return {
    title: '裁决节点',
    body: lines.join('\n'),
    evidenceRefs,
  };
}

// ---------------------------------------------------------------------------
// §4 证据图拓扑
// ---------------------------------------------------------------------------

function buildEvidenceGraphSection(
  verdictNodes: VerdictNode[],
  edges: EvidenceEdgeRow[],
): ReportSection {
  const nodeIds = new Set(verdictNodes.map((n) => n.verdictId));
  const evidenceRefs: string[] = [];

  if (edges.length === 0) {
    return {
      title: '证据图拓扑',
      body: `**节点数**: ${verdictNodes.length}\n\n**边数**: 0\n\n(图中无边——各裁决节点独立，无 support/refute/derive/test/iterate 关系)`,
      evidenceRefs,
    };
  }

  const lines: string[] = [];
  lines.push(`**节点数**: ${verdictNodes.length}`);
  lines.push(`**边数**: ${edges.length}`);
  lines.push('');

  // 按 edge_kind 分组统计
  const kindCount = new Map<string, number>();
  for (const edge of edges) {
    kindCount.set(edge.edge_kind, (kindCount.get(edge.edge_kind) ?? 0) + 1);
  }

  lines.push('### 边类型分布');
  lines.push('');
  lines.push('| 类型 | 数量 |');
  lines.push('|------|------|');
  for (const [kind, count] of kindCount) {
    lines.push(`| ${kind} | ${count} |`);
  }
  lines.push('');

  // 边列表
  lines.push('### 边列表');
  lines.push('');
  lines.push('| 来源节点 | 目标节点 | 类型 | 权重 |');
  lines.push('|----------|----------|------|------|');
  for (const edge of edges) {
    const fromLabel = edge.from_node.slice(0, 12);
    const toLabel = edge.to_node.slice(0, 12);
    const weightStr = edge.weight !== null ? edge.weight.toFixed(3) : '—';
    lines.push(
      `| \`${fromLabel}\` | \`${toLabel}\` | ${edge.edge_kind} | ${weightStr} |`,
    );
  }
  lines.push('');

  // 节点度分析
  lines.push('### 节点度');
  lines.push('');
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const edge of edges) {
    inDegree.set(edge.to_node, (inDegree.get(edge.to_node) ?? 0) + 1);
    outDegree.set(edge.from_node, (outDegree.get(edge.from_node) ?? 0) + 1);
  }

  lines.push('| 节点 ID | 入度 | 出度 |');
  lines.push('|---------|------|------|');
  for (const nodeId of nodeIds) {
    const shortId = nodeId.slice(0, 12);
    const inDeg = inDegree.get(nodeId) ?? 0;
    const outDeg = outDegree.get(nodeId) ?? 0;
    lines.push(`| \`${shortId}\` | ${inDeg} | ${outDeg} |`);
  }

  return {
    title: '证据图拓扑',
    body: lines.join('\n'),
    evidenceRefs,
  };
}

// ---------------------------------------------------------------------------
// §5 哈希链校验
// ---------------------------------------------------------------------------

function buildHashChainSection(
  callRecords: CallRecordSummaryRow[],
  verification: VerifyResult,
): ReportSection {
  if (callRecords.length === 0) {
    return {
      title: '哈希链校验结果',
      body: '(无调用记录——哈希链为空)',
      evidenceRefs: [],
    };
  }

  const statusIcon = verification.ok ? '✅' : '❌';
  const lines: string[] = [];

  lines.push(`**校验结果**: ${statusIcon} ${verification.ok ? '通过' : '断裂'}`);
  lines.push(`**已验证记录数**: ${verification.verifiedCount}`);
  lines.push(`**总记录数**: ${callRecords.length}`);
  lines.push('');

  if (!verification.ok) {
    lines.push('### 断裂信息');
    lines.push('');
    lines.push(`- **断裂位置**: seq=${verification.brokenAtSeq ?? '未知'}`);
    lines.push(
      `- **预期哈希**: \`${verification.expectedHash?.slice(0, 24) ?? 'N/A'}…\``,
    );
    lines.push(
      `- **实际哈希**: \`${verification.actualHash?.slice(0, 24) ?? 'N/A'}…\``,
    );
    lines.push('');
  }

  // 哈希链详细表
  lines.push('### 链上记录');
  lines.push('');
  lines.push(
    '| seq | 阶段 | 前一哈希 | 当前哈希 | 状态 |',
  );
  lines.push(
    '|-----|------|----------|----------|------|',
  );

  for (let i = 0; i < callRecords.length; i++) {
    const record = callRecords[i];
    if (record === undefined) continue;

    const isBroken =
      !verification.ok &&
      verification.brokenAtSeq !== null &&
      record.seq >= verification.brokenAtSeq;

    const status = isBroken ? '❌' : '✅';
    const shortPrev = record.prev_hash.slice(0, 16);
    const shortCurr = record.current_hash.slice(0, 16);

    lines.push(
      `| ${record.seq} | ${stageLabel(record.stage_id)} | \`${shortPrev}…\` | \`${shortCurr}…\` | ${status} |`,
    );
  }

  return {
    title: '哈希链校验结果',
    body: lines.join('\n'),
    evidenceRefs: [],
  };
}

// ---------------------------------------------------------------------------
// §6 限制声明
// ---------------------------------------------------------------------------

function buildLimitationsSection(): ReportSection {
  const body = [
    '本报告由 FAR-Chain 报告生成器自动生成，遵循以下原则：',
    '',
    '- **模型中立**: 报告生成过程中未调用任何 LLM provider，所有内容来自确定性数据库查询。',
    '- **数据来源**: 报告数据来自 `evidence_log`、`verdict_nodes`、`call_records`、`evidence_edges`、`repro_runs` 表。',
    '- **哈希链**: 哈希链由 `canonicalHash`（SHA-256）确定性计算，校验结果为可复现的布尔结论。',
    '- **裁决不可逆**: `CONFIRMED` 和 `REFUTED` 为终局裁决，数据库中禁止翻转（`trg_verdict_nodes_no_terminal_rollback`）。',
    '- **报告可复现**: 相同数据库状态下重复运行 `generateReport` 将产生等价的 ReportData（时间戳字段 `generatedAt` 除外）。',
  ].join('\n');

  return {
    title: '限制声明',
    body,
    evidenceRefs: [],
  };
}
