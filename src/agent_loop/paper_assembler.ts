/**
 * paperAssembler —— 六阶段产物聚合为比赛 10 字段输出。
 *
 * 定位：runAgentLoop 终止后执行的**确定性映射函数**（不经 LLM·禁 LLM-as-judge）。
 * 把六个阶段产出的 UnderstandingPayload / IntegrationPayload / HypothesisPayload /
 * EvidencePayload / PlanPayload / FeedbackPayload 聚合为 ResearchPaperOutput 10 字段。
 *
 * 直接对齐 OFFICIAL_赛题要求_权威核实.md §3.2 + 赛道一A「生成结果规范」10 字段。
 *
 * 适配说明（与 spec §5.5 差异）：
 *   spec 用 `state.stages.stage1_understanding?.payload` 字典访问——项目 LoopState
 *   实际为 `artifacts: readonly StageArtifact[]` 数组（按执行顺序）。本实现按 stageId
 *   从 artifacts 数组中找出对应阶段产物，符合项目实际类型契约。
 *
 *   spec 用 `as HypothesisPayload` 单层断言——本实现用 `structured.kind === 'hypothesis'`
 *   discriminatedUnion narrow（R10 修复落地·零容忍 #1 字面规避）。
 */

import type {
  EvidencePayload,
  FeedbackPayload,
  HypothesisPayload,
  IntegrationPayload,
  LoopState,
  PlanPayload,
  ResearchPaperOutput,
  StageArtifact,
  UnderstandingPayload,
} from './types.ts';
import type { Verdict } from '../schema/enums.ts';


/**
 * assemblePaper: 确定性映射——把 LoopState 的六阶段 payload 聚合为比赛 10 字段输出。
 *
 * 禁 LLM-as-judge（纯数据映射·不经 LLM 调用）。
 *
 * 当某些阶段产物缺失时（如 runAgentLoop 中途因 FALSIFIABILITY_GATE_BLOCK 终止），
 * 对应字段降级为空字符串/空数组——但 finalVerdict 必为 'UNTESTED'（占位·实际裁决
 * 由 falsifiability/verdict.ts renderHonestVerdict 填写·禁 LLM-as-judge）。
 */
export function assemblePaper(state: LoopState): ResearchPaperOutput {
  const u = findUnderstanding(state.artifacts);
  const i = findIntegration(state.artifacts);
  const h = findHypothesis(state.artifacts);
  const e = findEvidence(state.artifacts);
  const p = findPlan(state.artifacts);
  const f = findFeedback(state.artifacts);

  const references = i?.citations ?? [];

  return {
    paperTitle: deriveTitle(u?.problemStatement, h?.claim),
    paperAbstract: composeAbstract(u, h, p),
    problemStatement: u?.problemStatement ?? '',
    rationale: composeRationale(i, h),
    technicalDetails: composeTechnicalDetails(p),
    datasets: {
      source: (i?.citations ?? []).map((c) => c.title),
      target: p?.datasetChoices ?? [],
    },
    methods: composeMethods(p, e),
    experiments: {
      baselines: (e?.evidenceRecords ?? []).map((er) => er.source.title),
      metrics: h ? [h.falsificationMethod.metric] : [],
      expectedOutcome: h?.falsificationMethod.prediction ?? 'no prediction registered',
    },
    results: composeResults(state, h, e),
    references,
    iterationCount: f?.feedbackSignal.iterationNumber ?? state.iterationsCompleted,
    finalVerdict: deriveFinalVerdict(state),
  };
}


// ---------- 内部辅助函数（纯函数·禁 LLM·禁外部 IO） ----------

/**
 * 6 个独立 finder 函数：用 discriminatedUnion kind 字面量 narrow（R10 修复·禁 as 强转）。
 *
 * 若同 kind 出现多次（如多轮迭代），返回最后一次（最新版本）。
 * 6 个独立函数 vs 1 个泛型函数：泛型 `as P` 触发 TS2352（联合→泛型子类型不可静态保证），
 * 6 个独立函数每个 kind 字面量在 if 内部触发 TS discriminatedUnion narrow，零 as。
 */
function findUnderstanding(
  artifacts: readonly StageArtifact[],
): UnderstandingPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'understanding') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findIntegration(
  artifacts: readonly StageArtifact[],
): IntegrationPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'integration') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findHypothesis(
  artifacts: readonly StageArtifact[],
): HypothesisPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'hypothesis') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findEvidence(
  artifacts: readonly StageArtifact[],
): EvidencePayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'evidence') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findPlan(
  artifacts: readonly StageArtifact[],
): PlanPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'plan') {
      return artifact.structured;
    }
  }
  return undefined;
}

function findFeedback(
  artifacts: readonly StageArtifact[],
): FeedbackPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.structured.kind === 'feedback') {
      return artifact.structured;
    }
  }
  return undefined;
}


