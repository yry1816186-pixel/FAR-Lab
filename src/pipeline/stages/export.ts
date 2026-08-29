import fs from 'node:fs';
import path from 'node:path';

/** Nearest ancestor directory (inclusive) containing `name`; null when absent. */
const findUp = (name: string, fromDir: string): string | null => {
  let dir = path.resolve(fromDir);
  for (;;) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};
import { execSync } from 'node:child_process';
import {
  RELATION_POLARITY,
  newId,
  ReproducibilityBundle,
  toSwanJsonLd,
} from '../../domain/index.js';
import { isTemplateHypothesis, isTemplatePlan } from '../../domain/scientific-state.js';

/**
 * Template-content marker for the remediation re-export trigger (see below).
 * Digit-anchored, unanchored-position (red-team P2-3): matches the wire's exact
 * shapes ("Offline hypothesis <n> …", "Offline development plan: …",
 * "A deterministic offline mechanism chain <n> …") wherever they appear —
 * embedded mid-line inside a JSON-LD serialization or a legacy plan objective —
 * while a real hypothesis ABOUT offline systems ("Offline hypothesis
 * evaluation…") never matches. Case-sensitive: prose citing "offline
 * hypothesis 3" lowercase does not flag.
 */
const TEMPLATE_MARKER = /Offline hypothesis \d|Offline development plan:|A deterministic offline mechanism chain \d/;

/**
 * Real-content remediation predicate (2026-08-29): does the LATEST bundle's
 * scientific layer still PROJECT offline-template hypotheses? Shared by the
 * export stage's applicable(), the orchestrator's completed-run reopen, and the
 * API's reexport gate — one owner, three triggers. Unreadable artifacts read as
 * tainted: re-export is the safe direction (deterministic, append-only).
 */
export const latestBundleTemplateTainted = async (
  artifacts: { get(ref: string): Promise<string | null> },
  latest: { hypothesisJsonLd?: unknown[]; finalArtifactHashes: string[] },
): Promise<boolean> => {
  const jld = latest.hypothesisJsonLd ?? [];
  if (jld.some((j) => TEMPLATE_MARKER.test(JSON.stringify(j)))) return true;
  try {
    const reportHash = latest.finalArtifactHashes[0];
    if (reportHash !== undefined) {
      const report = await artifacts.get(reportHash);
      // Not line-anchored: the template plan's objective embeds "Offline
      // hypothesis N" mid-line ("Offline development plan: … for: Offline
      // hypothesis 2 …"), and a remediation that cleaned only part of the
      // projection must still read as tainted.
      if (report !== null && TEMPLATE_MARKER.test(report)) return true;
    }
  } catch {
    return true;
  }
  return false;
};

import type {
  CitationBindingStatus,
  CorpusSnapshot,
  ExperimentRun,
  FeedbackSignal,
  ResultSet,
  Revision,
  StatReport,
  VersionDiff,
  EvidenceRelation,
  EvidenceRelationType,
  HypothesisCandidate,
  HypothesisScorecard,
  ProvenanceReceipt,
  ResearchPlan,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  SourceDocument,
} from '../../domain/index.js';
import { canonicalJson, canonicalSha256, sha256Hex } from '../../shared/crypto.js';
import { truthProfileFromReceipts, truthDisclosureLine, type RunTruthProfile } from '../../app/truth-profile.js';
import { buildPaperOutline, renderPaperMarkdown } from '../paper-outline.js';
import { buildCorpusDepthFigure, buildWinRateFigure } from '../../report/figures.js';
import { buildClaimBindingTable, buildCorpusTable, buildResultsTable, tableToCsv, tableToMarkdown } from '../../report/tables.js';
import type { StageHandler } from '../types.js';

/**
 * export stage (mission §55/§56): render a human-readable report STRICTLY from stored
 * objects (zero fabrication — absent data is displayed as missing), then build a
 * ReproducibilityBundle whose declaredEvidenceLevel honestly reflects what a third
 * party can replay from the recorded snapshots, receipts and artifact hashes.
 */

const SCORE_DISCLAIMER = '分数为可检查的决策辅助，非客观概率。';

/** W5/S4 — noveltyLabel is judged only against THIS run's retrieved corpus; never presented as literature-level novelty. */
const NOVELTY_CORPUS_QUALIFIER = '（仅相对本 run 检索语料判定，未做全文献新颖性检索）';

/**
 * W5/S3 — disclosure label for the provenance of a falsification spec's decision-rule
 * thresholds. Missing provenance (pre-W5 specs) is NOT a completeness failure; it is
 * rendered honestly as「来源未声明」.
 */
const decisionRuleProvenanceLabel = (p: string | undefined): string => {
  switch (p) {
    case 'model-stipulated':
      return '⚠ 阈值为模型拟定，无证据来源';
    case 'evidence-derived':
      return '来源：证据推导';
    case 'community-standard':
      return '来源：学界惯常';
    case 'mixed':
      return '⚠ 阈值来源混合（部分有据、部分模型拟定）';
    default:
      return '来源未声明';
  }
};

interface ExportInputs {
  run: ResearchRun;
  question: ResearchQuestion | null;
  corpus: CorpusSnapshot | null;
  sources: SourceDocument[];
  claims: ScientificClaim[];
  relations: EvidenceRelation[];
  hypotheses: HypothesisCandidate[];
  /** rank-sorted ascending */
  scorecards: HypothesisScorecard[];
  plan: ResearchPlan | null;
  /** receipts as of render time (does not include the export receipt itself) */
  receipts: ProvenanceReceipt[];
  feedbacks: FeedbackSignal[];
  revisions: Revision[];
  versionDiffs: VersionDiff[];
  /** L4 self-calibration ledger (§9 disclosure: settled/open counts + skill honesty). */
  predictions: import('../../domain/prediction.js').LedgerEntry[];
  /** RU-1 memory-conditioning disclosure events (stage, items with trust labels). */
  memoryConditioning: Array<{ stage: string; items: Array<{ id: string; kind: string; trustClass: string }> }>;
  /** EEL (D-081): executed experiment objects for §7a + bundle experimentEvidence. */
  experimentRuns: ExperimentRun[];
  resultSets: ResultSet[];
  statReports: StatReport[];
}

const orNone = (items: string[]): string => (items.length > 0 ? items.join('；') : '（未声明）');

