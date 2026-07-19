/**
 * anti_theater detector: AT-LABEL-ONLY —— 标签证据检测器（primary measurement 缺 rawArtifactHashes）。
 *
 * 检测语义（伪代码原意）：
 *   executionTrace.measurements 中 role==='primary' 的条目是裁决载体——primary measurement 必须
 *   携带 rawArtifactHashes（指向真实可复现的原始产物 hash），否则 measurement 仅是"标签"（label-only），
 *   没有底层证据支撑。任一 primary 缺 rawArtifactHashes → LABEL_ONLY_EVIDENCE；完全无 primary
 *   measurement → NO_PRIMARY_RAW_ARTIFACT。
 *
 * 关键裁决（必须遵循）：
 *   - outcome='FAIL'（blockSeal=false，由 makeFinding 不变量允许）。
 *   - 无 primary measurement → NO_PRIMARY_RAW_ARTIFACT，affected=['measurementResults']。
 *   - primary 缺 rawArtifactHashes（空数组或未提供视为缺）→ LABEL_ONLY_EVIDENCE，
 *     affected=[`measurementResults[${m.runId}].rawArtifactHashes`]。
 *   - 多 primary 缺失时取首条（伪代码 return finding 语义为单 finding 早出，本实现返回首个发现）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩 / 删功能。
 * 纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测标签证据：primary measurement 是否携带 rawArtifactHashes。
 *
 * @param input AntiTheaterLintInput（7 字段·本 detector 消费 executionTrace.measurements）。
 * @returns 单个 finding（NO_PRIMARY_RAW_ARTIFACT 或 LABEL_ONLY_EVIDENCE·outcome=FAIL），或空数组表示无发现。
 */
export function detect_label_only(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const measurements = input.executionTrace.measurements;
  const primary = measurements.filter((m) => m.role === 'primary');

  if (primary.length === 0) {
    // 伪代码：if not primary → return finding(NO_PRIMARY_RAW_ARTIFACT, affected=['measurementResults'])
    const finding = makeFinding({
      attackId: 'AT-LABEL-ONLY',
      outcome: 'FAIL',
      reasonCode: 'NO_PRIMARY_RAW_ARTIFACT',
      evidenceRef: 'executionTrace.measurements',
      message:
        'AT-LABEL-ONLY: no primary measurement present in executionTrace.measurements. Verdict is a label without any primary raw artifact to back it.',
      affectedProofHashInputs: ['measurementResults'],
      remediation:
        'Record at least one MeasurementTrace with role=\'primary\' carrying non-empty rawArtifactHashes that point to the reproducible raw artifact, then re-run the proof.',
      blockSeal: false,
    });
    return [finding];
  }

  // 伪代码：for m in primary: if not m.rawArtifactHashes → return finding(LABEL_ONLY_EVIDENCE)
  // rawArtifactHashes 为 readonly string[]；空数组或所有项缺失视为 label-only（与伪代码 not m.rawArtifactHashes 等价）。
  const offender = primary.find((m) => m.rawArtifactHashes.length === 0);
  if (offender !== undefined) {
    const finding = makeFinding({
      attackId: 'AT-LABEL-ONLY',
      outcome: 'FAIL',
      reasonCode: 'LABEL_ONLY_EVIDENCE',
      evidenceRef: `executionTrace.measurements[runId=${offender.runId}].rawArtifactHashes`,
      message: `AT-LABEL-ONLY: primary measurement (runId=${offender.runId}) has empty rawArtifactHashes. The measurement is a label without any underlying raw artifact hash; verdict cannot be trusted.`,
      affectedProofHashInputs: [`measurementResults[${offender.runId}].rawArtifactHashes`],
      remediation: `Attach the raw artifact hash(es) for primary measurement runId=${offender.runId} into rawArtifactHashes (pointing to the reproducible raw artifact), then re-run the proof.`,
      blockSeal: false,
    });
    return [finding];
  }

  return [];
}
