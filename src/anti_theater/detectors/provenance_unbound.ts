/**
 * anti_theater detector AT-PROVENANCE-UNBOUND —— 执行溯源哈希缺失检测器（T-003 修复）。
 *
 * 攻击语义（评委逼问第 1 轮 F-2-005 / 总榜 T-003）：
 *   反剧场最深的洞——"系统无法区分真算出来的 metricValue 和编的 metricValue"。
 *   rawArtifactHashes 仅证明「有原始产物」（产物存在性），不证明「产物是这次执行产出的」
 *   （执行-产物绑定）。攻击者可拿别人跑的产物 hash 直接贴到自己手填的 metricValue 上，
 *   绕过 AT-LABEL-ONLY / AT-MISSING-RAW。
 *
 * 本 detector 填补此空白：当 FEC 显式声明 `requireExecutionProvenance: true` 时，
 * primary measurement 须携带 64-hex `executionProvenanceHash`（sandbox_runner.stdoutHash/
 * artifactTreeHash），证明 metricValue 是本次 sandbox 执行产出。任一 primary 缺失/格式错
 * → EVIDENCE_PROVENANCE_UNBOUND finding（FAIL）。
 *
 * 与 orchestrator `assertPrimaryEvidenceProvenanceBound` 的关系（defense-in-depth）：
 *   - orchestrator 闸：在 EvidenceRecord[] 层 fail-closed（裁决前置·拒绝裁决）；
 *   - 本 detector：在 MeasurementTrace[] 层产 finding（进 antiTheaterReport.findings →
 *     proofHash → verifier cross-check）。
 *   两条独立路径同源语义，任一捕获即阻断 CONFIRMED。
 *
 * 触发条件（防误报·零容忍 #4 不掩盖）：
 *   1. input.fec.requireExecutionProvenance === true（V1 默认 false·向后兼容）；
 *   2. measurement.role === 'primary'（与 AT-LABEL-ONLY 一致·secondary/control 不强制）；
 *   3. executionProvenanceHash 缺失或非 64-hex sha256 格式。
 *
 * 与 AT-LABEL-ONLY 的边界：
 *   - AT-LABEL-ONLY 检查 rawArtifactHashes（产物存在性）；
 *   - 本 detector 检查 executionProvenanceHash（执行-产物绑定）·仅在 FEC 显式 opt-in 时触发。
 *
 * 模型中立（F3/C1）：无 qwen / dashscope / openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 * 安全关键（承诺误报率=0）：仅在 requireExecutionProvenance=true 且 primary 确缺/格式错时产 FAIL。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** 本 detector 固定 attackId（makeFinding 经 ATTACK_ID_TO_KIND 映射为 'execution-provenance-unbound'）。 */
const ATTACK_ID = 'AT-PROVENANCE-UNBOUND';

/** 64-hex sha256 校验（与 sandbox_runner.stdoutHash/artifactTreeHash 同格式）。 */
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * 检测 primary measurement 缺失 executionProvenanceHash（AT-PROVENANCE-UNBOUND）。
 *
 * 行为契约：
 *   - fec.requireExecutionProvenance !== true → 返回 []（V1 默认不强制·向后兼容）；
 *   - 遍历 executionTrace.measurements，对 role='primary' 的条目校验 executionProvenanceHash：
 *     · 缺失或非 64-hex → 产 1 个 FAIL finding（reasonCode=EVIDENCE_PROVENANCE_UNBOUND）；
 *     · findingIdSuffix 用 `-${m.runId}` 区分多 primary 场景。
 *   - 无违规 → 返回 []。
 *
 * @param input - AntiTheaterLintInput（本 detector 消费 fec.requireExecutionProvenance + executionTrace.measurements）。
 * @returns readonly DetectorFinding[] —— 无违规或未 opt-in 时返回 []。
 */
export function detect_provenance_unbound(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  // V1 默认不强制（向后兼容·demo seed 不设置 requireExecutionProvenance）。
  if (input.fec.requireExecutionProvenance !== true) {
    return [];
  }

  const findings: DetectorFinding[] = [];
  for (const m of input.executionTrace.measurements) {
    if (m.role !== 'primary') {
      // secondary/control 不强制 provenance（与 AT-LABEL-ONLY 一致·仅 primary 进阈值比较）。
      continue;
    }
    const hash = m.executionProvenanceHash;
    const isValid = typeof hash === 'string' && HEX64.test(hash);
    if (!isValid) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'FAIL',
          reasonCode: 'EVIDENCE_PROVENANCE_UNBOUND',
          evidenceRef: `executionTrace.measurements[runId=${m.runId}].executionProvenanceHash`,
          message:
            `AT-PROVENANCE-UNBOUND: primary measurement (runId=${m.runId}, metricKey='${m.metricKey}') ` +
            `lacks a valid executionProvenanceHash (64-hex sha256 from sandbox_runner.stdoutHash/artifactTreeHash). ` +
            `fec.requireExecutionProvenance=true → metricValue could be hand-injected fixture冒充真实计算结果. ` +
            `rawArtifactHashes 仅证明产物存在，不证明产物是本次执行产出的（执行-产物绑定缺失）.`,
          affectedProofHashInputs: [
            `measurementResults[${m.runId}].executionProvenanceHash`,
          ],
          remediation:
            `为 primary measurement runId=${m.runId} 绑定 executionProvenanceHash: ` +
            `跑完 sandbox 后用 computeSandboxRunResult 取 stdoutHash/artifactTreeHash (64-hex sha256), ` +
            `填入 MeasurementTrace.executionProvenanceHash, 然后重跑 proof.`,
          findingIdSuffix: m.runId,
          blockSeal: false,
        }),
      );
    }
  }

  return findings;
}
