// src/evaluation/eval_family.ts
// 职责：EVAL 族五项（MATRIX/FAILURE/CALIBRATION/LEAKAGE/ROBUST）的机器层。
//
// 存量衔接：校准核心已存在（src/research/evaluation/calibration.ts——ECE/可靠性图/
// 降级阈值/样本守卫，验收测试在 tests/research/evaluation_calibration.test.ts）；
// FCS 冻结比较集与 claim-lint 已接 CI。本模块补齐宪法验收面剩余的机器件：
//   MATRIX  14 轴评估矩阵 schema + 覆盖/缺格报告 + 聚合掩盖检查
//   FAILURE 14 类失败分类学 + 分布/回归榜/代表性例报告
//   CALIB  Brier + 分组校准 + 未校准分数展示门（桥梁：与既有 ECE 层互补）
//   LEAK   近重复 shingle 检测 + 污染扫描 + 元数据剥离 + 记忆度分层
//   ROBUST 14 场景鲁棒性清单（映射既有测试面 + 如实缺口）
//
// Cannot-prove：各报告由「供给的数据」计算——数据真实性由供给方（benchmark 种子/
// 评估运行产物）负责；清单证明映射与覆盖计算正确，不证明未映射场景不存在。

// ═══════════════════════════════════════════════════════════════════════════
// EVAL-MATRIX-001：14 轴评估矩阵
// ═══════════════════════════════════════════════════════════════════════════

export const EVAL_MATRIX_AXES = [
  'task-domain',
  'input-difficulty',
  'evidence-availability',
  'novelty-familiarity',
  'temporal-cutoff',
  'language',
  'adversarial-condition',
  'execution-mode',
  'model-tool-config',
  'quality-metric',
  'uncertainty',
  'cost-latency',
  'failure-type',
  'reproducibility-status',
] as const;
export type EvalMatrixAxis = (typeof EVAL_MATRIX_AXES)[number];

/** 单元格：轴取值 + 该取值下的 T0 失败计数与样本量（聚合掩盖检查的输入）。 */
export interface MatrixCell {
  readonly axis: EvalMatrixAxis;
  readonly value: string;
  readonly sampleSize: number;
  readonly t0Failures: number;
}

export interface MatrixCoverageReport {
  readonly coveredAxes: readonly EvalMatrixAxis[];
  readonly missingAxes: readonly EvalMatrixAxis[];
  /** 有格但 sampleSize=0 的轴值（声明了覆盖但无实测=空覆盖，必须显式）。 */
  readonly emptyCells: readonly { axis: EvalMatrixAxis; value: string }[];
  /** 聚合掩盖：任一格 t0Failures>0 而总体聚合声明「通过/领先」→ 违规。 */
  readonly maskingViolations: readonly string[];
  readonly ok: boolean;
}

