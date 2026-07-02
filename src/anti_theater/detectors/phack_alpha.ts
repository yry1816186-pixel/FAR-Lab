/**
 * anti_theater detector: AT-PHACK-ALPHA —— p-hacking via alpha inflation detector.
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_phack_alpha 伪代码）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：误报率=0 / 确定性 / reasonCode）。
 *
 * 攻击语义：预注册阶段冻结的 alpha 与 FEC.statisticalPlan.alpha（执行端）不一致，
 *           即在结果出来后偷偷放大显著水平（alpha inflation），属 p-hacking 子类。
 *           伪代码 frozen=preregistrationRecord.alpha，executed=fec.statisticalPlan.alpha，
 *           floatsEqual(frozen, executed, tol=0) 为 false → ALPHA_INFLATION_DEVIATION。
 *
 * 适配裁决（任务书）：
 *   - outcome='FAIL'（命中即阻断降级·blockSeal=false 即 severity=FAIL 非 BLOCK）。
 *   - frozen = input.preregistrationRecord.alpha，executed = input.fec.statisticalPlan.alpha。
 *   - floatsEqual(frozen, executed, 0)（tol=0 精确比较）为 false → 触发。
 *   - R7：alpha 从 JSON 解析为 IEEE 754 double，TS/Python 两端位级一致；tol=0 即精确比较。
 *
 * 模型中立（无 qwen/dashscope/openai）。零容忍合规（无 any / @ts-ignore / 双重断言 /
 *   空 catch / 桩）。纯函数：确定性、不 mutate input、不读 FS/网络。
 *
 * 完整覆盖（非 PARTIAL）：本 detector 完整实现 APPENDIX_E §2 伪代码全部逻辑，
 *   无需 W4 ROADMAP 退化。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';
import { floatsEqual } from '../utils.ts';

/** frozen vs executed alpha 字段路径（影响 proofHash 输入·APPENDIX_E §7.2 标注）。 */
const AFFECTED_PROOF_HASH_INPUTS: readonly string[] = [
  'fec.statisticalPlan.alpha',
  'preregistrationRecord.alpha',
];

/** 修复建议（Honesty Wall 展示·明确指向根因）。 */
const REMEDIATION =
  '冻结 alpha（preregistrationRecord.alpha）与 FEC.statisticalPlan.alpha 必须精确一致；' +
  '若需调整 alpha 必须在假设封存前完成并重新预注册，不得事后放大显著水平。';

/**
 * 检测预注册冻结 alpha 与 FEC 执行端 alpha 是否偏离（p-hacking alpha inflation）。
 *
 * @param input - AntiTheaterLintInput（消费 fec.statisticalPlan.alpha + preregistrationRecord.alpha）
 * @returns 命中返回单条 DetectorFinding（outcome=FAIL）；否则空数组。
 */
export function detect_phack_alpha(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const frozen: number = input.preregistrationRecord.alpha;
  const executed: number = input.fec.statisticalPlan.alpha;

  // tol=0 精确比较（R7：IEEE 754 double 位级一致）。
  if (floatsEqual(frozen, executed, 0)) {
    return [];
  }

  const finding: DetectorFinding = makeFinding({
    attackId: 'AT-PHACK-ALPHA',
    outcome: 'FAIL',
    reasonCode: 'ALPHA_INFLATION_DEVIATION',
    evidenceRef: 'fec.statisticalPlan.alpha',
    message:
      `Alpha inflation detected: preregistered (frozen) alpha=${frozen} ` +
      `deviates from FEC statisticalPlan.alpha=${executed} (tol=0 exact). ` +
      `Post-hoc alpha inflation is p-hacking and breaks falsifiability lock.`,
    affectedProofHashInputs: AFFECTED_PROOF_HASH_INPUTS,
    remediation: REMEDIATION,
  });

  return [finding];
}
