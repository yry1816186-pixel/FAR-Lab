/**
 * anti_theater detector —— AT-METRIC-SWAP（主指标偷换检测）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_metric_swap 伪代码）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：误报率=0 / 确定性 / 不读 FS）。
 *
 * 攻击语义：FEC 声明的 primary metric（fec.metric：metricKey/description/unit/computationRef/
 *   isDeterministic）在假设封存后被偷换——例如封存时登记的是 accuracy@5，跑完结果后悄悄改成
 *   accuracy@1 让结果"刚好达标"。这是典型的 metric swapping / moving goalpost。
 *   防线：预注册时冻结 canonical(fec.metric) 的 sha256（primaryMetricHash），lint 时用 FEC 当前
 *   声明的同 MetricSpec 重算 hash，比对冻结值。不等 → 说明 metric 在封存后被篡改。
 *
 * 算法（确定性·纯函数·不读 FS/网络·不 mutate input）：
 *   frozen   = input.preregistrationRecord.primaryMetricHash
 *   executed = hashCanonicalJson({ metric: input.fec.metric })
 *   if frozen !== executed: emit PRIMARY_METRIC_SWAPPED (FAIL)
 *   else: 无发现
 *
 * 关键裁决（D-适配·必读）：
 *   - 伪代码 canonical_hash(input.fec.metric) 单参数散列；TS hashCanonicalJson 形参是
 *     Record<string, unknown>，故包一层 key：hashCanonicalJson({ metric: input.fec.metric })，
 *     与 frozen 端 primaryMetricHash 的冻结口径一致（frozen 端在 deterministic_freezer 处用同口径
 *     产 primaryMetricHash）。MetricSpec 全字段（metricKey/description/unit/computationRef/isDeterministic）
 *     为 JSON 可序列化纯数据（fec_contract.ts:104-111），fast-json-stable-stringify 按键序排序确定性序列化。
 *   - frozen hash 来源：preregistrationRecord.primaryMetricHash（types.ts:261）。
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
 * 检测主指标事后偷换（frozen vs executed primaryMetricHash 比对）。
 *
 * @param input AntiTheaterLintInput（消费 fec.metric / preregistrationRecord.primaryMetricHash）
 * @returns 无偷换 → []；检测到偷换 → 单条 PRIMARY_METRIC_SWAPPED finding（FAIL）
 */
export function detect_metric_swap(
  input: AntiTheaterLintInput,
): readonly DetectorFinding[] {
  const frozen = input.preregistrationRecord.primaryMetricHash;

  // executed 端：用 FEC 当前声明的完整 MetricSpec 重算 canonical sha256。
  // MetricSpec 为 JSON 可序列化纯数据（fec_contract.ts:104-111）。
  const executed = hashCanonicalJson({
    metric: input.fec.metric,
  });

  if (frozen !== executed) {
    return [
      makeFinding({
        attackId: 'AT-METRIC-SWAP',
        outcome: 'FAIL',
        reasonCode: 'PRIMARY_METRIC_SWAPPED',
        evidenceRef: 'preregistrationRecord.primaryMetricHash',
        message: `Primary metric swapped: frozen primaryMetricHash '${frozen}' !== executed hash '${executed}' recomputed from fec.metric (metricKey='${input.fec.metric.metricKey}', unit='${input.fec.metric.unit}'). The primary metric specification was altered after hypothesis sealing.`,
        affectedProofHashInputs: ['fec.metric'],
        remediation:
          "Restore the originally preregistered primary metric (fec.metric), then re-run verification. If the change is legitimate, re-freeze a new FEC with a fresh preregistrationRecord.primaryMetricHash before any result evaluation.",
      }),
    ];
  }

  return [];
}