export function matrixCoverageReport(
  cells: readonly MatrixCell[],
  aggregateClaim: 'lead' | 'pass' | 'none' = 'none',
): MatrixCoverageReport {
  const covered = new Set(cells.filter((c) => c.sampleSize > 0).map((c) => c.axis));
  const missing = EVAL_MATRIX_AXES.filter((a) => !covered.has(a));
  const empty = cells.filter((c) => c.sampleSize === 0).map((c) => ({ axis: c.axis, value: c.value }));
  const masking: string[] = [];
  if (aggregateClaim === 'lead' || aggregateClaim === 'pass') {
    for (const c of cells) {
      if (c.t0Failures > 0) {
        masking.push(`aggregate '${aggregateClaim}' masks ${c.t0Failures} T0 failure(s) at ${c.axis}=${c.value}`);
      }
    }
  }
  return {
    coveredAxes: [...covered],
    missingAxes: missing,
    emptyCells: empty,
    maskingViolations: masking,
    ok: missing.length === 0 && empty.length === 0 && masking.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAL-FAILURE-001：14 类失败分类学
// ═══════════════════════════════════════════════════════════════════════════

export const FAILURE_MODES = [
  'retrieval-miss',
  'unsupported-claim',
  'false-support',
  'untestable-conjecture',
  'duplicate-paraphrase',
  'judge-bias',
  'schema-violation',
  'truncation',
  'tool-failure',
  'budget-exhaustion',
  'unsafe-output',
  'kernel-rejection',
  'reproducibility-failure',
  'human-disagreement',
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export interface FailureRecord {
  readonly mode: FailureMode;
  readonly runId: string;
  readonly detail: string;
  /** 相对上一评估的回归量（>0 = 新增回归）。 */
  readonly regressionDelta?: number;
}

export interface FailureDistributionReport {
  readonly distribution: Readonly<Record<FailureMode, number>>;
  readonly topRegressions: readonly { mode: FailureMode; delta: number }[];
  readonly representativeExamples: readonly { mode: FailureMode; runId: string; detail: string }[];
  readonly totalFailures: number;
}

/** 失败分布 + 回归榜（delta 降序前 3）+ 代表例（每类至多 1 例）。 */
export function failureDistribution(failures: readonly FailureRecord[]): FailureDistributionReport {
  const distribution = Object.fromEntries(FAILURE_MODES.map((m) => [m, 0])) as Record<FailureMode, number>;
  const regressions = new Map<FailureMode, number>();
  const examples: { mode: FailureMode; runId: string; detail: string }[] = [];
  for (const f of failures) {
    distribution[f.mode] += 1;
    if ((f.regressionDelta ?? 0) > 0) {
      regressions.set(f.mode, (regressions.get(f.mode) ?? 0) + (f.regressionDelta ?? 0));
    }
    if (!examples.some((e) => e.mode === f.mode)) {
      examples.push({ mode: f.mode, runId: f.runId, detail: f.detail });
    }
  }
  const topRegressions = [...regressions.entries()]
    .map(([mode, delta]) => ({ mode, delta }))
    .sort((a, b) => b.delta - a.delta || (a.mode < b.mode ? -1 : 1))
    .slice(0, 3);
  return {
    distribution,
    topRegressions,
    representativeExamples: examples,
    totalFailures: failures.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAL-CALIBRATION-001：Brier + 分组校准 + 未校准展示门
// （ECE/可靠性图/降级阈值在 src/research/evaluation/calibration.ts——互补不重复）
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfidenceHitPair {
  readonly confidence: number;
  readonly hit: boolean;
  readonly group?: string;
}

/** Brier 分数（[0,1]，越低越好；0=完美）。 */
export function brierScore(pairs: readonly ConfidenceHitPair[]): number {
  if (pairs.length === 0) throw new Error('brierScore: empty pairs');
  let sum = 0;
  for (const p of pairs) {
    sum += (p.confidence - (p.hit ? 1 : 0)) ** 2;
  }
  return sum / pairs.length;
}

export interface GroupCalibration {
  readonly group: string;
  readonly count: number;
  readonly meanConfidence: number;
  readonly observedRate: number;
}

/** 分组校准（每组均值置信度 vs 实测命中率——分布外/子群漂移可见）。 */
export function groupedCalibration(pairs: readonly ConfidenceHitPair[]): readonly GroupCalibration[] {
  const byGroup = new Map<string, ConfidenceHitPair[]>();
  for (const p of pairs) {
    const key = p.group ?? '(default)';
    const list = byGroup.get(key) ?? [];
    list.push(p);
    byGroup.set(key, list);
  }
  return [...byGroup.entries()]
    .map(([group, list]) => ({
      group,
      count: list.length,
      meanConfidence: list.reduce((s, p) => s + p.confidence, 0) / list.length,
      observedRate: list.filter((p) => p.hit).length / list.length,
    }))
    .sort((a, b) => (a.group < b.group ? -1 : 1));
}

/**
 * 未校准展示门：分数被标注为 'probability' 时必须携带校准证据引用；
 * 否则必须用 'ordinal' 标注（宪法：未校准分数不得展示成概率）。
 */
export type ScorePresentation = 'probability' | 'ordinal';

export function presentationGate(
  score: { readonly label: ScorePresentation; readonly calibrationEvidenceRef: string | null },
): { ok: boolean; problem: string | null } {
  if (score.label === 'probability' && (score.calibrationEvidenceRef ?? '').trim().length === 0) {
    return {
      ok: false,
      problem: 'score presented as probability without calibration evidence ref — relabel as ordinal or attach calibration report',
    };
  }
  return { ok: true, problem: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAL-LEAKAGE-001：近重复/污染扫描/元数据剥离/记忆度分层
// ═══════════════════════════════════════════════════════════════════════════

/** 字符 3-gram shingle 集合。 */
function shingles(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i += 1) out.add(norm.slice(i, i + 3));
  return out;
}

/** Jaccard 相似度（近重复判定基础；确定性）。 */
export function shingleJaccard(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

export const NEAR_DUPLICATE_THRESHOLD = 0.8;

/** 近重复对检测（benchmark 题/证据条目去重面）。 */
export function nearDuplicatePairs(
  items: readonly { id: string; text: string }[],
  threshold: number = NEAR_DUPLICATE_THRESHOLD,
): readonly { a: string; b: string; similarity: number }[] {
  const pairs: { a: string; b: string; similarity: number }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const x = items[i] as { id: string; text: string };
      const y = items[j] as { id: string; text: string };
      const sim = shingleJaccard(x.text, y.text);
      if (sim >= threshold) pairs.push({ a: x.id, b: y.id, similarity: sim });
    }
  }
  return pairs.sort((p, q) => q.similarity - p.similarity);
}

export interface ContaminationHit {
  readonly docId: string;
  readonly knownAnswerId: string;
  readonly matchedText: string;
}

/** 污染扫描：已知答案串（或其 ≥0.9 相似片段）出现在语料文档中 → 命中。 */
export function contaminationScan(
  corpus: readonly { docId: string; text: string }[],
  knownAnswers: readonly { id: string; answer: string }[],
): readonly ContaminationHit[] {
  const hits: ContaminationHit[] = [];
  for (const doc of corpus) {
    for (const ka of knownAnswers) {
      if (doc.text.includes(ka.answer) || shingleJaccard(doc.text, ka.answer) >= 0.9) {
        hits.push({ docId: doc.docId, knownAnswerId: ka.id, matchedText: ka.answer.slice(0, 60) });
      }
    }
  }
  return hits;
}

/** 元数据剥离：答题线索字段（文件名/来源 URL/时间戳模式）从条目剥离后的净文本。 */
export function stripAnswerCueMetadata(item: {
  text: string;
  metadata?: Readonly<Record<string, string>>;
}): { text: string; strippedFields: string[] } {
  const cueKeys = /^(filename|filepath|source_?url|retrieved_?at|dataset_?name|answer_?hint)/i;
  const stripped: string[] = [];
  const meta: Record<string, string> = { ...(item.metadata ?? {}) };
  for (const k of Object.keys(meta)) {
    if (cueKeys.test(k)) {
      stripped.push(k);
      delete meta[k];
    }
  }
  // 正文中的文件路径样式线索也剥离（保守正则，宁多勿漏）
  const text = item.text.replace(/[A-Za-z]:\\[^\s]+|\/(?:home|Users)\/[^\s]+/g, '[stripped-path]');
  return { text, strippedFields: stripped };
}

/** 记忆度分层：低记忆度目标的发现力证据优先（宪法原文约束的机器面）。 */
export function memorabilityStratification(
  targets: readonly { id: string; memorability: 'low' | 'high' }[],
): { low: string[]; high: string[]; evidencePreferenceSatisfied: boolean } {
  const low = targets.filter((t) => t.memorability === 'low').map((t) => t.id);
  const high = targets.filter((t) => t.memorability === 'high').map((t) => t.id);
  return {
    low,
    high,
    // 主要发现力证据须含低记忆度目标：至少 1 个 low 在册才满足
    evidencePreferenceSatisfied: low.length > 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAL-ROBUST-001：14 场景清单（映射既有测试面 + 如实缺口）
// ═══════════════════════════════════════════════════════════════════════════

export const ROBUSTNESS_SCENARIOS = [
  'no-bad-expired-key',
  'offline-weak-network-rate-limit',
  'non-english',
  'contradictory-retracted-literature',
  'malformed-structured-output',
  'long-short-ambiguous-questions',
  'prompt-injection-corpus-poisoning',
  'nan-inf-unit-mismatch',
  'crash-resume',
  'mobile-accessibility',
  'low-resource-device',
  'provider-model-retirement',
  'benchmark-contamination',
  'retrieval-miss',
] as const;
export type RobustnessScenario = (typeof ROBUSTNESS_SCENARIOS)[number];

export interface RobustnessInventoryEntry {
  readonly scenario: RobustnessScenario;
  readonly coveredBy: string | null;
  readonly note: string;
}

/** 场景→既有测试面映射（null = 未覆盖缺口，如实标注）。 */
export const ROBUSTNESS_INVENTORY: readonly RobustnessInventoryEntry[] = [
  { scenario: 'no-bad-expired-key', coveredBy: 'tests/cli/cli_error_paths.test.ts（凭据门 fail-closed）+ R9 铁律批', note: '缺 key → exit 2/503 fail-closed 在测' },
  { scenario: 'offline-weak-network-rate-limit', coveredBy: 'tests/llm_gateway/rate_limiter.test.ts + offline_replay 测试 + 429 退避', note: '限流诚实停机在测' },
  { scenario: 'non-english', coveredBy: 'tests/validation（多语问句面）', note: '中文为主仓语言——双语面部分在测，其他语种 partial' },
  { scenario: 'contradictory-retracted-literature', coveredBy: 'tests/evidence_quality（撤稿支持拒）+ conflict_analysis 测试', note: '撤稿/矛盾检测在测' },
  { scenario: 'malformed-structured-output', coveredBy: 'tests/llm_gateway（schema violation 分类）+ not valid JSON 分类', note: '结构化输出校验在测' },
  { scenario: 'long-short-ambiguous-questions', coveredBy: 'tests/research（researchability gate 问句长度面）', note: '问句长/短边界部分在测' },
  { scenario: 'prompt-injection-corpus-poisoning', coveredBy: 'tests/llm_gateway/sanitizer 测试 + R1 门 + 快照五层完整性', note: '注入检测/语料防篡改在测' },
  { scenario: 'nan-inf-unit-mismatch', coveredBy: 'tests/math（NaN/Inf fail-closed）+ 单位冲突检测批 63', note: '数值健全在测' },
  { scenario: 'crash-resume', coveredBy: 'tests/agent_loop/recovery_chaos.test.ts（K1 真实 SIGKILL）+ checkpoint_recovery', note: '崩溃恢复在测（本仓最强面之一）' },
  { scenario: 'mobile-accessibility', coveredBy: null, note: '前端视口测试在 frontend 矩阵；移动/无障碍专用场景未覆盖——如实缺口（UI 层职责）' },
  { scenario: 'low-resource-device', coveredBy: null, note: '低资源设备场景未覆盖——如实缺口（需硬件面）' },
  { scenario: 'provider-model-retirement', coveredBy: 'tests/campaign/guard_registry.test.ts（RetirementCheck 批 21）', note: '退役检测在测' },
  { scenario: 'benchmark-contamination', coveredBy: '本模块 contaminationScan + 快照完整性', note: '污染扫描机器面本批补齐' },
  { scenario: 'retrieval-miss', coveredBy: 'tests/retrieval（grounded 模式 fail-closed）', note: '检索失败拒绝运行在测' },
];

export function robustnessCoverage(): { covered: number; gaps: RobustnessScenario[]; total: number } {
  const gaps = ROBUSTNESS_INVENTORY.filter((e) => e.coveredBy === null).map((e) => e.scenario);
  return { covered: ROBUSTNESS_SCENARIOS.length - gaps.length, gaps, total: ROBUSTNESS_SCENARIOS.length };
}
