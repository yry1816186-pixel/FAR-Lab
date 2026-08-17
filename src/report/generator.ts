/**
 * generator.ts —— 报告生成器：从 evidence_log + falsifiability repository 读取数据，
 * 聚合为 ReportData，不含任何 LLM 调用。
 *
 * 模型中立：本文件不含任何 provider / model 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import type Database from 'better-sqlite3';
import { verifyChainHead } from '../evidence_log/verifier.ts';
import type { ReportClaimCategory } from '../schema/enums.ts';
import type { LimitationItem } from './types.ts';
import { buildClaimLimitations } from './limitations.ts';
export { buildClaimLimitations, claimLimitationCoverage } from './limitations.ts';
import { REPORT_CLAIM_CATEGORIES } from '../schema/enums.ts';
import type { VerifyResult } from '../evidence_log/types.ts';
import { rowToVerdictNode } from '../falsifiability/repository.ts';
import type { VerdictNodeRow } from '../falsifiability/repository.ts';
import type { VerdictNode } from '../falsifiability/types.ts';
import type { ReportData, ReportSection , SectionBody } from './types.ts';
import { estimateUsdCost } from '../llm_gateway/pricing.ts';
import { trapTaxonomyFor } from '../anti_theater/trap_taxonomy.ts';
import type { TrapSummary } from '../anti_theater/trap_taxonomy.ts';

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
  /**
   * CU4-02计量来源标记：0 = 伪 token（offline_replay 字符估算，
   * 非真实计量），1 = 真实 token 计量，null = 无法提取（视为真实计量）。
   * 由 response_payload 中的 credential.tokenUsage.measured 提取，不依赖 model_id 命名约定。
   */
  readonly measured: number | null;
  /**
   * 1128 效率面：response_payload 中 credential.tokenUsage 的输入/输出拆分
   * （call_records 表仅落库 usage_tokens_total 单值；拆分用于 estimateUsdCost
   * 精确成本核算）。无法提取 → null（诚实：不编造拆分）。
   */
  readonly tokenUsage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

/** queryCallRecords 的 SQL 行：额外携带 response_payload 用于提取 measured 标记。 */
type CallRecordSqlRow = Omit<CallRecordSummaryRow, 'measured'> & {
  readonly response_payload: string;
};

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
  const rows = db
    .prepare(
      `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
              finish_reason, usage_tokens_total, response_payload, prev_hash, current_hash, created_at
       FROM call_records
       ORDER BY seq ASC`,
    )
    .all() as CallRecordSqlRow[];

  return rows.map((row) => {
    const { response_payload, ...rest } = row;
    return {
      ...rest,
      measured: extractMeasuredFlag(response_payload),
      tokenUsage: extractTokenUsage(response_payload),
    };
  });
}

/**
 * 从 call_records.response_payload（canonical JSON { content, credential: { tokenUsage, ... }, raw }）
 * 提取输入/输出 token 拆分（1128 效率面 per-verdict $ 成本核算）。
 *
 * 语义：tokenUsage.inputTokens/outputTokens 均为非负 number 才返回拆分；
 * 缺失/结构不符/非法值 → null（fail-conservative：不编造拆分，成本侧诚实标注不可计价）。
 * 非法 JSON = payload 字节被篡改 → JSON.parse 异常向上传播（fail-closed，与 extractMeasuredFlag 同语义）。
 */
function extractTokenUsage(
  responsePayload: string,
): { readonly inputTokens: number; readonly outputTokens: number } | null {
  const parsed: unknown = JSON.parse(responsePayload);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const credential = (parsed as Record<string, unknown>).credential;
  if (typeof credential !== 'object' || credential === null) {
    return null;
  }
  const tokenUsage = (credential as Record<string, unknown>).tokenUsage;
  if (typeof tokenUsage !== 'object' || tokenUsage === null) {
    return null;
  }
  const inputTokens = (tokenUsage as Record<string, unknown>).inputTokens;
  const outputTokens = (tokenUsage as Record<string, unknown>).outputTokens;
  if (
    typeof inputTokens !== 'number' ||
    !Number.isFinite(inputTokens) ||
    inputTokens < 0 ||
    typeof outputTokens !== 'number' ||
    !Number.isFinite(outputTokens) ||
    outputTokens < 0
  ) {
    return null;
  }
  return { inputTokens, outputTokens };
}

/**
 * 从 call_records.response_payload（appendLlmResponseRecord 落库的 canonical JSON，
 * 内容寻址绑定，格式为 { content, credential: { tokenUsage: { measured, ... }, ... }, raw }）
 * 提取计量来源标记。
 *
 * 语义（与 TokenUsage.measured 缺省 true 一致）：显式 false → 0（伪 token）；
 * 显式 true → 1；缺失/结构不符（如手工构造的记录）→ null（视为真实计量）。
 * 非法 JSON = payload 字节被篡改 → JSON.parse 异常向上传播（fail-closed，不静默当真实计量）。
 */