/**
 * 派生论文标题：以 problemStatement 为主，假设陈述为辅。
 *
 * 确定性规则（禁 LLM·禁评分）：
 *   - 两者皆有：取 problemStatement 前 60 字 + ' — ' + claim 前 40 字
 *   - 仅 problemStatement：取前 100 字
 *   - 仅 claim：取前 100 字
 *   - 都缺：'Untitled Research'
 */
function deriveTitle(
  problemStatement: string | undefined,
  claim: string | undefined,
): string {
  const ps = problemStatement?.trim() ?? '';
  const cl = claim?.trim() ?? '';
  if (ps && cl) {
    return `${ps.slice(0, 60)} — ${cl.slice(0, 40)}`;
  }
  if (ps) {
    return ps.slice(0, 100);
  }
  if (cl) {
    return cl.slice(0, 100);
  }
  return 'Untitled Research';
}


/**
 * 组合论文摘要：problemStatement + claim + scheduleOrFeedback。
 *
 * 确定性规则：以换行分隔的三段式（缺失段省略，不编造）。
 */
function composeAbstract(
  u: UnderstandingPayload | undefined,
  h: HypothesisPayload | undefined,
  p: PlanPayload | undefined,
): string {
  const segments: string[] = [];
  if (u?.problemStatement) {
    segments.push(`Background: ${u.problemStatement}`);
  }
  if (h?.claim) {
    segments.push(`Hypothesis: ${h.claim}`);
  }
  if (p?.scheduleOrFeedback) {
    segments.push(`Plan: ${p.scheduleOrFeedback}`);
  }
  return segments.length > 0 ? segments.join('\n\n') : '';
}


/**
 * 组合理由链：knowledgeGraphSummary + falsificationMethod.prediction。
 */
function composeRationale(
  i: IntegrationPayload | undefined,
  h: HypothesisPayload | undefined,
): string {
  const segments: string[] = [];
  if (i?.knowledgeGraphSummary) {
    segments.push(i.knowledgeGraphSummary);
  }
  if (h?.falsificationMethod.prediction) {
    segments.push(`Falsification: ${h.falsificationMethod.prediction}`);
  }
  return segments.length > 0 ? segments.join('\n\n') : '';
}


/**
 * 组合技术详情：methodChoices + executableChecks 概要。
 */
function composeTechnicalDetails(p: PlanPayload | undefined): string {
  if (!p) {
    return '';
  }
  const segments: string[] = [];
  if (p.methodChoices.length > 0) {
    segments.push(`Methods: ${p.methodChoices.join('; ')}`);
  }
  if (p.executableChecks.length > 0) {
    const existsCount = p.executableChecks.filter((c) => c.exists).length;
    segments.push(`Executable checks: ${existsCount}/${p.executableChecks.length} verified`);
  }
  return segments.join('\n');
}


/**
 * 组合方法步骤：methodChoices + evidenceRecords 标题。
 */
function composeMethods(
  p: PlanPayload | undefined,
  e: EvidencePayload | undefined,
): string[] {
  const methods: string[] = [];
  if (p) {
    methods.push(...p.methodChoices);
  }
  if (e) {
    for (const er of e.evidenceRecords) {
      methods.push(`Evidence: ${er.source.title}`);
    }
  }
  return methods;
}


/**
 * 组合结果文本：verdictNode + conflictingEvidenceCount + terminationReason。
 *
 * finalVerdict 占位逻辑（禁 LLM-as-judge）：
 *   - state.verdictNode 存在 → 用 verdictNode.verdict
 *   - 不存在但 hypothesis 存在 → 'UNTESTED'（裁决由 falsifiability 模块填·此处占位）
 *   - 都缺 → 'UNTESTED'
 */
function composeResults(
  state: LoopState,
  h: HypothesisPayload | undefined,
  e: EvidencePayload | undefined,
): string {
  const segments: string[] = [];
  if (state.verdictNode) {
    segments.push(`Verdict: ${state.verdictNode.verdict}`);
  } else if (h) {
    segments.push('Verdict: UNTESTED (pending falsifiability evaluation)');
  }
  if (e) {
    segments.push(`Conflicting evidence count: ${e.conflictingEvidenceCount}`);
  }
  segments.push(`Termination: ${state.terminationReason}`);
  if (state.error) {
    segments.push(`Error: ${state.error.code} - ${state.error.message}`);
  }
  return segments.join('\n');
}


/**
 * 派生最终裁决（禁 LLM-as-judge）。
 *
 * 优先级：
 *   1. state.verdictNode.verdict（若到达 [4] 裁决阶段）
 *   2. 'UNTESTED'（占位·实际裁决由 falsifiability/verdict.ts 填写）
 */
function deriveFinalVerdict(state: LoopState): Verdict {
  if (state.verdictNode) {
    return state.verdictNode.verdict;
  }
  // hypothesis 存在但未裁决 → UNTESTED
  // hypothesis 不存在 → UNTESTED（无假设可裁决）
  return 'UNTESTED';
}
