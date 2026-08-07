/**
 * anti_theater detector · AT-EFFECT-P-MISMATCH —— 统计报告内部逻辑一致性检测器。
 *
 * 攻击语义：研究者提交的统计报告中，effectSize / p / confidenceInterval / effectDirection
 *   四者必须满足标准 frequentist 数学恒等关系与符号一致性。若四者中出现数学不可能的组合
 *   （如 CI 排除 null 但 p ≥ alpha；或声称 greater 方向但 effectSize 为负），表明统计报告
 *   是手工拼凑或选择性伪造，而非真实统计计算的产物。本 detector 确定性检测三类违规：
 *     1. CI_P_INCONSISTENT —— CI 排除 null（0）与 p < alpha 矛盾（双侧 Wald 数学恒等关系）。
 *     2. DIRECTION_EFFECT_SIGN_MISMATCH —— effectDirection 与 primaryEffectSize 符号矛盾。
 *     3. DIRECTION_CI_MISMATCH —— effectDirection 与 primaryConfidenceInterval 整体符号矛盾。
 *
 * 设计约束（安全关键·零误报）：
 *   - 纯函数·确定性·不 mutate input·不读 FS/网络（F3 反 LLM-as-judge）。
 *   - 三层检测均基于**纯逻辑一致性**，不依赖 primaryEffectSize 的具体度量语义
 *     （Cohen's d / AUC / R² / 原始 mean difference 均可检测，因检测的是符号与数学关系，
 *     不是度量数值）。
 *   - CI-p 数学恒等只在 effectDirection='two_sided' 下严格成立（单侧 CI-p 关系复杂，跳过
 *     避免误报；单侧由方向-CI 检测覆盖）。
 *   - CI-p 检测假设 primaryConfidenceInterval 是 (1-alpha) 双侧置信区间（标准统计报告
 *     惯例·与 FEC statisticalPlan.alpha 对齐）。非标准 CI confidence level（如固定 95%
 *     而 alpha=0.0125）可能产生边界噪声，但 order-of-magnitude 矛盾仍被捕获。
 *
 * 诚实边界（cannotProveStatement·trust kernel §7 要求）：
 *   本 detector 检测四者间的**纯逻辑一致性**（数学恒等 + 符号一致），不重算精确 p 值。
 *   精确 t/z 分布重算需要 input 暴露 testStatistic / sampleSize / testType 字段（当前
 *   StatisticalReport 只暴露聚合后的 primaryEffectSize / primaryAdjustedPValue /
 *   primaryConfidenceInterval，缺明细）。V2 计划：扩展 StatisticalResult 加 testStatistic /
 *   sampleSize / testType 后，本 detector 可加精确重算分支，用 studentTTwoSidedP 验证
 *   reported testStatistic → p 的精确对应。当前不做（避免基于不可验证的 effectSize 度量
 *   语义假设而误报）。
 *
 * 适配裁决（任务书·ADDITIVE ONLY）：
 *   - outcome='FAIL'（统计报告内部矛盾 = 数据不可信·与 AT-LABEL-ONLY 同语义家族）。
 *   - forcedVerdict='UNTESTED'（constraint.ts SEVERITY_TO_FORCED 映射）。
 *   - blockSeal=false（非 BLOCK 类·不拒绝 seal，但降级 verdict）。
 *
 * 模型中立（无 qwen/dashscope/openai）。零容忍合规：无 any / @ts-ignore / 双重断言 /
 *   空 catch / 桩。全 readonly。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** 消费字段路径（影响 proofHash 输入·APPENDIX_E §7.2 标注）。 */
const AFFECTED_PROOF_HASH_INPUTS: readonly string[] = [
  'verdict.statisticalReport.primaryAdjustedPValue',
  'verdict.statisticalReport.primaryEffectSize',
  'verdict.statisticalReport.primaryConfidenceInterval',
  'fec.statisticalPlan.alpha',
  'fec.statisticalPlan.effectDirection',
];