/** Deterministic ellipsis truncation for report lines (never fabricates, only shortens).
 * Codepoint-aware (WP2 F3): slicing on UTF-16 units can split surrogate pairs (emoji,
 * CJK ext-B) and emit a corrupted half-pair before the ellipsis. */
const truncate = (s: string, max: number): string => {
  const cps = [...s];
  return cps.length <= max ? s : `${cps.slice(0, max).join('')}…`;
};

/** Material missing/incomplete items shared by report §9 and bundle limitations — one owner. */
const collectMissing = (
  inputs: ExportInputs,
  facts: { lockMissing: boolean; receipts: ProvenanceReceipt[]; templateHypCount: number; templatePlanCount: number },
): string[] => {
  const out: string[] = [];
  if (facts.templateHypCount > 0) {
    out.push(`${facts.templateHypCount} 条假设为离线路由模板内容，未作为科学内容投影（留存于存储审计层）`);
  }
  if (facts.templatePlanCount > 0) {
    out.push(`${facts.templatePlanCount} 条研究计划为离线路由模板内容，未作为科学内容投影（留存于存储审计层）`);
  }
  if (!inputs.question) out.push('question 对象缺失');
  if (!inputs.corpus) out.push('corpus_snapshot 缺失');
  if (inputs.sources.length === 0) out.push('无任何 source_document');
  else {
    const unverified = inputs.sources.filter((s) => !s.verification).length;
    if (unverified > 0) out.push(`${unverified} 个来源缺少 verification 结果（未核验）`);
  }
  const unaligned = inputs.claims.filter((c) => c.bindingStatus === 'resolved_unaligned').length;
  if (unaligned > 0) out.push(`${unaligned} 条声明为 resolved_unaligned（来源已解析但检索内容不覆盖声明）`);
  if (inputs.scorecards.length === 0) out.push('无 scorecard（排序未完成或未记录）');
  if (!inputs.plan) out.push('无研究计划对象（plan 未生成）');
  else if (!inputs.plan.executabilityCheck) out.push('计划缺少 executabilityCheck 结果');
  else if (!inputs.plan.executabilityCheck.passed) {
    out.push(`计划 executabilityCheck 未通过：${inputs.plan.executabilityCheck.missing.join('；')}`);
  }
  else if (inputs.plan.executabilityCheck.statisticalDesignNote !== undefined) {
    // Passed the structural gate but statistically under-specified — disclosed in the
    // honesty inventory, never hidden (W-G Maastricht advisory).
    out.push(`统计设计提示：${inputs.plan.executabilityCheck.statisticalDesignNote}`);
  }
  const nonLive = facts.receipts.filter((r) => r.executionMode !== 'live');
  if (nonLive.length > 0) {
    out.push(`${nonLive.length} 条 receipt 的 executionMode 非 live：模型/来源环节未全部走 live 路由`);
  }
  if (facts.lockMissing) {
    out.push('package-lock.json 不可读：dependencyLockHash=sha256("missing") 为占位值，依赖锁定不可核验');
  }
  return out;
};

