/**
 * anti_theater score —— 反剧场评分（7 桶去重扣分·APPENDIX_E §4）。
 *
 * 评分规则（§4·100 基准，7 桶扣分，每桶命中一次即扣·去重）：
 *   score = 100
 *     - 25 * critical_protocol_deviation   # AT-POSTHOC-THRESHOLD/AT-METRIC-SWAP/AT-PHACK-ALPHA/AT-HARK/AT-STOPPING-RULE/AT-OPTIONAL-STOPPING
 *     - 20 * missing_primary_evidence      # AT-FAKE-PASS/AT-LABEL-ONLY/AT-MISSING-RAW
 *     - 15 * hidden_failed_run             # AT-SEED-CHERRY (reasonCode=HIDDEN_FAILED_RUN)
 *     - 10 * weak_dataset_binding          # AT-DATA-DRIFT(WARN) / AT-DATA-HASH-FAKE
 *     - 10 * llm_only_support              # AT-JUDGE-OVERRIDE/AT-LABEL-ONLY
 *     - 10 * no_negative_control           # FEC 缺 negative control（D7 近似）
 *     - 10 * report_proof_mismatch         # AT-REPORT-MISMATCH
 *
 * 阈值（§4）：< 70 不可 seal CONFIRMED；< 50 强制 UNTESTED/INCONCLUSIVE（文档政策·编排器仅实现 >=70 门）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 桩。纯函数（不 mutate 输入）。
 */

import type { FecContractV2 } from '../fec/fec_contract.ts';
import type { DetectorFinding } from './types.ts';
import { hasNegativeControl, intersection } from './utils.ts';

/** 桶 1：critical_protocol_deviation（-25）。 */
const BUCKET_CRITICAL_PROTOCOL: ReadonlySet<string> = new Set([
  'AT-POSTHOC-THRESHOLD',
  'AT-METRIC-SWAP',
  'AT-PHACK-ALPHA',
  'AT-HARK',
  'AT-STOPPING-RULE',
  'AT-OPTIONAL-STOPPING',
]);

/** 桶 2：missing_primary_evidence（-20）。 */
const BUCKET_MISSING_PRIMARY: ReadonlySet<string> = new Set([
  'AT-FAKE-PASS',
  'AT-LABEL-ONLY',
  'AT-MISSING-RAW',
]);

/** 桶 4：weak_dataset_binding（-10）。 */
const BUCKET_WEAK_DATASET: ReadonlySet<string> = new Set(['AT-DATA-DRIFT', 'AT-DATA-HASH-FAKE']);

/** 桶 5：llm_only_support（-10）。 */
const BUCKET_LLM_ONLY: ReadonlySet<string> = new Set(['AT-JUDGE-OVERRIDE', 'AT-LABEL-ONLY']);

/** 不可 seal CONFIRMED 阈值（§4·canSealConfirmed 门）。 */
export const SEAL_BLOCK_SCORE_THRESHOLD = 70;

/**
 * 反剧场评分（7 桶去重扣分）。
 *
 * @param findings detector 聚合产出（用 ext.attackId / ext.reasonCode / stored.outcome 判桶）。
 * @param fec FEC 契约（桶 6 no_negative_control 消费 datasetRequirements·D7 近似）。
 * @returns [0,100] 评分（越低越危险）。
 */
export function computeAntiTheaterScore(
  findings: readonly DetectorFinding[],
  fec: FecContractV2,
): number {
  let score = 100;
  const attackIds = new Set(findings.map((f) => f.ext.attackId));

  // 桶 1：critical_protocol_deviation（-25·集合命中一次即扣）。
  if (intersection(attackIds, BUCKET_CRITICAL_PROTOCOL).size > 0) {
    score -= 25;
  }
  // 桶 2：missing_primary_evidence（-20）。
  if (intersection(attackIds, BUCKET_MISSING_PRIMARY).size > 0) {
    score -= 20;
  }
  // 桶 3：hidden_failed_run（-15·reasonCode=HIDDEN_FAILED_RUN 触发，非整个 AT-SEED-CHERRY）。
  if (findings.some((f) => f.ext.reasonCode === 'HIDDEN_FAILED_RUN')) {
    score -= 15;
  }
  // 桶 4：weak_dataset_binding（-10·遵循伪代码实现：AT-DATA-DRIFT WARN finding 触发）。
  if (intersection(attackIds, BUCKET_WEAK_DATASET).size > 0) {
    if (findings.some((f) => f.ext.attackId === 'AT-DATA-DRIFT' && f.stored.outcome === 'WARN')) {
      score -= 10;
    }
  }
  // 桶 5：llm_only_support（-10）。
  if (intersection(attackIds, BUCKET_LLM_ONLY).size > 0) {
    score -= 10;
  }
  // 桶 6：no_negative_control（-10·D7 近似：FEC datasetRequirements name/tag 含 negative/control）。
  if (!hasNegativeControl(fec)) {
    score -= 10;
  }
  // 桶 7：report_proof_mismatch（-10）。
  if (attackIds.has('AT-REPORT-MISMATCH')) {
    score -= 10;
  }

  return Math.max(score, 0);
}
