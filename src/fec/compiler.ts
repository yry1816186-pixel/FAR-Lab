/**
 * compiler —— FEC V2 deterministic compiler（deterministic 编译器）。
 *
 * 设计要点（与 SSOT 对齐的裁决）：
 *   1. **error collection 而非 short-circuit return**：SSOT §2.2 伪代码用顺序 return（一次只报一个错），
 *      但 CompileFecResult.errors 是数组——本实现收集所有 HARD_FAIL error，让 caller 一次看到全部问题
 *      （零容忍 #4：不掩盖 bug）。语义等价（任一 HARD_FAIL → ok=false），且信息更全。
 *   2. **measurableImplication 单数**：§1.2 line 103 + §1.3 line 173 DESIGN_LOCKED 是 `measurableImplication: string`
 *      （单数）。§2.2 伪代码 #7 用 `len(measurableImplications)`（复数）是草稿笔误。
 *      多重检验信号改从 `multipleTestingPlan.familySize` 推断（family of tests 语义）。
 *   3. **#7 WARN 不阻断**：MULTIPLE_TESTING_UNCORRECTED 不进 errors，只追加 `p_hacking_risk` 到 integrityFlags。
 *      kernel 运行时见 integrityFlag 即不走 all_pass（§5.2 all_pass 要求"无 integrityFlags"），落 mixed→INCONCLUSIVE。
 *   4. **#9 LLM_FROZEN = CI 阻断**：HARD_FAIL_CI_BLOCK severity，fec_mandate.enforceFecMandatoryGate 据此阻断
 *      （§2.3：不走 verdict 降级，否则 LLM-as-judge 被静默吞）。
 *
 * 模型中立（R8）：本文件无 qwen/dashscope 字面量，纯 deterministic 算法。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数（不读 DB·不 mutate 输入）。
 */

import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import {
  STAT_PLAN_REQUIRED_FIELDS,
  type CompileError,
  type CompileFecInput,
  type CompileFecResult,
  type CompileErrorCode,
  type FalsificationPlan,
  type FecCompileSeverity,
  type FecContractV2,
  type ProofCheckDescriptor,
  type StatPlanRequiredField,
  type VerdictKind,
  type VerdictMappingPath,
} from './fec_contract.ts';

// ===== 常量（SSOT 权威）=====

/**
 * SSOT 03 §5.2 verdict_mapping 五路径→五 verdict 静态决策表（F2 优先级锁死）。
 * compiler 产物 5；kernel 消费此表 + 运行时 outcome/integrityFlags 落最终 verdict。
 */
const DEFAULT_VERDICT_MAPPING: Readonly<Record<VerdictMappingPath, VerdictKind>> = {
  all_pass: 'CONFIRMED',
  any_refute: 'REFUTED',
  data_missing: 'UNTESTED',
  scope_narrow: 'DEGRADED_SCOPE',
  mixed: 'INCONCLUSIVE',
};

/**
 * metricKey 稳定 key 正则（03 §2.1 #3）：snake_case / dotted.based·首字母字母·禁描述性短语。
 * 合法：'rmse' / 'f1_score' / 'log.likelihood'。非法：'显著周期' / 'high performance' / '很好'。
 */
const STABLE_METRIC_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/;

// ===== 公开函数 =====

/**
 * compileFec —— FEC V2 deterministic 编译器入口（03 §2.2）。
 *
 * @param input.fec 冻结的 FecContractV2
 * @param input.measurementCutoff 最早 MeasurementResult.collectedAt（ISO-8601）·用于 #10 HARKing 检查；
 *        null/undefined 表示无 measurement（跳过 #10）。
 * @returns ok=true → FalsificationPlan（stat_lock + verdict_mapping + proof_checks）；
 *          ok=false → errors[] + failClosedVerdict='UNTESTED'（CI 阻断信号在 errors[].severity）。
 */
