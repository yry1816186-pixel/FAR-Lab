/**
 * phack_correction detector —— 多重检验未校正攻击检测（AT-PHACK-CORRECTION）。
 *
 * 攻击语义：当家族检验数 n>1（多重检验场景）但 statisticalPlan.multipleTestingCorrection === 'none'
 *           时，未做多重检验校正会导致家族-wise I 类错误膨胀（p-hacking 风险面）。本检测确定性
 *           捕获该配置缺陷，fail-closed 拦截 seal。
 *
 * 适配裁决（D5·伪代码 measurableImplications 在 FEC V2 中为单数 measurableImplication，
 *           家族检验数 n 改从 multipleTestingPlan.familySize 读取·缺省 1）：
 *   - n = input.fec.multipleTestingPlan?.familySize ?? 1
 *   - correction = input.fec.statisticalPlan.multipleTestingCorrection
 *   - n > 1 && correction === 'none' → outcome='FAIL' / reasonCode='MULTIPLE_TESTING_UNCORRECTED'
 *
 * 模型中立（无 qwen/dashscope/openai 字面量·F3/C1）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测多重检验未校正攻击（AT-PHACK-CORRECTION）。
 *
 * 触发条件（确定性·严格）：
 *   - 家族检验数 n = fec.multipleTestingPlan?.familySize ?? 1
 *   - 统计计划多重检验校正 = fec.statisticalPlan.multipleTestingCorrection
 *   - 当 n > 1 且 correction === 'none' → 单条 FAIL finding（MULTIPLE_TESTING_UNCORRECTED）
 *
 * 误报率=0 保证：触发条件全部基于 FEC V2 冻结字段的精确值比较（数值 > 1 + 字面量 === 'none'），
 *               无启发式 / 无近似 / 无概率判定。
 *
 * @param input anti-theater lint 输入（消费 fec.multipleTestingPlan.familySize / fec.statisticalPlan.multipleTestingCorrection）
 * @returns 单条 DetectorFinding（命中）或空数组（未命中）
 */
export function detect_phack_correction(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const familySize: number = input.fec.multipleTestingPlan?.familySize ?? 1;
  const correction = input.fec.statisticalPlan.multipleTestingCorrection;

  if (familySize > 1 && correction === 'none') {
    const finding: DetectorFinding = makeFinding({
      attackId: 'AT-PHACK-CORRECTION',
      outcome: 'FAIL',
      reasonCode: 'MULTIPLE_TESTING_UNCORRECTED',
      evidenceRef: input.fec.fecId,
      message:
        `Multiple testing family size n=${familySize} > 1 but statisticalPlan.multipleTestingCorrection='none' ` +
        '(family-wise Type I error inflation / p-hacking risk surface; require bonferroni/holm/bh_fdr).',
      affectedProofHashInputs: ['fec.statisticalPlan.multipleTestingCorrection'],
      remediation:
        "Set fec.statisticalPlan.multipleTestingCorrection to a non-'none' method (bonferroni/holm/bh_fdr) " +
        'or declare a matching fec.multipleTestingPlan with familySize and adjustedAlpha.',
    });
    return [finding];
  }

  return [];
}