const buildReport = (d: ExportInputs, missingItems: string[], truth: RunTruthProfile): string => {
  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  // Honest-abstention banner (audit D-7): a run that ends completed with zero hypotheses
  // and no plan abstained by design — evidence was insufficient for any defensible
  // hypothesis and the system refused to fabricate. The list-level status alone
  // ("completed") must not be able to mislead; the banner says what actually happened.
  if (d.hypotheses.length === 0 && !d.plan) {
    push(
      '> **本 run 为诚实弃权：检索证据不足以支撑任何可辩护假设，系统拒绝编造（这是设计行为，非故障）。**',
      '',
    );
  }

  push(`# FAR-Lab 研究报告 — run ${d.run.id}`, '');
  push('> 本报告由本 run 的存储对象确定性渲染生成：每一节均来自持久化对象，未记录的内容以「缺失」明示，不含任何补造。', '');

  // ---- 1. question & scope ----
  push('## 1. 问题与范围', '');
  if (d.question) {
    const q = d.question;
    push(`- 问题（${q.id}）：${q.text}`);
    push(`- 目标类型：${q.goalType}`);
    if (q.background.trim().length > 0) push(`- 背景：${q.background}`);
    push(`- 领域：${q.scope.domain}`);
    push(`- 现象：${q.scope.phenomena.join('；')}`);
    if (q.scope.temporalBoundary) push(`- 时间边界：${q.scope.temporalBoundary}`);
    if (q.scope.spatialOrSystemBoundary) push(`- 系统/空间边界：${q.scope.spatialOrSystemBoundary}`);
    if (q.scope.populationOrScopeNotes) push(`- 总体/范围备注：${q.scope.populationOrScopeNotes}`);
    if (q.scope.inScope.length > 0) push(`- 范围内：${q.scope.inScope.join('；')}`);
    if (q.scope.outOfScope.length > 0) push(`- 范围外：${q.scope.outOfScope.join('；')}`);
    const c = q.constraints;
    const constraintGroups: readonly [string, string[]][] = [
      ['前提假设', c.assumptions],
      ['数据约束', c.dataConstraints],
      ['资源约束', c.resourceConstraints],
      ['伦理约束', c.ethicalConstraints],
      ['方法学约束', c.methodologicalConstraints],
    ];
    for (const [label, items] of constraintGroups) {
      if (items.length > 0) push(`- ${label}：${items.join('；')}`);
    }
  } else {
    push('（缺失：question 对象不可读）');
  }
  push('');

  // ---- 2. corpus & source verification ----
  push('## 2. 语料与来源核验', '');
  if (d.corpus) {
    push(`- 语料快照 ${d.corpus.id}：检索查询 ${d.corpus.queries.length} 条，文档 ${d.corpus.documentIds.length} 篇`);
    for (const q of d.corpus.queries) push(`  - 查询（${q.purpose}）：${q.text}`);
    for (const f of d.corpus.familyFailures) push(`  - 失败来源族：${f.family} — ${f.reason}`);
  } else {
    push('（缺失：corpus_snapshot）');
  }
  if (d.sources.length > 0) {
    push('| 标题 | 年份 | 深度 | 访问态 | 核验结果 | contentHash(前12位) |');
    push('|---|---|---|---|---|---|');
    for (const s of d.sources) {
      const verify = s.verification
        ? `${s.verification.method} · resolved=${s.verification.resolved}` +
          (s.verification.titleMatch !== undefined ? ` · titleMatch=${s.verification.titleMatch}` : '') +
          (s.verification.wrongPaperSuspect === true ? ' · ⚠️wrongPaperSuspect' : '')
        : '未核验';
      push(`| ${s.title} | ${s.publicationYear ?? '未知'} | ${s.contentDepth} | ${s.accessState} | ${verify} | ${s.contentHash.slice(0, 12)} |`);
    }
  } else {
    push('（缺失：无 source_document）');
  }
  push('');

  // ---- 3. claims & binding status ----
  push('## 3. 声明与绑定状态', '');
  push(`- 声明总数：${d.claims.length}`);
  const statuses: readonly CitationBindingStatus[] = ['verified', 'resolved_unaligned', 'unresolved', 'missing'];
  for (const st of statuses) {
    push(`- ${st}：${d.claims.filter((c) => c.bindingStatus === st).length} 条`);
  }
  const unaligned = d.claims.filter((c) => c.bindingStatus === 'resolved_unaligned');
  if (unaligned.length > 0) {
    push('- resolved_unaligned 明示（来源已解析但检索内容不覆盖声明，不得当作已证实证据）：');
    for (const c of unaligned) push(`  - ${c.id}：${c.text}`);
  } else {
    push('- 无 resolved_unaligned 声明。');
  }
  push('');

  // ---- 4. evidence relations ----
  push('## 4. 证据关系汇总', '');
  push(`- 关系总数：${d.relations.length}`);
  const coreTypes: readonly EvidenceRelationType[] = ['supports', 'contradicts', 'qualifies', 'unknown'];
  for (const t of coreTypes) {
    push(`- ${t}：${d.relations.filter((r) => r.relation === t).length} 条`);
  }
  const presentTypes = new Set(d.relations.map((r) => r.relation));
  for (const t of presentTypes) {
    if (!coreTypes.includes(t)) push(`- ${t}：${d.relations.filter((r) => r.relation === t).length} 条`);
  }
  const counter = d.relations.filter((r) => RELATION_POLARITY[r.relation] === 'counter');
  if (counter.length > 0) {
    push('- 关键反证：');
    // A counter-evidence line must carry the actual claim text and its source title —
    // a bare generic rationale is unusable to a researcher. Claim text comes from the
    // stored claim object; source-level relations (no claimId) render the source title.
    const claimById = new Map(d.claims.map((c) => [c.id, c] as const));
    const sourceById = new Map(d.sources.map((s) => [s.id, s] as const));
    for (const r of counter) {
      const claim = r.claimId ? claimById.get(r.claimId) : undefined;
      const sourceId = claim?.locators[0]?.sourceDocumentId ?? r.sourceDocumentId;
      const source = sourceId !== undefined ? sourceById.get(sourceId) : undefined;
      const sourceLabel = source
        ? truncate(source.title, 40)
        : sourceId !== undefined
          ? `${sourceId}（来源对象缺失）`
          : '未记录来源';
      const main = claim
        ? truncate(claim.text, 120)
        : r.claimId
          ? `claim ${r.claimId} 未在 store 中（悬空引用）`
          : source
            ? truncate(source.title, 40)
            : r.rationale;
      push(`  - [${r.relation}] ${main}（来源: ${sourceLabel}，strength=${r.strength}）`);
    }
  } else {
    push('- 关键反证：本 run 检索范围内未记录反证关系（仅代表检索范围内未发现，不等于不存在）。');
  }
  // D-018: claim-claim cross relations (contradictions/support between papers) get their own lines —
  // they are cross-source findings, not per-claim stances toward the question.
  const cross = d.relations.filter((r) => r.targetClaimId !== undefined);
  if (cross.length > 0) {
    const claimById = new Map(d.claims.map((c) => [c.id, c] as const));
    push(`- 跨文献声明间关系（D-018，claim↔claim）：${cross.length} 条`);
    for (const r of cross) {
      const a = r.claimId !== undefined ? claimById.get(r.claimId) : undefined;
      const b = claimById.get(r.targetClaimId!);
      push(
        `  - [${r.relation}] 「${a ? truncate(a.text, 80) : r.claimId ?? '?'}」 vs 「${b ? truncate(b.text, 80) : r.targetClaimId ?? '?'}」— ${truncate(r.rationale, 160)}`,
      );
    }
  }
  push('');

  // ---- 5. hypotheses (ranked representatives) ----
  push('## 5. 假设（排序代表）', '');
  const byId = new Map(d.hypotheses.map((h) => [h.id, h] as const));
  const representatives =
    d.scorecards.length > 0
      ? d.scorecards
          .map((s) => byId.get(s.hypothesisId))
          .filter((h): h is HypothesisCandidate => h !== undefined)
      : d.hypotheses;
  if (representatives.length === 0) {
    push('（缺失：无假设候选）');
  } else {
    for (const h of representatives) {
      push(`### ${h.id}（版本 v${h.version}）`, '');
      push(`- 陈述：${h.statement}`);
      push(`- 机制：${h.mechanism.trim().length > 0 ? h.mechanism : '（未提供）'}`);
      if (h.assumptions.length > 0) {
        push('- 关键前提：');
        for (const a of h.assumptions) push(`  - [${a.kind}] ${a.statement}`);
      } else {
        push('- 关键前提：（未声明）');
      }
      const f = h.falsification;
      if (f) {
        push(
          `- 证伪规格要点：观测=${f.observable}；测量=${f.measurement}；判定规则=${f.decisionRule}；证伪条件=${f.falsificationCondition}；${decisionRuleProvenanceLabel(f.decisionRuleProvenance)}`,
        );
        push(
          `- 证伪规格完整性（completenessCheck）：${
            f.completenessCheck
              ? f.completenessCheck.passed
                ? '通过'
                : `未通过（缺：${f.completenessCheck.missing.join('；')}）`
              : '未检查'
          }`,
        );
      } else {
        push('- 证伪规格：缺失');
      }
      // W5/S4: noveltyLabel is corpus-relative — the qualifier is mandatory at every
      // presentation point so the label can never be read as a literature-level verdict.
      push(`- testability：${h.testability}；noveltyLabel：${h.noveltyLabel}${NOVELTY_CORPUS_QUALIFIER}`);
      // D-017: second novelty layer, judged against retrieved literature neighbors.
      const lit = h.literatureNovelty;
      if (lit) {
        push(
          `- 文献级新颖性（对照检索到的近邻文献判定）：${lit.verdict}` +
            (lit.neighbors.length > 0
              ? `；最近邻：${lit.neighbors.slice(0, 3).map((n) => `${n.title}${n.year !== undefined ? ` (${n.year})` : ''}`).join('；')}`
              : '；近邻：（未检索到）'),
        );
        push(`  - 判定依据：${lit.justification}（producer=${lit.producer}；calibration=${lit.calibration}）`);
      }
      const clusterSize = h.clusterKey
        ? d.hypotheses.filter((x) => x.clusterKey === h.clusterKey).length
        : 1;
      push(`- 簇内候选数（含本代表）：${clusterSize}`);
      push('');
    }
    const extras = d.hypotheses.filter((h) => !representatives.includes(h));
    if (extras.length > 0) push(`（另有 ${extras.length} 个未进入排序代表的候选，未在本节展开）`);
  }
  push('');

  // ---- 6. ranking & scores ----
  push('## 6. 排序与评分', '');
  push(`> 声明：${SCORE_DISCLAIMER}`);
  if (d.scorecards.length === 0) push('（缺失：无 scorecard，本 run 未记录排序）');
  for (const s of d.scorecards) {
    push('', `### rank ${s.rank} / ${s.rankedOutOf} — ${s.hypothesisId}`, '');
    push(`- 总评：${s.overallRationale}`);
    if (s.comparisonNote.trim().length > 0) push(`- 比较说明：${s.comparisonNote}`);
    push('- 各维度评分：');
    for (const dim of s.dimensions) {
      const value = dim.value === null ? '未评估（null）' : String(dim.value);
      push(
        `  - ${dim.dimension}：${value}${dim.qualitative ? `（${dim.qualitative}）` : ''} — ${dim.rationale} [producer=${dim.producer}; calibration=${dim.calibration}]`,
      );
    }
  }
  push('');

  // ---- 7. research plan ----
  push('## 7. 研究计划', '');
  if (d.plan) {
    const p = d.plan;
    push(`- 计划 ${p.id}；objective：${p.objective}`);
    push(`- 绑定假设：${p.hypothesisIds.join('；')}`);
    push(`- 变量：${orNone(p.variables)}`);
    push(`- 对照：${orNone(p.controls)}`);
    push(`- 纳入标准：${orNone(p.inclusionCriteria)}`);
    push(`- 排除标准：${orNone(p.exclusionCriteria)}`);
    if (p.dataRequirements.length > 0) {
      push('- 数据需求：');
      for (const req of p.dataRequirements) {
        push(
          `  - ${req.name}（availability=${req.availability}${req.sourceHint ? `，sourceHint=${req.sourceHint}` : ''}）：variables=${req.variables.join('、')}`,
        );
      }
    } else {
      push('- 数据需求：（未声明）');
    }
    if (p.toolRequirements.length > 0) {
      push('- 工具需求：');
      for (const t of p.toolRequirements) push(`  - ${t.name}（${t.kind}）：${t.purpose}`);
    } else {
      push('- 工具需求：（未声明）');
    }
    // Render-layer defense: plans persisted before W2 reference-integrity sanitization
    // can still contain fabricated `task_` ids; never render them as if they were valid.
    const stepIds = new Set(p.steps.map((s) => s.id));
    const renderRef = (ref: string): string =>
      ref.startsWith('task_') && !stepIds.has(ref) ? '(invalid ref removed at render)' : ref;
    push('- 步骤：');
    p.steps.forEach((s, i) => {
      push(`  ${i + 1}. ${s.title}（${s.kind}）`);
      push(`     - method：${s.method}`);
      push(`     - inputs：${orNone(s.inputs.map(renderRef))}；outputs：${orNone(s.outputs)}`);
      push(`     - failureConditions：${s.failureConditions.length > 0 ? s.failureConditions.join('；') : '（未声明）'}`);
      if (s.dependsOn.length > 0) push(`     - dependsOn：${s.dependsOn.map(renderRef).join('、')}`);
      if (s.estimatedCost) push(`     - 预估成本：${s.estimatedCost}`);
    });
    push(`- 指标：${p.metrics.join('；')}`);
    if (p.statistics.length > 0) push(`- 统计方法：${p.statistics.join('；')}`);
    push('- 判定规则（decisionRules）：');
    push(`  - 成功判据：${p.decisionRules.successCriterion}`);
    push(`  - 弱化判据：${p.decisionRules.weakeningCriterion}`);
    push(`  - 证伪判据：${p.decisionRules.falsificationCriterion}`);
    push(`  - 判停判据：${p.decisionRules.stopCriterion}`);
    if (p.multipleTestingPolicy) {
      const mtLabel: Record<typeof p.multipleTestingPolicy, string> = {
        single_primary: '单一主要比较（其余为次要/描述性）',
        alpha_spending: '预分配错误预算（alpha-spending）',
        e_value_accumulation: 'e 值累证（anytime-valid）',
      };
      push(`  - 多重检验纪律（multipleTestingPolicy）：${mtLabel[p.multipleTestingPolicy]}${p.multipleTestingNote ? `——${p.multipleTestingNote}` : ''}`);
    }
    push(`- 混杂因素：${orNone(p.confounders)}`);
    push(`- 备择解释：${orNone(p.alternativeExplanations)}`);
    push(`- 资源：compute=${p.resources.compute}；cost=${p.resources.cost}；time=${p.resources.time}`);
    push(`- 风险：${orNone(p.risks)}`);
    push(`- 伦理：${orNone(p.ethics)}`);
    push(`- 前置条件：${orNone(p.prerequisites)}`);
    if (p.expectedInformationGain) push(`- 预期信息增益：${p.expectedInformationGain}`);
    push(`- 备选分支：${orNone(p.alternativeBranches)}`);
    push(`- 可复现性要求：${orNone(p.reproducibilityRequirements)}`);
    push(`- 引用证据声明：${p.evidenceClaimIds.length > 0 ? p.evidenceClaimIds.join('；') : '（无）'}`);
    const check = p.executabilityCheck;
    push(
      `- executabilityCheck：${
        check ? (check.passed ? '通过' : `未通过 — 缺失项：${check.missing.join('；')}`) : '未检查'
      }`,
    );
    // ---- W5/S5: evidence-ceiling disclosure (computed from the store, never asserted by the model) ----
    // The plan's scale/sample sizes/quantitative thresholds routinely exceed what the
    // corpus can support; the report must say so with the real counts.
    const metadataOnly = d.sources.filter((s) => s.contentDepth === 'metadata_only').length;
    const abstractOrDeeper = d.sources.length - metadataOnly;
    push('');
    push(
      `**证据上限声明**：本计划基于 ${d.sources.length} 篇来源（${abstractOrDeeper} 篇摘要级/${metadataOnly} 篇元数据级）生成；` +
        '计划中的资源规模、样本量与量化阈值为模型拟定值，其证据支撑度见各假设的 decisionRuleProvenance 标注。',
    );
    push('');
    push(
      `（注：摘要级 = contentDepth 为 abstract/full_text/data 的来源；元数据级 = metadata_only，未参与声明提取。）`,
    );
  } else {
    push('（缺失：本 run 未生成研究计划）');
  }
  push('');

  // ---- 7a. executed experiment results (EEL, D-081) ----
  if (d.experimentRuns.length > 0) {
    push('### 7a. 实验执行结果（真实运行）', '');
    // g11 (VerifiedRegistry-lite): every number below renders field-by-field from
    // persisted experiment objects — no LLM-generated numerics in this section.
    push('> 数值溯源：本节所有数值逐字段渲染自持久化实验对象（result_set / stat_report），无 LLM 生成数值。', '');
    for (const xr of d.experimentRuns) {
      push(`- 实验 ${xr.id}：${xr.status}（executor=${xr.executor}；spec=${xr.specId}@${xr.specHash.slice(0, 12)}；python=${xr.environment?.pythonVersion ?? 'unknown'}${xr.environment?.lockfileHash ? `；envLock=${xr.environment.lockfileHash.slice(0, 12)}` : ''}）`);
      if (xr.error) push(`  - 错误：${xr.error}`);
      for (const rs of d.resultSets.filter((r) => r.experimentRunId === xr.id)) {
        push(`  - 数据集 ${rs.datasetRecordId}（split ${rs.splitHash.slice(0, 12)}）：`);
        for (const c of rs.cells) {
          const metrics = Object.entries(c.metrics).map(([k, v]) => `${k}=${Number(v).toFixed(4)}`).join(', ');
          push(`    - ${c.modelName}${c.tags.length > 0 ? ` [${c.tags.join(', ')}]` : ''}: ${metrics}（train/test=${c.nTrain}/${c.nTest}，${c.timingMs}ms）`);
        }
      }
      for (const rep of d.statReports.filter((s) => s.experimentRunId === xr.id)) {
        const parts = [`比较 ${rep.comparisonId} [${rep.metricKey}]`];
        if (rep.hypothesisId) parts.push(`假设 ${rep.hypothesisId}@v${rep.hypothesisVersion ?? '?'}`);
        parts.push(`point=${rep.pointEstimate.toFixed(4)}，CI${rep.ci.level.toFixed(3)}[${rep.ci.low.toFixed(4)}, ${rep.ci.high.toFixed(4)}]`);
        if (rep.adjustedAlpha !== undefined) parts.push(`校正α=${rep.adjustedAlpha}`);
        parts.push(`阈值来源=${rep.thresholdProvenance}`);
        if (rep.verdict !== undefined) parts.push(`verdict=${rep.verdict}`);
        if (rep.secondary) parts.push('secondary（描述性）');
        if (rep.exploratory) parts.push('exploratory');
        parts.push(`iteration=${rep.analysisIteration}`);
        push(`  - 判定报告 ${rep.id}：${parts.join('；')}`);
      }
    }
    push('');
  }

  // ---- 8. uncertainties & open questions ----
  push('## 8. 不确定性与未决问题', '');
  const claimUnc = d.claims.flatMap((c) => c.uncertainties.map((u) => `- 声明 ${c.id}：${u}`));
  const hypUnc = d.hypotheses.flatMap((h) => h.uncertainties.map((u) => `- 假设 ${h.id}：${u}`));
  if (claimUnc.length + hypUnc.length === 0) push('存储对象中未记录不确定性条目。');
  else push(...claimUnc, ...hypUnc);
  push('');

  // ---- 9. provenance summary ----
  push('## 9. 溯源（Provenance）摘要', '');
  const modelCalls = d.receipts.filter((r) => r.kind === 'model_call');
  const nonLive = d.receipts.filter((r) => r.executionMode !== 'live');
  push(`- provenance receipts：${d.receipts.length} 条（统计截至报告渲染时，不含本次导出动作自身的 export receipt）`);
  push('');

  // ---- 10. feedback / revision / version diff (causal chain, mission §33/§34) ----
  push('## 10. 反馈与修订（因果链）', '');
  if (d.feedbacks.length === 0) {
    push('本 run 尚无反馈信号（feedback channel 未使用或未触发修订）。');
  } else {
    for (const f of d.feedbacks) {
      push(`- 反馈 ${f.id}（source=${f.source}，${f.receivedAt}）：${f.content.slice(0, 200)}`);
    }
    push('');
    if (d.revisions.length === 0) {
      push('- 已记录反馈但尚无修订（revise 阶段未执行或判定无可修订对象）。');
    }
    for (const r of d.revisions) {
      push(`- 修订 ${r.id}（${r.fromVersionLabel} -> ${r.toVersionLabel}，触发反馈 ${r.triggerFeedbackId}）：`);
      push(`  - 因果：${r.causalReason.slice(0, 300)}`);
      for (const op of r.operations) {
        push(`  - [${op.objectType}/${op.operation}] ${op.objectId}：${(op.before ?? '').slice(0, 80)}… -> ${(op.after ?? '').slice(0, 80)}…（${op.reason.slice(0, 120)}）`);
      }
      push(`  - 质量变化：${r.qualityDelta.status} — ${r.qualityDelta.claim.slice(0, 160)}`);
    }
    for (const vd of d.versionDiffs) {
      push(`- 版本差异 ${vd.revisionId}：${vd.semanticSummary.slice(0, 240)}`);
      for (const e of vd.entries) {
        push(`  - ${e.objectType} ${e.objectId}：${e.summary.slice(0, 120)}（changed: ${e.changedFields.join(', ')}）`);
      }
      if (vd.remainingUncertainties.length > 0) push(`  - 剩余不确定性：${vd.remainingUncertainties.slice(0, 3).join('；').slice(0, 240)}`);
    }
  }
  push('');
  push(`- 模型调用：${modelCalls.length} 次`);
  push(
    `- executionMode 全部为 live：${
      nonLive.length === 0
        ? '是'
        : `否（${nonLive.length} 条非 live：${nonLive.map((r) => r.executionMode).join('、')}）`
    }`,
  );
  push(`- ${truthDisclosureLine(truth)}`);
  // L4 self-calibration ledger honesty line: what was predicted, what settled,
  // and whether the sample is even interpretable (n<30 strata say so).
  const settledLedger = d.predictions.filter((p) => p.settledAt !== undefined).length;
  const voidLedger = d.predictions.filter((p) => p.voidReason !== undefined).length;
  const openLedger = d.predictions.length - settledLedger - voidLedger;
  push(
    `- 前向预测账本：${d.predictions.length} 条（已结算 ${settledLedger}、作废 ${voidLedger}、未结算 ${openLedger}）${
      d.predictions.length > 0 ? '；结算采用 RPS/Brier 对无知基线打分，样本不足的分层如实标注"证据不足"' : ''
    }`,
  );
  // RU-1 cross-run memory disclosure: what conditioned generation, with labels.
  if (d.memoryConditioning.length > 0) {
    const memTotal = d.memoryConditioning.reduce((a, m) => a + m.items.length, 0);
    // Researcher language for the stage enums (display only; the raw value
    // rides the same line in parentheses for audit parity).
    const STAGE_ZH: Record<string, string> = {
      scope: '范围界定', retrieve: '文献检索', verify_sources: '来源核验', build_evidence: '证据构建',
      generate_hypotheses: '假设生成', critique_falsify: '批判与证伪', rank: '排序评分', plan: '研究计划',
      execute: '实验执行', feedback: '反馈', revise: '修订', export: '导出',
    };
    const stages = [...new Set(d.memoryConditioning.map((m) => m.stage))]
      .map((s) => `${STAGE_ZH[s] ?? s}(${s})`)
      .join('、');
    push(`- 工作区记忆调节：${memTotal} 条既往实验结果（信任标签随行）作为数据注入 ${stages} 生成——非本轮证据（RU-1）`);
  }
  push(`- 缺失项：${missingItems.length === 0 ? '无已知缺失项' : missingItems.join('；')}`);
  push('');

  return L.join('\n');
};