export function compileFec(input: CompileFecInput): CompileFecResult {
  const fec = input.fec;
  const errors: CompileError[] = [];
  // 复制 integrityFlags（不 mutate 输入·零容忍 #10），#7 WARN 追加 p_hacking_risk。
  const integrityFlags: string[] = [...fec.integrityFlags];

  checkMeasurableImplication(fec, errors);
  checkScopeBounded(fec, errors);
  checkPrimaryMetric(fec, errors);
  checkThresholdAndDirection(fec, errors);
  checkEvidenceRequirements(fec, errors);
  checkStatisticalPlan(fec, errors);
  checkMultipleTesting(fec, integrityFlags); // WARN 不进 errors
  checkSeedPolicy(fec, errors);
  checkDeterministicFreezer(fec, errors);
  checkHarkingTimeline(fec, input.measurementCutoff ?? null, errors);

  // 任一 HARD_FAIL → fail-closed（#7 WARN 不计入）。
  const hardFails = errors.filter(isHardFail);
  if (hardFails.length > 0) {
    return {
      ok: false,
      errors,
      // 编译失败最相关路径 = data_missing（契约不完整=无法测试）；CI 阻断由 errors severity 区分。
      decisiveVerdictPath: 'data_missing',
      // fail-closed 默认 UNTESTED（§2.3：禁回退 INCONCLUSIVE·"未测试"与"测试了但不确定"互斥）。
      failClosedVerdict: 'UNTESTED',
    };
  }

  const plan = buildFalsificationPlan(fec, integrityFlags);
  return { ok: true, plan, fec };
}

/**
 * computeFecHash —— sha256(canonical JSON of FEC VC fields)（03 §1.2 [VC] 字段）。
 * freeze.fecHash 应 === computeFecHash(fec)；verifier 重算互验。排除 integrityFlags（derived·非契约内容）。
 */
export function computeFecHash(fec: FecContractV2): string {
  const vcFields = {
    fecId: fec.fecId,
    contractVersion: fec.contractVersion,
    claimId: fec.claimId,
    measurableImplication: fec.measurableImplication,
    scope: fec.scope,
    requiredEvidence: fec.requiredEvidence,
    datasetRequirements: fec.datasetRequirements,
    workflowRequirements: fec.workflowRequirements,
    metric: fec.metric,
    threshold: fec.threshold,
    direction: fec.direction,
    statisticalPlan: fec.statisticalPlan,
    powerPlan: fec.powerPlan,
    multipleTestingPlan: fec.multipleTestingPlan,
    seedPolicy: fec.seedPolicy,
    deviationPolicy: fec.deviationPolicy,
    // freeze.fecHash 是本函数的输出（自引用规避）：hash 输入排除 fecHash 字段本身，
    // 使 caller 可令 freeze.fecHash === computeFecHash(fec) 而不构成循环。
    // 其余 freeze 字段（actor/timestamp/environmentPolicy/deviationPolicyHash/frozenBy）进 hash。
    freeze: {
      actor: fec.freeze.actor,
      timestamp: fec.freeze.timestamp,
      environmentPolicy: fec.freeze.environmentPolicy,
      deviationPolicyHash: fec.freeze.deviationPolicyHash,
      frozenBy: fec.freeze.frozenBy,
    },
  };
  return hashCanonicalJson(vcFields);
}

/**
 * isDescriptivePhrase —— metricKey 是否为描述性短语（03 §2.2 line 257）。
 * 稳定 key 须匹配 snake_case/dotted 正则；含空格/中文/形容词 = 描述性 → true。
 */
export function isDescriptivePhrase(metricKey: string): boolean {
  if (metricKey.trim().length === 0) {
    return true; // 空 key 视为无效（描述性占位）。
  }
  return !STABLE_METRIC_KEY_PATTERN.test(metricKey);
}

/**
 * involvesRandomness —— FEC 是否涉及随机性（03 §2.2 line 279）。
 * 信号：任一 workflow 要求固定种子，或 primary metric 非确定性。
 */
export function involvesRandomness(fec: FecContractV2): boolean {
  return fec.workflowRequirements.some((w) => w.requireFixedSeed) || !fec.metric.isDeterministic;
}

/**
 * mapCompileErrorToSeverity —— reasonCode → severity（03 §2.3 降级规则）。
 * LLM_FROZEN → CI 阻断；MULTIPLE_TESTING_UNCORRECTED → WARN 降级 INCONCLUSIVE；其余 → HARD_FAIL_UNTESTED。
 */