function extractMeasuredFlag(responsePayload: string): number | null {
  const parsed: unknown = JSON.parse(responsePayload);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const credential = (parsed as Record<string, unknown>).credential;
  if (typeof credential !== 'object' || credential === null) {
    return null;
  }
  const tokenUsage = (credential as Record<string, unknown>).tokenUsage;
  if (typeof tokenUsage !== 'object' || tokenUsage === null) {
    return null;
  }
  const measured = (tokenUsage as Record<string, unknown>).measured;
  if (measured === false) return 0;
  if (measured === true) return 1;
  return null;
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

/** Input parameters for operations involving generate report input. */
export interface GenerateReportInput {
  readonly db: Database.Database;
  readonly runId: string;
  /** 统计陷阱审计摘要（可选·由调用方从 antiTheaterReport.findings 注入）。 */
  readonly trapSummary?: TrapSummary;
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
    input.trapSummary,
  );
  // CORE-REPORT-001 运行期 fail-closed：分类缺失/非法的段落不得进入成品报告
  assertEverySectionCategorized(sections);

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
    ...(input.trapSummary ? { trapSummary: input.trapSummary } : {}),
  };
}

// ---------------------------------------------------------------------------
// 报告段落构建
// ---------------------------------------------------------------------------


/** CORE-REPORT-001：给 builder 产物挂声明分类（中央单点）。 */
function categorize(body: SectionBody, category: ReportClaimCategory): ReportSection {
  return { ...body, category };
}

/** 运行期 fail-closed：任何段落缺合法分类 → 抛错（防绕过 buildSections 直接拼 ReportData）。 */
export function assertEverySectionCategorized(sections: readonly ReportSection[]): void {
  for (const section of sections) {
    if (!REPORT_CLAIM_CATEGORIES.includes(section.category)) {
      throw new Error(`report section '${section.title}' lacks a valid claim category (CORE-REPORT-001)`);
    }
  }
}

function buildSections(
  runId: string,
  verdictNodes: VerdictNode[],
  evidenceLog: EvidenceLogRow[],
  callRecords: CallRecordSummaryRow[],
  edges: EvidenceEdgeRow[],
  hashVerification: VerifyResult,
  reproHash: string,
  trapSummary?: TrapSummary,
): ReportSection[] {
  // CORE-REPORT-001 中央分类映射：事实=已验证结构化记录（裁决/图/链/阶段账目）；
  // 推断=聚合与审计判断（摘要/陷阱审计）；未完成=边界声明（limitations）。
  // Hash 链断裂时该段降为 UNCOMPLETED（验证未完成——诚实优先）。
  const categorized: ReportSection[] = [
    categorize(buildSummarySection(runId, verdictNodes, callRecords, reproHash), 'INFERENCE'),
    categorize(buildStageSummarySection(callRecords, evidenceLog), 'FACT'),
    categorize(buildVerdictNodesSection(verdictNodes), 'FACT'),
    categorize(buildEvidenceGraphSection(verdictNodes, edges), 'FACT'),
    categorize(
      buildHashChainSection(callRecords, hashVerification),
      hashVerification.ok ? 'FACT' : 'UNCOMPLETED',
    ),
    categorize(buildLimitationsSection(buildClaimLimitations(verdictNodes)), 'UNCOMPLETED'),
  ];
  if (trapSummary) {
    categorized.push(categorize(buildTrapAuditSection(trapSummary), 'INFERENCE'));
  }
  return categorized;
}

/**
 * 统计陷阱审计段（统计陷阱目录设计）。
 * 渲染"本次验证覆盖的陷阱大类 + 触发明细"，使报告不仅给出 verdict 结论，
 * 还结构化展示"检测了 21 类统计陷阱，触发 N 类警告"的审计表。
 */
function buildTrapAuditSection(trapSummary: TrapSummary): SectionBody {
  const triggeredLines = trapSummary.triggeredKinds.map((kind) => {
    const t = trapTaxonomyFor(kind);
    return `- **${t.attackId}**（${t.name}）· 类别 ${t.category} · ${t.what} · 防治：${t.cures.join(' / ')}`;
  });
  const body = [
    `**Findings**: ${trapSummary.totalFindings}`,
    `**Fail-level**: ${trapSummary.hasFail ? 'YES — verdict degraded (D17 support downgrade)' : 'no'}`,
    ...(trapSummary.triggeredCategories.length > 0
      ? [`**Categories triggered (${trapSummary.triggeredCategories.length})**: ${trapSummary.triggeredCategories.join(', ')}`]
      : []),
    '',
    ...(triggeredLines.length > 0 ? ['### Triggered trap details', ...triggeredLines] : ['No statistical traps triggered.']),
  ];
  return {
    title: 'Statistical Trap Audit',
    body: body.join('\n'),
    evidenceRefs: [],
  };
}

