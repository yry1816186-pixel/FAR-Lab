/**
 * anti_theater detectors barrel + DETECTORS 聚合（APPENDIX_E §3 顺序·21 项）。
 *
 * 顺序纪律（§3）：DETECTORS 数组顺序与 APPENDIX_E §3 伪代码逐字对齐——golden vector 对拍与
 * CI corpus test 依赖此顺序产稳定 findings 列表（确定性·F2）。
 *
 * T-003 修复（2026-07-24）：新增第 21 项 `detect_provenance_unbound`（AT-PROVENANCE-UNBOUND），
 * 追加在数组末尾（不破坏前 20 项 golden vector 顺序对拍）。仅在 `fec.requireExecutionProvenance=true`
 * 时触发，向后兼容 V1 demo seed（不 opt-in → 恒空 finding·零回归）。
 *
 * 模型中立。零容忍合规。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { detect_data_hash_fake } from './data_hash_fake.ts';
import { detect_dataset_drift } from './dataset_drift.ts';
import { detect_dep_float_drift } from './dep_float_drift.ts';
import { detect_fake_degraded } from './fake_degraded.ts';
import { detect_fake_pass } from './fake_pass.ts';
import { detect_hark } from './hark.ts';
import { detect_judge_override } from './judge_override.ts';
import { detect_label_only } from './label_only.ts';
import { detect_metric_swap } from './metric_swap.ts';
import { detect_missing_raw } from './missing_raw.ts';
import { detect_optional_stopping } from './optional_stopping.ts';
import { detect_overfit } from './overfit.ts';
import { detect_phack_alpha } from './phack_alpha.ts';
import { detect_phack_correction } from './phack_correction.ts';
import { detect_posthoc_threshold } from './posthoc_threshold.ts';
import { detect_provenance_unbound } from './provenance_unbound.ts';
import { detect_report_mismatch } from './report_mismatch.ts';
import { detect_scope_launder } from './scope_launder.ts';
import { detect_seed_cherry } from './seed_cherry.ts';
import { detect_stopping_rule } from './stopping_rule.ts';
import { detect_workflow_digest } from './workflow_digest.ts';

/** detector 函数签名（输入 AntiTheaterLintInput → DetectorFinding[]·空数组=无发现）。 */
export type AntiTheaterDetector = (input: AntiTheaterLintInput) => readonly DetectorFinding[];

/**
 * DETECTORS 聚合（APPENDIX_E §3 顺序·21 项）。
 * 顺序冻结：lint 编排器按此顺序遍历，findings 列表顺序稳定（确定性·golden vector 对拍）。
 *
 * T-003 修复：第 21 项 `detect_provenance_unbound` 追加在末尾——仅在
 * `fec.requireExecutionProvenance=true` 时触发，V1 向后兼容（不 opt-in → 恒空 finding）。
 */
export const DETECTORS: readonly AntiTheaterDetector[] = [
  detect_fake_pass, // AT-FAKE-PASS
  detect_label_only, // AT-LABEL-ONLY
  detect_judge_override, // AT-JUDGE-OVERRIDE
  detect_posthoc_threshold, // AT-POSTHOC-THRESHOLD
  detect_metric_swap, // AT-METRIC-SWAP
  detect_dataset_drift, // AT-DATA-DRIFT
  detect_data_hash_fake, // AT-DATA-HASH-FAKE
  detect_scope_launder, // AT-SCOPE-LAUNDER
  detect_missing_raw, // AT-MISSING-RAW
  detect_seed_cherry, // AT-SEED-CHERRY
  detect_workflow_digest, // AT-WORKFLOW-DIGEST
  detect_report_mismatch, // AT-REPORT-MISMATCH
  detect_phack_alpha, // AT-PHACK-ALPHA
  detect_phack_correction, // AT-PHACK-CORRECTION
  detect_hark, // AT-HARK
  detect_stopping_rule, // AT-STOPPING-RULE
  detect_optional_stopping, // AT-OPTIONAL-STOPPING
  detect_dep_float_drift, // AT-DEP-FLOAT-DRIFT
  detect_overfit, // AT-OVERFIT（ROADMAP）
  detect_fake_degraded, // AT-FAKE-DEGRADED
  detect_provenance_unbound, // AT-PROVENANCE-UNBOUND（T-003 修复·2026-07-24）
];

// re-export 单个 detector（测试/调试用）
export {
  detect_data_hash_fake,
  detect_dataset_drift,
  detect_dep_float_drift,
  detect_fake_degraded,
  detect_fake_pass,
  detect_hark,
  detect_judge_override,
  detect_label_only,
  detect_metric_swap,
  detect_missing_raw,
  detect_optional_stopping,
  detect_overfit,
  detect_phack_alpha,
  detect_phack_correction,
  detect_posthoc_threshold,
  detect_provenance_unbound,
  detect_report_mismatch,
  detect_scope_launder,
  detect_seed_cherry,
  detect_stopping_rule,
  detect_workflow_digest,
};