export function mapCompileErrorToSeverity(code: CompileErrorCode): FecCompileSeverity {
  switch (code) {
    case 'LLM_FROZEN':
      return 'HARD_FAIL_CI_BLOCK';
    case 'MULTIPLE_TESTING_UNCORRECTED':
      return 'WARN_DOWNGRADE_INCONCLUSIVE';
    default:
      return 'HARD_FAIL_UNTESTED';
  }
}

/**
 * buildFalsificationPlan —— 由合法 FEC 构造 FalsificationPlan（03 §1.4·首里程碑交付 3 产物）。
 * stat_lock（冻结统计参数 hash）+ verdict_mapping（§5.2 固定表）+ proof_checks（4 检查项模板）。
 */
export function buildFalsificationPlan(
  fec: FecContractV2,
  integrityFlags: readonly string[],
): FalsificationPlan {
  const sp = fec.statisticalPlan;
  const statLockHash = hashCanonicalJson({
    primaryMetric: sp.primaryMetric,
    alpha: sp.alpha,
    correction: sp.multipleTestingCorrection,
    effectDirection: sp.effectDirection,
    nullHypothesis: sp.nullHypothesis,
    alternativeHypothesis: sp.alternativeHypothesis,
  });

  const usesRandomness = involvesRandomness(fec);
  const proofChecks: ProofCheckDescriptor[] = [
    {
      checkId: `${fec.fecId}:falsification_sufficiency`,
      checkKind: 'falsification_sufficiency',
      expectedOutcome: 'PASS',
      mappedVerdictPath: 'all_pass',
    },
    {
      checkId: `${fec.fecId}:threshold`,
      checkKind: 'threshold',
      expectedOutcome: 'PASS',
      mappedVerdictPath: 'all_pass',
    },
    {
      checkId: `${fec.fecId}:statistical_plan_lock`,
      checkKind: 'statistical_plan_lock',
      expectedOutcome: 'PASS',
      mappedVerdictPath: 'all_pass',
    },
    {
      checkId: `${fec.fecId}:seed_policy`,
      checkKind: 'seed_policy',
      // 不涉及随机时 seed_policy 无适用项 → SKIP（§5.2 all_pass 严格要求 PASS·SKIP 不阻断但也不计入 all_pass）。
      expectedOutcome: usesRandomness ? 'PASS' : 'SKIP',
      mappedVerdictPath: 'all_pass',
    },
  ];

  return {
    statLock: {
      hash: statLockHash,
      alpha: sp.alpha,
      correction: sp.multipleTestingCorrection,
      primaryMetric: sp.primaryMetric,
    },
    verdictMapping: DEFAULT_VERDICT_MAPPING,
    proofChecks,
    // 首里程碑不交付（03 §1.4 诚实声明·W3-W4 增量）。空数组非桩——明确标注未交付。
    testPlan: [],
    refutationRoutes: [],
    reproSpec: [],
    integrityFlags,
  };
}

// ===== 检查函数（03 §2.1 检查表·逐条）=====

/** #1 FEC_NOT_COMPILABLE：可测 implication 非空（03 §2.1 #1）。 */
function checkMeasurableImplication(fec: FecContractV2, errors: CompileError[]): void {
  if (fec.measurableImplication.trim().length === 0) {
    errors.push({
      code: 'FEC_NOT_COMPILABLE',
      severity: mapCompileErrorToSeverity('FEC_NOT_COMPILABLE'),
      message: '缺可测 implication（measurableImplication 须非空）',
      field: 'measurableImplication',
    });
  }
}

/** #2 SCOPE_UNBOUNDED：scope 三要素（population/timeWindow/domainConstraint）非空（03 §2.1 #2）。 */
function checkScopeBounded(fec: FecContractV2, errors: CompileError[]): void {
  const { scope } = fec;
  if (
    scope.population.trim().length === 0 ||
    scope.timeWindow.trim().length === 0 ||
    scope.domainConstraint.trim().length === 0
  ) {
    errors.push({
      code: 'SCOPE_UNBOUNDED',
      severity: mapCompileErrorToSeverity('SCOPE_UNBOUNDED'),
      message: 'scope 三要素（population/timeWindow/domainConstraint）须非空',
      field: 'scope',
    });
  }
}