// ---------------------------------------------------------------------------
// §1 执行摘要
// ---------------------------------------------------------------------------

function buildSummarySection(
  runId: string,
  verdictNodes: VerdictNode[],
  callRecords: CallRecordSummaryRow[],
  reproHash: string,
): SectionBody {
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
): SectionBody {
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
    // CU4-02：offline_replay 用字符伪 token（measured=false）——
    // 口径混叠消除：按 measured 标记（而非 model_id 命名约定）区分伪 token，
    // 真实计量与伪 token 分开报告，不混入同一成本口径。
    const pseudoTokens = records
      .filter((r) => r.measured === 0)
      .reduce((sum, r) => sum + (r.usage_tokens_total ?? 0), 0);
    const finishReasons = [
      ...new Set(records.map((r) => r.finish_reason)),
    ].join(', ');

    // 1128 效率面：per-stage 美元成本估算（estimateUsdCost·FOCUS 口径）。
    // 仅真实计量（measured !== 0）+ 有输入/输出拆分的记录参与；价格缺失 → priced=false。
    // 伪 token（offline_replay 字符估算）不混入成本（CU4-02 口径混叠消除同源）。
    let inputSum = 0;
    let outputSum = 0;
    let pricedRecords = 0;
    for (const r of records) {
      if (r.measured === 0 || r.tokenUsage === null) continue;
      inputSum += r.tokenUsage.inputTokens;
      outputSum += r.tokenUsage.outputTokens;
      pricedRecords += 1;
    }
    const modelId = records.find((r) => r.measured !== 0 && r.model_id !== '')?.model_id ?? '';
    const cost = modelId !== '' && pricedRecords > 0
      ? estimateUsdCost(modelId, inputSum, outputSum)
      : null;

    lines.push(`### ${stageLabel(stageId)}`);
    lines.push('');
    lines.push(`- Calls: ${records.length}`);
    lines.push(`- Total tokens: ${totalTokens}`);
    if (pseudoTokens > 0) {
      lines.push(`- Pseudo tokens (offline_replay char-estimate, not real metering): ${pseudoTokens}`);
    }
    if (cost !== null && cost.priced && cost.totalUsd !== null) {
      lines.push(`- Estimated cost: $${cost.totalUsd.toFixed(4)} (${modelId} · ${inputSum} in / ${outputSum} out tokens)`);
    } else if (cost !== null && pricedRecords > 0) {
      lines.push(`- Estimated cost: not priced (${modelId} missing from price table)`);
    }
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

function buildVerdictNodesSection(verdictNodes: VerdictNode[]): SectionBody {
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
    // P0-11：GRADE 证据质量标注（透明度层·studyDesign 提供时展示·用户可感知证据层级）。
    if (node.verdictTrace.evidenceQualityTier !== undefined) {
      lines.push(
        `- **Evidence quality**: ${node.verdictTrace.evidenceQualityNote ?? `tier ${node.verdictTrace.evidenceQualityTier}`}`,
      );
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
): SectionBody {
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
): SectionBody {
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

function buildLimitationsSection(claimLimitations: readonly LimitationItem[]): SectionBody {
  const globalLines = [
    '- **Model-neutral**: no LLM provider is invoked while generating the report; all content comes from deterministic database queries.',
    '- **Data sources**: report data comes from the `evidence_log`, `verdict_nodes`, `call_records`, `evidence_edges`, and `repro_runs` tables.',
    '- **Hash chain**: the hash chain is computed deterministically by `canonicalHash` (SHA-256); the verification result is a reproducible boolean conclusion.',
    '- **Verdict irreversibility**: `CONFIRMED` and `REFUTED` are terminal verdicts; flipping them is forbidden in the database (`trg_verdict_nodes_no_terminal_rollback`).',
    '- **Report reproducibility**: re-running `generateReport` on the same database state yields equivalent ReportData (except the `generatedAt` timestamp).',
  ];
  const claimLines = claimLimitations.map(
    (i) => `- **${i.claimId.slice(0, 12)}…** ${i.cannotProve} — ${i.reason}`,
  );
  return {
    title: 'Limitations',
    body: ['### Scope boundaries (global)', ...globalLines, '', '### Per-claim: what this conclusion cannot prove', ...claimLines].join('\n'),
    evidenceRefs: [],
    limitations: claimLimitations,
  };
}