/** 浮点比较容差（避免 IEEE 754 噪音·p 与 alpha 在阈值边缘的微小差异不计）。 */
const P_ALPHA_TOLERANCE = 1e-9;

/**
 * detect_effect_p_consistency —— 检测统计报告内部 effectSize / p / CI / direction 四者
 * 的逻辑一致性。
 *
 * @param input AntiTheaterLintInput（消费 verdict.statisticalReport + fec.statisticalPlan）。
 * @returns 0-3 个 DetectorFinding（每层触发独立 finding·用 findingIdSuffix 区分）。
 *          所有 finding 的 outcome 恒为 'FAIL'（无 PASS/WARN 分支·blockSeal=false）。
 */
export function detect_effect_p_consistency(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  const stat = input.verdict.statisticalReport;
  const alpha: number = input.fec.statisticalPlan.alpha;
  const direction: 'greater' | 'less' | 'two_sided' = input.fec.statisticalPlan.effectDirection;

  const p: number | null = stat.primaryAdjustedPValue;
  const effectSize: number | null = stat.primaryEffectSize;
  const ci: readonly [number, number] | null = stat.primaryConfidenceInterval;
  // effectiveDirection 是观测方向（supports/refutes/neutral/not_applicable/unknown），
  // 与 effectDirection（FEC 假设方向 greater/less/two_sided）不同。layer 2/3 用它守卫：
  // 只在观测声称 supports 时检查符号矛盾（refutes 是合法的反驳结果，方向相反是预期）。
  const effectiveDirection = stat.effectiveDirection;

  // ── 层 1：CI-p 数学恒等矛盾（双侧 only·CI 排除 null ⟺ p < alpha）──
  // 双侧标准 Wald 检验下，(1-alpha) CI 排除 null 当且仅当双侧 p < alpha。这是 frequentist
  // 数学恒等关系，违反即表明 CI 或 p 至少有一个是伪造的。单侧检验下关系复杂，跳过（由层 3 覆盖）。
  if (direction === 'two_sided' && ci !== null && p !== null) {
    const ciExcludesNull = ci[0] > 0 || ci[1] < 0;
    const pIsSignificant = p < alpha - P_ALPHA_TOLERANCE;
    // XOR：两者矛盾（一个 true 一个 false）即数学不可能。
    if (ciExcludesNull !== pIsSignificant) {
      findings.push(
        makeFinding({
          attackId: 'AT-EFFECT-P-MISMATCH',
          outcome: 'FAIL',
          reasonCode: 'CI_P_INCONSISTENT',
          evidenceRef: 'verdict.statisticalReport.primaryConfidenceInterval',
          message:
            `Statistical report is internally inconsistent: CI=[${ci[0]}, ${ci[1]}] ` +
            `${ciExcludesNull ? 'excludes' : 'includes'} null (0) but p=${p} ` +
            `${pIsSignificant ? '<' : '>='} alpha=${alpha}. Under two-sided Wald inference, ` +
            `a (1-alpha) CI excludes null if and only if p < alpha. This mathematical ` +
            `impossibility indicates the CI or p-value was fabricated or misreported.`,
          affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
          remediation:
            'Recompute CI and p from raw data using the same statistical procedure. ' +
            'Ensure the CI confidence level matches (1 - alpha) and the test is two-sided.',
          findingIdSuffix: 'CI_P',
        }),
      );
    }
  }

  // ── 层 2：方向-effectSize 符号矛盾（greater 但 effectSize<0；less 但 effectSize>0）──
  // 语义注意：effectDirection（FEC 字段）是**预注册假设方向**，effectiveDirection（statisticalReport）
  // 是**观测方向**。失败复现（如 Ritchie 反驳 Bem）的 effectiveDirection='refutes' + effectSize 符号
  // 与假设方向相反是**合法的科学结果**（假设被数据反驳），不是伪造。故本层只在 effectiveDirection
  // === 'supports'（观测声称支持假设）时检查符号矛盾——此时 effectSize 符号必须与假设方向一致，
  // 否则表明 effectSize 或方向是事后拼凑的（声称 supports 但数据符号与假设相反 = 数学矛盾）。
  if (
    effectiveDirection === 'supports' &&
    direction !== 'two_sided' &&
    effectSize !== null &&
    effectSize !== 0
  ) {
    const signMismatch =
      (direction === 'greater' && effectSize < 0) || (direction === 'less' && effectSize > 0);
    if (signMismatch) {
      findings.push(
        makeFinding({
          attackId: 'AT-EFFECT-P-MISMATCH',
          outcome: 'FAIL',
          reasonCode: 'DIRECTION_EFFECT_SIGN_MISMATCH',
          evidenceRef: 'verdict.statisticalReport.primaryEffectSize',
          message:
            `Statistical report is internally inconsistent: effectiveDirection='supports' ` +
            `(observation claims to support the hypothesis) but primaryEffectSize=${effectSize} ` +
            `has the opposite sign from FEC effectDirection='${direction}'. A '${direction}' ` +
            `effect that genuinely 'supports' the hypothesis must produce a ` +
            `${direction === 'greater' ? 'positive' : 'negative'} effectSize under any metric scale. ` +
            `This sign contradiction (claiming support while the effect runs opposite to the ` +
            `hypothesis) indicates the effectSize or direction was selected post-hoc to fabricate support.`,
          affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
          remediation:
            'Recompute effectSize from raw data and verify its sign matches the pre-registered ' +
            'effectDirection when the observation genuinely supports the hypothesis. If the true ' +
            'effect direction differs, set effectiveDirection to refutes/neutral and revise the FEC.',
          findingIdSuffix: 'DIRECTION_EFFECT',
        }),
      );
    }
  }

  // ── 层 3：方向-CI 矛盾（greater 但 CI 上界<0；less 但 CI 下界>0）──
  // 同层 2 语义守卫：只在 effectiveDirection='supports' 时检查。若 CI 整体落在假设方向的相反
  // 区域（如 greater 假设但 CI 全负），则观测表明效应方向与假设相反——此时 effectiveDirection
  // 应为 'refutes' 而非 'supports'。声称 supports 但 CI 方向相反 = 报告自相矛盾（非单纯不显著）。
  if (effectiveDirection === 'supports' && direction !== 'two_sided' && ci !== null) {
    const ciContradictsDirection =
      (direction === 'greater' && ci[1] < 0) || (direction === 'less' && ci[0] > 0);
    if (ciContradictsDirection) {
      findings.push(
        makeFinding({
          attackId: 'AT-EFFECT-P-MISMATCH',
          outcome: 'FAIL',
          reasonCode: 'DIRECTION_CI_MISMATCH',
          evidenceRef: 'verdict.statisticalReport.primaryConfidenceInterval',
          message:
            `Statistical report is internally inconsistent: effectiveDirection='supports' ` +
            `(observation claims to support the hypothesis) but primaryConfidenceInterval=[${ci[0]}, ${ci[1]}] ` +
            `lies entirely ${direction === 'greater' ? 'below' : 'above'} null (0), which is the ` +
            `${direction === 'greater' ? 'opposite' : 'opposite'} of FEC effectDirection='${direction}'. ` +
            `A CI entirely in the ${direction === 'greater' ? 'negative' : 'positive'} region indicates ` +
            `the effect runs against the hypothesis — effectiveDirection should be 'refutes', not 'supports'. ` +
            `Claiming support while the CI shows the opposite direction is a self-contradiction that ` +
            `indicates selective reporting or fabrication.`,
          affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
          remediation:
            'Recompute the CI from raw data. If the CI genuinely lies in the opposite region, ' +
            'set effectiveDirection to refutes and revise the conclusion — the hypothesis is not supported.',
          findingIdSuffix: 'DIRECTION_CI',
        }),
      );
    }
  }

  return findings;
}