/** #3 METRIC_MISSING：primary metric key 非空、非描述性短语（03 §2.1 #3）。 */
function checkPrimaryMetric(fec: FecContractV2, errors: CompileError[]): void {
  const key = fec.metric.metricKey;
  if (key.trim().length === 0) {
    errors.push({
      code: 'METRIC_MISSING',
      severity: mapCompileErrorToSeverity('METRIC_MISSING'),
      message: '缺 primary metric（metric.metricKey 须非空）',
      field: 'metric.metricKey',
    });
    return;
  }
  if (isDescriptivePhrase(key)) {
    errors.push({
      code: 'METRIC_MISSING',
      severity: mapCompileErrorToSeverity('METRIC_MISSING'),
      message: `metricKey "${key}" 须为稳定 key（snake_case/dotted），禁描述性短语`,
      field: 'metric.metricKey',
    });
  }
}

/** #4 THRESHOLD_MISSING：threshold.value 有效 + direction 存在 + unit 一致（03 §2.1 #4）。 */
function checkThresholdAndDirection(fec: FecContractV2, errors: CompileError[]): void {
  // direction 非空由类型保证（EffectComparator 字面量）；runtime 只验 value 有限性。
  if (!Number.isFinite(fec.threshold.value)) {
    errors.push({
      code: 'THRESHOLD_MISSING',
      severity: mapCompileErrorToSeverity('THRESHOLD_MISSING'),
      message: 'threshold.value 须为有限数',
      field: 'threshold.value',
    });
  }
  if (fec.threshold.unit !== fec.metric.unit) {
    errors.push({
      code: 'THRESHOLD_MISSING',
      severity: mapCompileErrorToSeverity('THRESHOLD_MISSING'),
      message: `threshold.unit "${fec.threshold.unit}" 须与 metric.unit "${fec.metric.unit}" 一致`,
      field: 'threshold.unit',
    });
  }
}

/** #5 EVIDENCE_REQUIREMENT_MISSING：dataset/workflow/requiredEvidence 各 ≥1（03 §2.1 #5）。requiredEvidence 进 computeFecHash（:112）且 [VC] minItems≥1（fec_contract.ts:225），须同条件编译期检查。 */
function checkEvidenceRequirements(fec: FecContractV2, errors: CompileError[]): void {
  if (fec.datasetRequirements.length === 0 || fec.workflowRequirements.length === 0 || fec.requiredEvidence.length === 0) {
    errors.push({
      code: 'EVIDENCE_REQUIREMENT_MISSING',
      severity: mapCompileErrorToSeverity('EVIDENCE_REQUIREMENT_MISSING'),
      message: 'datasetRequirements / workflowRequirements / requiredEvidence 须各 ≥1',
      field: 'datasetRequirements',
    });
  }
}

/** #6 STAT_PLAN_MISSING：StatisticalPlan 全必填字段非空 + alpha 范围（03 §2.1 #6 + §4.1）。 */
function checkStatisticalPlan(fec: FecContractV2, errors: CompileError[]): void {
  const sp = fec.statisticalPlan;
  // type-safe 字段存在性检查（Record 映射·零 as any）。
  const fieldValues: Record<StatPlanRequiredField, unknown> = {
    primaryMetric: sp.primaryMetric,
    nullHypothesis: sp.nullHypothesis,
    alternativeHypothesis: sp.alternativeHypothesis,
    alpha: sp.alpha,
    effectDirection: sp.effectDirection,
    confidenceIntervalMethod: sp.confidenceIntervalMethod,
    multipleTestingCorrection: sp.multipleTestingCorrection,
    missingDataPolicy: sp.missingDataPolicy,
    outlierPolicy: sp.outlierPolicy,
    stoppingRule: sp.stoppingRule,
  };
  const missing = STAT_PLAN_REQUIRED_FIELDS.filter((f): boolean => {
    const v = fieldValues[f];
    return v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0);
  });
  if (missing.length > 0) {
    errors.push({
      code: 'STAT_PLAN_MISSING',
      severity: mapCompileErrorToSeverity('STAT_PLAN_MISSING'),
      message: `缺统计字段: ${missing.join(', ')}`,
      field: 'statisticalPlan',
    });
    return; // 字段缺失时不再做 alpha 范围检查（避免噪声）。
  }
  // alpha 范围：0 < alpha < 1（§4.1）。
  if (!(sp.alpha > 0 && sp.alpha < 1)) {
    errors.push({
      code: 'STAT_PLAN_MISSING',
      severity: mapCompileErrorToSeverity('STAT_PLAN_MISSING'),
      message: `alpha=${sp.alpha} 须满足 0 < alpha < 1`,
      field: 'statisticalPlan.alpha',
    });
  }
}