/** Distinct (provider, modelId) pairs actually seen in model_call receipts, routed honestly. */
const aggregateModelMetadata = (
  receipts: ProvenanceReceipt[],
): ReproducibilityBundle['modelMetadata'] => {
  const map = new Map<string, ReproducibilityBundle['modelMetadata'][number]>();
  for (const r of receipts) {
    if (r.kind !== 'model_call' || !r.modelCall) continue;
    const route: ReproducibilityBundle['modelMetadata'][number]['route'] =
      r.executionMode === 'live' ? 'live' : 'test_only';
    const key = `${r.modelCall.provider}|${r.modelCall.modelId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { provider: r.modelCall.provider, modelId: r.modelCall.modelId, route });
    } else if (route === 'live') {
      existing.route = 'live'; // if the same pair ever ran live, record the stronger truth
    }
  }
  return [...map.values()];
};

/** Provenance: release builds inject FARLAB_GIT_COMMIT; otherwise read the working repo honestly. */
const resolveCodeRevision = (): string => {
  const fromEnv = process.env.FARLAB_GIT_COMMIT;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim();
  try {
    const rev = execSync('git rev-parse HEAD', { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{7,40}$/.test(rev) ? rev : 'unknown';
  } catch {
    return 'unknown'; // not a git checkout (e.g. installed distribution) — honest, never invented
  }
};

export const exportStage: StageHandler = {
  stage: 'export',
  applicable: async (ctx) => {
    // Re-export when no bundle exists, when a revision landed after the newest
    // bundle, OR when the corpus grew beyond the sources the bundle covers
    // (§5.2 evidence debt: counter-search added sources post-completion; the
    // report/bundle must reflect them). Count-based, not timestamp-based —
    // fixture/clock skew cannot spuriously re-trigger.
    const bundles = ctx.store.listObjects('bundle', ctx.run.id);
    if (bundles.length === 0) return true;
    const latestBundle = bundles[bundles.length - 1]!;
    const newerRevision = ctx.store
      .listObjects('revision', ctx.run.id)
      .find((r) => r.createdAt > latestBundle.createdAt);
    if (newerRevision !== undefined) return true;
    const sourceCount = ctx.store.listObjects('source_document', ctx.run.id).length;
    if (sourceCount > latestBundle.sourceArtifactHashes.length) return true;    // Slice-4 (count-based like the source rule): a protocol ledger that grew past
    // what the latest bundle recorded, or a protocol registered after the bundle,
    // forces re-export — the bundle must never omit ledger truth the store holds.
    const coveredProtocols = new Map((latestBundle.protocolEvidence ?? []).map((e) => [e.protocolId, e]));
    for (const p of ctx.store.listObjects('protocol', ctx.run.id)) {
      const covered = coveredProtocols.get(p.id);
      if (covered === undefined) return true;
      const ex = ctx.store.listObjects('protocol_execution', ctx.run.id).find((e) => e.protocolId === p.id) ?? null;
      const coveredRecords = covered.executionId !== null ? covered.recordCount : 0;
      if ((ex?.records.length ?? 0) > coveredRecords) return true;
    }

    // Real-content remediation (2026-08-29): a bundle minted by a build that
    // still PROJECTED offline-template hypotheses carries them in its scientific
    // layer — re-export under the filtering discipline mints a clean bundle
    // (legacy objects stay in the audit store; the OLD bundle stays hash-stable
    // for provenance).
    return latestBundleTemplateTainted(ctx.artifacts, latestBundle);
  },

  execute: async (ctx) => {
    if (ctx.cancelled()) throw new Error('cancelled by user');
    const run = ctx.run;

    const question = ctx.store.getObject('question', run.questionId);
    const corpus = ctx.store.listObjects('corpus_snapshot', run.id).at(-1) ?? null;
    const sources = ctx.store.listObjects('source_document', run.id);
    const claims = ctx.store.listObjects('claim', run.id);
    const relations = ctx.store.listObjects('evidence_relation', run.id);
    // Real-content discipline (owner directive 2026-08-29): legacy offline runs
    // minted template hypotheses ("Offline hypothesis N") into the store. They
    // stay stored (audit truth plane) but NEVER project into the scientific
    // export — report, paper, bundle JSON-LD, tables and figures all read this
    // filtered list. One owner: the export stage's store read.
    const allHypotheses = ctx.store.listObjects('hypothesis', run.id);
    const templateHypCount = allHypotheses.filter((h) => isTemplateHypothesis(h)).length;
    const hypotheses = allHypotheses.filter((h) => !isTemplateHypothesis(h));
    const realHypIds = new Set(hypotheses.map((h) => h.id));
    // Template plans ("Offline development plan: …") follow the same rule.
    const templatePlanCount = ctx.store.listObjects('plan', run.id).filter(isTemplatePlan).length;
    const planObjects = ctx.store.listObjects('plan', run.id).filter((p) => !isTemplatePlan(p));
    const plan = planObjects.at(-1) ?? null;
    const scorecards = ctx.store
      .listObjects('scorecard', run.id)
      .filter((s) => realHypIds.has(s.hypothesisId))
      .sort((a, b) => a.rank - b.rank);
    const receipts = ctx.store.listObjects('receipt', run.id);
    const feedbacks = ctx.store.listObjects('feedback', run.id);
    const revisions = ctx.store.listObjects('revision', run.id);
    const versionDiffs = ctx.store.listObjects('version_diff', run.id);
    const experimentRuns = ctx.store.listObjects('experiment_run', run.id);
    const resultSets = ctx.store.listObjects('result_set', run.id);
    // Collected for bundle completeness accounting; report rendering reads experiment runs
    // directly — underscore keeps the unused-name honest instead of deleting the read.
    const _statReports = ctx.store.listObjects('stat_report', run.id);    // Slice-4 protocol chain: pre-registered protocols + human-attested ledgers ride the export.
    const protocols = ctx.store.listObjects('protocol', run.id);
    const protocolExecutions = ctx.store.listObjects('protocol_execution', run.id);


    // Hash of what is actually on disk; a marked placeholder when missing (never invented).
    // Resolved from THIS module's location (WP2 F2), not process.cwd(): `far research`
    // can run from any directory, and a cwd-relative read would hash the user's
    // unrelated lockfile (or 'missing') into the reproducibility bundle.
    let dependencyLockHash: string;
    let lockMissing = false;
    try {
      const lockPath = process.env.FARLAB_LOCKFILE_PATH
        ?? findUp('package-lock.json', import.meta.dirname ?? process.cwd());
      if (lockPath === null) throw new Error('package-lock.json not found on any ancestor of the module');
      dependencyLockHash = sha256Hex(fs.readFileSync(lockPath));
    } catch {
      dependencyLockHash = sha256Hex('missing');
      lockMissing = true;
    }

    const inputs: ExportInputs = {
      run, question, corpus, sources, claims, relations, hypotheses, scorecards, plan, receipts, feedbacks, revisions, versionDiffs,
      predictions: ctx.store.listObjects('prediction', run.id),
      memoryConditioning: ctx.store
        .listEvents(run.id)
        .filter((e) => (e.detail as { reason?: string })?.reason === 'memory_conditioning')
        .map((e) => {
          // stage lives on the event ENVELOPE (appendEvent puts it there); detail
          // carries {ids, items} — reading detail.stage would render "unknown".
          const d = e.detail as { items?: Array<{ id: string; kind: string; trustClass: string }> };
          return { stage: e.stage ?? 'unknown', items: Array.isArray(d.items) ? d.items : [] };
        })
        .filter((m) => m.items.length > 0),
      experimentRuns: ctx.store.listObjects('experiment_run', run.id),
      resultSets: ctx.store.listObjects('result_set', run.id),
      statReports: ctx.store.listObjects('stat_report', run.id),
    };
    const missingItems = collectMissing(inputs, { lockMissing, receipts, templateHypCount, templatePlanCount });
    // §5.5 execution truth: one deterministic projection over the SAME receipt window
    // the report §9 summarizes (pre-export). Local export receipts never affect the class.
    const truth = truthProfileFromReceipts(run.id, receipts);
    const report = buildReport(inputs, missingItems, truth);
    const reportPut = await ctx.artifacts.put(report);

    // BP-3 research-product layer: IMRaD paper outline + deterministic limitations +
    // BibTeX references, projected from the SAME stored objects (zero LLM). Rendered
    // markdown becomes the second export artifact; served as `<runId>.paper.md`.
    const paperOutline = buildPaperOutline(ctx.store, run.id);
    const paperPut = await ctx.artifacts.put(renderPaperMarkdown(paperOutline));

    // Lane-07 scientific communication: deterministic figures/tables from the same
    // projection (now pinned to the outline's own generatedAt for byte-stable rebuilds).
    const figureProvenance = { runId: run.id, generatedAt: paperOutline.provenance.generatedAt };
    const figureDefs = [
      { name: 'win-rate', description: 'Win rate by ranked hypothesis (tournament standings)', svg: buildWinRateFigure(paperOutline, figureProvenance) },
      { name: 'corpus-depth', description: 'Retrieved corpus by content depth', svg: buildCorpusDepthFigure(sources, figureProvenance) },
    ];
    const figurePuts = [];
    for (const f of figureDefs) {
      const put = await ctx.artifacts.put(f.svg);
      figurePuts.push({ name: f.name, description: f.description, put });
    }
    const tableDefs = [buildResultsTable(paperOutline), buildCorpusTable(sources), buildClaimBindingTable(claims)];
    const tablePuts = [];
    for (const t of tableDefs) {
      for (const [format, content] of [['csv', tableToCsv(t)], ['md', tableToMarkdown(t)]] as const) {
        const put = await ctx.artifacts.put(content);
        tablePuts.push({ name: t.name, format, put });
      }
    }

    ctx.recordReceipt({
      kind: 'export',
      executionMode: 'live', // deterministic local rendering of stored objects — actually executed
      stage: 'export',
      redactionNote: 'deterministic render of stored objects; no model call involved',
      toolExec: {
        tool: 'pipeline/export',
        inputHash: canonicalSha256({
          runId: run.id,
          questionId: question?.id ?? null,
          corpusId: corpus?.id ?? null,
          sourceIds: sources.map((s) => s.id),
          claimIds: claims.map((c) => c.id),
          relationIds: relations.map((r) => r.id),
          hypothesisIds: hypotheses.map((h) => h.id),
          scorecardIds: scorecards.map((s) => s.id),
          planId: plan?.id ?? null,
          receiptIds: receipts.map((r) => r.id),
        }),
        outputHash: reportPut.hash,
      },
    });

    ctx.recordReceipt({
      kind: 'export',
      executionMode: 'live', // deterministic local rendering of stored objects — actually executed
      stage: 'export',
      redactionNote: 'deterministic figures/tables render of stored objects; no model call involved',
      toolExec: {
        tool: 'pipeline/export-figures-tables',
        inputHash: canonicalSha256({
          runId: run.id,
          paperHash: paperPut.hash,
          sourceContentHashes: sources.map((s) => s.contentHash),
          claimIds: claims.map((c) => c.id),
        }),
        outputHash: canonicalSha256([
          ...figurePuts.map((f) => f.put.hash),
          ...tablePuts.map((t) => t.put.hash),
        ]),
      },
    });

    const allReceipts = ctx.store.listObjects('receipt', run.id);
    // Bundle limitations carry the full-window truth line whenever the run is not
    // fully live (synthetic / replayed / mixed external evidence must not be able
    // to hide inside a bundle that looks reproducible-live).
    const truthAll = truthProfileFromReceipts(run.id, allReceipts);
    // Slice-4 protocol evidence: content-address the frozen spec and the ledger; the
    // ledger's honesty counts ride the bundle and its limitations line is verbatim-
    // checkable (verify re-derives counts and requires the disclosure line).
    const protocolEvidenceEntries: Array<{
      protocolId: string;
      executionId: string | null;
      protocolArtifactHash: string;
      ledgerArtifactHash: string | null;
      recordCount: number;
      deviations: number;
      qcFailedMeasurements: number;
    }> = [];
    const protocolLimitationLines: string[] = [];
    for (const p of protocols) {
      const specPut = await ctx.artifacts.put(canonicalJson(p));
      const ex = protocolExecutions.find((e) => e.protocolId === p.id) ?? null;
      const ledgerPut = ex !== null ? await ctx.artifacts.put(canonicalJson(ex)) : null;
      const deviations = ex !== null ? ex.deviations.length : 0;
      const qcFailed = ex !== null ? ex.measurements.filter((m) => !m.qcPassed).length : 0;
      protocolEvidenceEntries.push({
        protocolId: p.id,
        executionId: ex !== null ? ex.id : null,
        protocolArtifactHash: specPut.hash,
        ledgerArtifactHash: ledgerPut !== null ? ledgerPut.hash : null,
        recordCount: ex !== null ? ex.records.length : 0,
        deviations,
        qcFailedMeasurements: qcFailed,
      });
      protocolLimitationLines.push(
        `协议 ${p.id}（${p.paradigm}）：${ex !== null ? `台账 ${ex.id} 状态 ${ex.status}；` : '台账未开始；'}`
          + `${deviations} 项偏差、${qcFailed} 项 QC 失败测量如实留存；物理环节复现需人工按采集表重做`,
      );
    }

    const limitations = [
      '模型环节为 LLM 生成、具有非确定性：bundle 可复放的是输入快照、模型元数据、receipts 与工件哈希，不保证重新生成逐字节一致的输出。',
      ...(truthAll.klass !== 'live' ? [truthDisclosureLine(truthAll)] : []),
      ...collectMissing(inputs, { lockMissing, receipts: allReceipts, templateHypCount, templatePlanCount }),      ...protocolLimitationLines,

    ];

    const bundleId = newId('bnd');
    const bundle = ReproducibilityBundle.parse({
      id: bundleId,
      runId: run.id,
      declaredEvidenceLevel: 'replay',
      codeRevision: resolveCodeRevision(),
      environmentFingerprint: `node ${process.version} ${process.platform}`,
      dependencyLockHash,
      questionRef: question?.id ?? 'missing:question',
      corpusSnapshotRef: corpus?.id ?? 'missing:corpus_snapshot',
      sourceArtifactHashes: sources.map((s) => s.contentHash),
      modelMetadata: aggregateModelMetadata(allReceipts),
      receiptIds: allReceipts.map((r) => r.id),
      // [0] stays the report (CLI/`GET /report` depend on it); [1] is the BP-3 paper markdown.
      finalArtifactHashes: [reportPut.hash, paperPut.hash],
      paperOutlineRef: paperPut.ref,
      // Lane-07 scientific-communication artifacts: deterministic figures/tables content-
      // addressed in the artifact store (same projection as the paper, zero LLM).
      figures: figurePuts.map((f) => ({ name: f.name, ref: f.put.ref, description: f.description })),
      tables: tablePuts.map((t) => ({ name: t.name, ref: t.put.ref, format: t.format })),
      verificationInstructions: `far verify --bundle ${bundleId}（第三方核验：按 receiptIds 比对 receipts、按 sourceArtifactHashes 比对来源快照、按 finalArtifactHashes 比对导出工件）`,
      limitations,
      // SWAN interchange (W-G follow-up): surviving hypotheses as JSON-LD ResearchStatements.
      ...(hypotheses.length > 0 ? { hypothesisJsonLd: hypotheses.map((h) => toSwanJsonLd(h)) } : {}),
      ...(protocolEvidenceEntries.length > 0 ? { protocolEvidence: protocolEvidenceEntries } : {}),
      // EEL evidence (D-081): experiment object ids + content-addressed artifact hashes.
      ...(experimentRuns.length > 0 ? {
        experimentEvidence: experimentRuns.map((xr) => ({
          experimentRunId: xr.id,
          resultIds: xr.resultIds,
          statReportIds: xr.statReportIds,
          artifactHashes: [
            ...resultSets.filter((rs) => rs.experimentRunId === xr.id).flatMap((rs) => rs.cells.map((c) => c.perRowRef.replace('sha256:', ''))),
            ...(xr.trainingLogRef !== undefined ? [xr.trainingLogRef.replace('sha256:', '')] : []),
          ],
          ...(xr.environment?.lockfileHash !== undefined ? { lockfileHash: xr.environment.lockfileHash } : {}),
        })),
      } : {}),
      createdAt: new Date().toISOString(),
    });
    ctx.store.putObject('bundle', bundle);
    const bundlePut = await ctx.artifacts.put(canonicalJson(bundle));

    const summary = `reproducibility bundle ${bundle.id} (${bundlePut.ref}); report ${reportPut.ref}; paper ${paperPut.ref}; figures ${figurePuts.map((f) => f.name).join('+')}; tables ${tablePuts.map((t) => `${t.name}.${t.format}`).join('+')}; declaredEvidenceLevel=replay`;
    ctx.log(summary);
    return { kind: 'done', summary, artifacts: [reportPut.ref, bundlePut.ref, paperPut.ref] };
  },
};
