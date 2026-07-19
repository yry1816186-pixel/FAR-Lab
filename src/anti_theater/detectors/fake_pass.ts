/**
 * anti_theater detector: AT-FAKE-PASS —— 伪造 PASS / 必需证据缺失检测器。
 *
 * 检测语义（伪代码原意）：
 *   FEC 声明 requiredEvidence（每条带 evidenceId），executionTrace.measurements 须通过 requirementId
 *   逐条 resolve。任何 required evidence 在 measurements 中找不到 requirementId 对应条目
 *   → PASS 是伪造的 → BLOCK（拒绝 seal）。
 *
 * 关键裁决（必须遵循）：
 *   - D11: EvidenceRequirement 用 evidenceId（伪代码 r.id → r.evidenceId）。missing 判
 *     r.evidenceId not in resolved_ids；affected=[f"requiredEvidence[{r.evidenceId}]"]。
 *   - D4: VKO 无 proofChecks/verdictNodes，故"PASS without evidence_ref"第二子路径在本 MVP 跳过
 *     （PARTIAL·W4 待 VKO proofChecks 接入后补全）。本文件仅实现 REQUIRED_EVIDENCE_MISSING 子路径。
 *   - blockSeal=true → outcome='FAIL'（makeFinding 不变量校验）。
 *   - required 为空 → 返回 []（伪代码 len(required)==0 → return None，本实现等价返回空 finding 列表）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩 / 删功能。
 * 纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测伪造 PASS：FEC.requiredEvidence 中是否存在未被任何 measurement.requirementId resolve 的条目。
 *
 * @param input AntiTheaterLintInput（7 字段·本 detector 消费 fec.requiredEvidence + executionTrace.measurements）。
 * @returns 单个 REQUIRED_EVIDENCE_MISSING finding（blockSeal=true·outcome=FAIL），或空数组表示无发现。
 */
export function detect_fake_pass(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const required = input.fec.requiredEvidence;
  if (required.length === 0) {
    // 伪代码 len(required)==0 → return None；本实现等价为空 finding 列表。
    return [];
  }

  const measurements = input.executionTrace.measurements;
  // resolved_ids = { m.requirementId for m in measurements if m.requirementId }
  const resolvedIds: ReadonlySet<string> = new Set(
    measurements
      .map((m) => m.requirementId)
      .filter((id): id is string => id !== undefined && id.length > 0),
  );

  // missing = [r for r in required if r.evidenceId not in resolved_ids]（D11: r.evidenceId 非 r.id）
  const missing = required.filter((r) => !resolvedIds.has(r.evidenceId));
  if (missing.length === 0) {
    return [];
  }

  // affected=[f"requiredEvidence[{r.evidenceId}]" for r in missing]
  const affectedProofHashInputs = missing.map((r) => `requiredEvidence[${r.evidenceId}]`);
  const missingIds = missing.map((r) => r.evidenceId).join(', ');
  // missing.length > 0 已保证（上文 length===0 早退），TS noUncheckedIndexedAccess 无法据此收窄，
  // 显式取首元素并断言存在（length 检查即依据，符合铁律：必要的窄断言须配注释说明依据）。
  const firstMissing = missing[0];
  if (firstMissing === undefined) {
    return [];
  }
  const evidenceRef = `fec.requiredEvidence[${firstMissing.evidenceId}]`;

  const finding = makeFinding({
    attackId: 'AT-FAKE-PASS',
    outcome: 'FAIL',
    reasonCode: 'REQUIRED_EVIDENCE_MISSING',
    evidenceRef,
    message: `AT-FAKE-PASS: ${missing.length} required evidence requirement(s) not resolved by any measurement.requirementId (missing evidenceId: ${missingIds}). PASS verdict is forged in absence of required evidence.`,
    affectedProofHashInputs,
    remediation:
      'For each missing requiredEvidence entry, ensure executionTrace.measurements contains a MeasurementTrace whose requirementId equals the requiredEvidence.evidenceId, then re-run the proof.',
    blockSeal: true,
  });

  return [finding];
}
