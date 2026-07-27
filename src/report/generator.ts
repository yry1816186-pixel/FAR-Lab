/**
 * generator.ts —— 报告生成器：从 evidence_log + falsifiability repository 读取数据，
 * 聚合为 ReportData，不含任何 LLM 调用。
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
// 阶段标签
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  stage0_dialogue: 'Stage 0 · Dialogue',
  stage1_understanding: 'Stage 1 · Question understanding',
  stage2_integration: 'Stage 2 · Knowledge integration',
  stage3_hypothesis: 'Stage 3 · Hypothesis generation',
  stage4_evidence: 'Stage 4 · Evidence collection',
  stage5_plan: 'Stage 5 · Experiment plan',
  stage6_feedback: 'Stage 6 · Feedback iteration',
};

function stageLabel(stageId: string): string {
  return STAGE_LABEL[stageId] ?? stageId;
}

// ---------------------------------------------------------------------------
// 裁决标签
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  REFUTED: 'Refuted',
  INCONCLUSIVE: 'Inconclusive',
  DEGRADED_SCOPE: 'Degraded scope',
  UNTESTED: 'Untested',
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
    `**Call records**: ${callRecords.length}`,
    `**Stages involved**: ${stageIds.map(stageLabel).join(', ')}`,
    `**Total verdicts**: ${totalVerdicts} (confirmed ${confirmedCount} / refuted ${refutedCount})`,
    reproHash.length > 0
      ? `**Repro hash**: \`${reproHash}\``
      : '**Repro hash**: (none)',
  ].join('\n\n');

  return {
    title: 'Executive summary',
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
      title: 'Six-stage output summary',
      body: '(no call records)',
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
    lines.push(`- Calls: ${records.length}`);
    lines.push(`- Total tokens: ${totalTokens}`);
    lines.push(`- Finish reasons: ${finishReasons}`);
    lines.push(`- Evidence entries: ${stageEvidence.length}`);
    lines.push('');
  }

  return {
    title: 'Six-stage output summary',
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
      title: 'Verdict nodes',
      body: '(no verdict nodes)',
      evidenceRefs: [],
    };
  }

  const evidenceRefs: string[] = [];
  const lines: string[] = [];

  lines.push(`| # | Verdict ID | Type | Verdict | Metric | Conflicting evidence | Prev hash |`);
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
    lines.push(`### Verdict \`${node.verdictId}\``);
    lines.push('');
    lines.push(`- **Type**: ${node.nodeKind}`);
    lines.push(`- **Verdict**: ${verdictLabel(node.verdict)}`);
    lines.push(
      `- **Falsifiable assertion**: ${node.falsificationSpec.prediction}`,
    );
    lines.push(
      `- **Metric**: ${node.falsificationSpec.metric} ${node.falsificationSpec.thresholdSemantics} ${node.falsificationSpec.falsificationThreshold}`,
    );
    if (node.metricValue !== null) {
      lines.push(`- **Metric value**: ${node.metricValue.toFixed(4)}`);
    }
    lines.push(`- **Conflicting evidence**: ${node.conflictingEvidenceCount}`);
    if (node.scopeSlipText !== null && node.scopeSlipText.length > 0) {
      lines.push(`- **Scope degradation**: ${node.scopeSlipText}`);
    }
    if (node.untestedReason !== null && node.untestedReason.length > 0) {
      lines.push(`- **Untested reason**: ${node.untestedReason}`);
    }
    lines.push(`- **Evidence ID**: \`${node.evidenceId}\``);
    lines.push(
      `- **Hash chain**: \`${node.prevHash.slice(0, 16)}…\` → \`${node.currentHash.slice(0, 16)}…\``,
    );
    lines.push(`- **Created at**: ${node.createdAt}`);
    lines.push('');
  }

  return {
    title: 'Verdict nodes',
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
      title: 'Evidence graph topology',
      body: `**Nodes**: ${verdictNodes.length}\n\n**Edges**: 0\n\n(no edges in the graph — verdict nodes are independent, with no support/refute/derive/test/iterate relations)`,
      evidenceRefs,
    };
  }

  const lines: string[] = [];
  lines.push(`**Nodes**: ${verdictNodes.length}`);
  lines.push(`**Edges**: ${edges.length}`);
  lines.push('');

  // 按 edge_kind 分组统计
  const kindCount = new Map<string, number>();
  for (const edge of edges) {
    kindCount.set(edge.edge_kind, (kindCount.get(edge.edge_kind) ?? 0) + 1);
  }

  lines.push('### Edge-type distribution');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('|------|------|');
  for (const [kind, count] of kindCount) {
    lines.push(`| ${kind} | ${count} |`);
  }
  lines.push('');

  // 边列表
  lines.push('### Edge list');
  lines.push('');
  lines.push('| Source | Target | Type | Weight |');
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
  lines.push('### Node degree');
  lines.push('');
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const edge of edges) {
    inDegree.set(edge.to_node, (inDegree.get(edge.to_node) ?? 0) + 1);
    outDegree.set(edge.from_node, (outDegree.get(edge.from_node) ?? 0) + 1);
  }

  lines.push('| Node ID | In-degree | Out-degree |');
  lines.push('|---------|------|------|');
  for (const nodeId of nodeIds) {
    const shortId = nodeId.slice(0, 12);
    const inDeg = inDegree.get(nodeId) ?? 0;
    const outDeg = outDegree.get(nodeId) ?? 0;
    lines.push(`| \`${shortId}\` | ${inDeg} | ${outDeg} |`);
  }

  return {
    title: 'Evidence graph topology',
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
      title: 'Hash-chain verification',
      body: '(no call records — the hash chain is empty)',
      evidenceRefs: [],
    };
  }

  const statusIcon = verification.ok ? '✅' : '❌';
  const lines: string[] = [];

  lines.push(`**Result**: ${statusIcon} ${verification.ok ? 'passed' : 'broken'}`);
  lines.push(`**Verified records**: ${verification.verifiedCount}`);
  lines.push(`**Total records**: ${callRecords.length}`);
  lines.push('');

  if (!verification.ok) {
    lines.push('### Break info');
    lines.push('');
    lines.push(`- **Break at**: seq=${verification.brokenAtSeq ?? 'unknown'}`);
    lines.push(
      `- **Expected hash**: \`${verification.expectedHash?.slice(0, 24) ?? 'N/A'}…\``,
    );
    lines.push(
      `- **Actual hash**: \`${verification.actualHash?.slice(0, 24) ?? 'N/A'}…\``,
    );
    lines.push('');
  }

  // 哈希链详细表
  lines.push('### Records on chain');
  lines.push('');
  lines.push(
    '| seq | Stage | Prev hash | Current hash | Status |',
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
    title: 'Hash-chain verification',
    body: lines.join('\n'),
    evidenceRefs: [],
  };
}

// ---------------------------------------------------------------------------
// §6 限制声明
// ---------------------------------------------------------------------------

function buildLimitationsSection(): ReportSection {
  const body = [
    'This report is auto-generated by the FAR-Lab report generator and follows these principles:',
    '',
    '- **Model-neutral**: no LLM provider is invoked while generating the report; all content comes from deterministic database queries.',
    '- **Data sources**: report data comes from the `evidence_log`, `verdict_nodes`, `call_records`, `evidence_edges`, and `repro_runs` tables.',
    '- **Hash chain**: the hash chain is computed deterministically by `canonicalHash` (SHA-256); the verification result is a reproducible boolean conclusion.',
    '- **Verdict irreversibility**: `CONFIRMED` and `REFUTED` are terminal verdicts; flipping them is forbidden in the database (`trg_verdict_nodes_no_terminal_rollback`).',
    '- **Report reproducibility**: re-running `generateReport` on the same database state yields equivalent ReportData (except the `generatedAt` timestamp).',
  ].join('\n');

  return {
    title: 'Limitations',
    body,
    evidenceRefs: [],
  };
}
