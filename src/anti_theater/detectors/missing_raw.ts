/**
 * anti_theater detector AT-MISSING-RAW —— 原始产物哈希缺失检测器。
 *
 * 攻击语义：测量痕迹（MeasurementTrace）未声明任何原始产物哈希（rawArtifactHashes 缺/空）。
 *           原始产物（raw artifact）是可复现性的根基——无 rawArtifactHashes 即无法证明
 *           metricValue 来自可验证的数据源，承诺失效。list 型：每个违规 measurement 产 1 finding。
 *
 * 判定规则（伪代码对齐）：
 *   for m in executionTrace.measurements:
 *     if m.rawArtifactHashes 缺或空（length === 0）→ RAW_ARTIFACT_MISSING（FAIL）
 *
 * 与 AT-LABEL-ONLY 的边界：两者都查 rawArtifactHashes，但
 *   - AT-LABEL-ONLY 仅检查 role === 'primary' 的 measurement；
 *   - AT-MISSING-RAW 检查所有 role 的 measurement（primary / secondary / control）。
 *
 * 模型中立（F3/C1）：无 qwen / dashscope / openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 * 安全关键（承诺误报率=0）：仅在 rawArtifactHashes 确为缺/空时产 FAIL，不模糊判定。
 *
 * 完整覆盖：无 PARTIAL/ROADMAP 标注（本 detector 逻辑完备，无待落地裁决）。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** 本 detector 固定 attackId（makeFinding 经 ATTACK_ID_TO_KIND 映射为 'missing-raw-artifact'）。 */
const ATTACK_ID = 'AT-MISSING-RAW';

/**
 * 检测原始产物哈希缺失（AT-MISSING-RAW）。
 *
 * 遍历 input.executionTrace.measurements，rawArtifactHashes 缺/空 → 产 RAW_ARTIFACT_MISSING finding。
 * 每个违规 measurement 产 1 个 finding，findingIdSuffix 用 `-${m.runId}` 区分。
 *
 * @param input - AntiTheaterLintInput（7 字段，本 detector 消费 executionTrace.measurements）。
 * @returns readonly DetectorFinding[] —— 无违规时返回 []。
 */
export function detect_missing_raw(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const m of input.executionTrace.measurements) {
    // rawArtifactHashes 类型为 readonly string[]（非 optional），但运行时防御性判定空数组/缺字段。
    // length === 0 即"缺"（伪代码 `if not m.rawArtifactHashes` 等价语义：无任何哈希条目）。
    if (m.rawArtifactHashes === undefined || m.rawArtifactHashes.length === 0) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'FAIL',
          reasonCode: 'RAW_ARTIFACT_MISSING',
          evidenceRef: `measurementResults[${m.runId}].rawArtifactHashes`,
          message: `measurement runId='${m.runId}' (role='${m.role}', metricKey='${m.metricKey}') 声明空或缺失的 rawArtifactHashes，无法证明 metricValue 来自可验证的原始产物`,
          affectedProofHashInputs: [`measurementResults[${m.runId}].rawArtifactHashes`],
          remediation:
            '为该 measurement 关联原始产物（如数据快照、日志、checkpoint）并记录其 content hash 至 rawArtifactHashes 数组',
          findingIdSuffix: m.runId,
        }),
      );
    }
  }

  return findings;
}
