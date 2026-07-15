/**
 * anti_theater detector —— AT-POSTHOC-THRESHOLD（事后阈值篡改检测）。
 *
 * 攻击语义：阈值方向（threshold.value / direction / threshold.thresholdSemantics）在假设封存后
 *   被偷偷改写以让结果"刚好通过"——这是经典的 p-hacking / post-hoc moving goalpost。
 *   防线：预注册时冻结 canonical(threshold, direction, thresholdSemantics) 的 sha256（thresholdHash），
 *   lint 时用 FEC 当前声明的同三元组重算 hash，比对冻结值。不等 → 说明阈值在封存后被篡改。
 *
 * 算法（确定性·纯函数·不读 FS/网络·不 mutate input）：
 *   frozen   = input.preregistrationRecord.thresholdHash
 *   executed = hashCanonicalJson({
 *                threshold:           input.fec.threshold,
 *                direction:           input.fec.direction,
 *                thresholdSemantics:  input.fec.threshold.thresholdSemantics,
 *              })
 *   if frozen !== executed: emit POSTHOC_THRESHOLD_DEVIATION (FAIL)
 *   else: 无发现
 *
 * 关键裁决（D-适配·必读）：
 *   - 伪代码 canonical_hash(threshold, direction, thresholdSemantics) 三参数散列，TS 无对应三参 API。
 *     适配为单对象 canonical JSON 散列 hashCanonicalJson({threshold, direction, thresholdSemantics})。
 *     注意：threshold 是完整 ThresholdSpec 对象（含 value/unit/thresholdSemantics/rangeUpper?/preregistered），
 *     rangeUpper optional 字段在 canonical JSON 中条件展开（hasher.ts fast-json-stable-stringify 按键序排序，
 *     undefined 字段不序列化·确定性）。伪代码原文仅取 threshold.thresholdSemantics 作为第三独立参数，
 *     但 threshold 对象本身已含 thresholdSemantics——按裁决以完整 threshold 对象 + direction + thresholdSemantics
 *     三元组入散列，与 frozen 端 thresholdHash 的冻结口径一致（frozen 端在 deterministic_freezer 处用同口径产 thresholdHash）。
 *   - frozen hash 来源：preregistrationRecord.thresholdHash（types.ts:259）。
 *   - 误报率=0 保证：hash 比对是密码学精确比较（64-hex sha256），无误报空间；NaN/Infinity 在
 *     hashCanonicalJson 内 assertNoNonFiniteNumber 直接 throw（hasher.ts:41-61），不静默放过。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';
import { hashCanonicalJson } from '../../evidence_log/hasher.ts';

/**
 * 检测阈值方向事后篡改（frozen vs executed thresholdHash 比对）。
 *
 * @param input AntiTheaterLintInput（消费 fec.threshold / fec.direction / preregistrationRecord.thresholdHash）
 * @returns 无篡改 → []；检测到篡改 → 单条 POSTHOC_THRESHOLD_DEVIATION finding（FAIL）
 */
export function detect_posthoc_threshold(
  input: AntiTheaterLintInput,
): readonly DetectorFinding[] {
  const frozen = input.preregistrationRecord.thresholdHash;

  // executed 端：用 FEC 当前声明的 (threshold, direction, thresholdSemantics) 三元组重算 canonical sha256。
  // ThresholdSpec / EffectComparator / thresholdSemantics 均为 JSON 可序列化纯数据（fec_contract.ts:113-120 / enums.ts:102-103）。
  const executed = hashCanonicalJson({
    threshold: input.fec.threshold,
    direction: input.fec.direction,
    thresholdSemantics: input.fec.threshold.thresholdSemantics,
  });

  if (frozen !== executed) {
    return [
      makeFinding({
        attackId: 'AT-POSTHOC-THRESHOLD',
        outcome: 'FAIL',
        reasonCode: 'POSTHOC_THRESHOLD_DEVIATION',
        evidenceRef: 'preregistrationRecord.thresholdHash',
        message: `Post-hoc threshold deviation: frozen thresholdHash '${frozen}' !== executed hash '${executed}' recomputed from fec.threshold (value=${input.fec.threshold.value}, thresholdSemantics='${input.fec.threshold.thresholdSemantics}') + fec.direction='${input.fec.direction}'. Threshold/direction/semantics were altered after hypothesis sealing.`,
        affectedProofHashInputs: [
          'fec.threshold',
          'fec.direction',
          'fec.threshold.thresholdSemantics',
        ],
        remediation:
          "Restore the originally preregistered threshold value, direction, and thresholdSemantics, then re-run verification. If the change is legitimate, re-freeze a new FEC with a fresh preregistrationRecord.thresholdHash before any result evaluation.",
      }),
    ];
  }

  return [];
}