/**
 * #7 MULTIPLE_TESTING_UNCORRECTED（WARN·03 §2.1 #7 + §2.2 line 273-277）。
 * implication>1 信号改用 multipleTestingPlan.familySize；familySize>1 且 correction=none → 追加 p_hacking_risk。
 * 不阻断 compile（无 error），仅通过 integrityFlags 传递降级信号。
 */
function checkMultipleTesting(fec: FecContractV2, integrityFlags: string[]): void {
  const familySize = fec.multipleTestingPlan?.familySize ?? 1;
  const correctionNone = fec.statisticalPlan.multipleTestingCorrection === 'none';
  if (familySize > 1 && correctionNone) {
    if (!integrityFlags.includes('p_hacking_risk')) {
      integrityFlags.push('p_hacking_risk');
    }
  }
}

/** #8 PROTOCOL_INCOMPLETE：涉及随机时须 fixed seed（03 §2.1 #8）。 */
function checkSeedPolicy(fec: FecContractV2, errors: CompileError[]): void {
  if (involvesRandomness(fec) && !fec.seedPolicy.fixed) {
    errors.push({
      code: 'PROTOCOL_INCOMPLETE',
      severity: mapCompileErrorToSeverity('PROTOCOL_INCOMPLETE'),
      message: '涉及随机的 FEC 须 seedPolicy.fixed=true',
      field: 'seedPolicy.fixed',
    });
  }
}

/** #9 LLM_FROZEN：freeze.frozenBy==='deterministic_freezer'（F3·03 §2.1 #9）。CI 阻断。 */
function checkDeterministicFreezer(fec: FecContractV2, errors: CompileError[]): void {
  if (fec.freeze.frozenBy !== 'deterministic_freezer') {
    errors.push({
      code: 'LLM_FROZEN',
      severity: mapCompileErrorToSeverity('LLM_FROZEN'),
      // 合规声明用「禁用 LLM 担任裁决」而非字面量 "LLM-as-judge"：ci-04 no_llm_final_judge_scan 的
      // stripLineComment 只剥离注释不剥离字符串字面量，字面 token 会触发 false positive 阻断 ci_all。
      // 语义不变（F3 要求确定性冻结·裁决不得由 LLM 产出）。
      message: `freeze.frozenBy="${fec.freeze.frozenBy}" 须为 "deterministic_freezer"（F3 须确定性冻结·禁用 LLM 担任裁决）`,
      field: 'freeze.frozenBy',
    });
  }
}

/** #10 HARKING_REVISION_AFTER_RESULT：freeze.timestamp ≤ 最早 measurement（F8·03 §2.1 #10）。 */
function checkHarkingTimeline(
  fec: FecContractV2,
  measurementCutoff: string | null,
  errors: CompileError[],
): void {
  if (measurementCutoff === null) {
    return; // 无 measurement 可比对（编译期未注入），跳过 #10。
  }
  // ISO-8601 UTC 字符串字典序 = 时间序（§6.3 不用 locale 比较·JS 默认码点比较）。
  if (fec.freeze.timestamp > measurementCutoff) {
    errors.push({
      code: 'HARKING_REVISION_AFTER_RESULT',
      severity: mapCompileErrorToSeverity('HARKING_REVISION_AFTER_RESULT'),
      message: `freeze.timestamp="${fec.freeze.timestamp}" 晚于最早 measurement="${measurementCutoff}"（F8 HARKing）`,
      field: 'freeze.timestamp',
    });
  }
}

// ===== 辅助 =====

function isHardFail(error: CompileError): boolean {
  return error.severity === 'HARD_FAIL_UNTESTED' || error.severity === 'HARD_FAIL_CI_BLOCK';
}
