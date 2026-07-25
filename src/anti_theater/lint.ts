/**
 * anti_theater lint —— 反剧场检测编排器（runAntiTheaterLint·APPENDIX_E §3）。
 *
 * 职责（§3 run_anti_theater_lint）：
 *   1. 按 DETECTORS 顺序遍历 20 个 detector（确定性·无 LLM·computedBy="deterministic_compiler"）。
 *   2. 聚合 DetectorFinding[]（stored + ext）。
 *   3. computeAntiTheaterScore（§4·7 桶去重扣分）。
 *   4. applyVerdictConstraint（§3.2·取严后 forcedVerdict + blockSeal）。
 *   5. 构造 AntiTheaterReport（hasFail/failCount/warnCount 从 stored.outcome 统计）。
 *
 * canSealConfirmed 三重条件（§3 + D16 扩展·全 true 才可 seal CONFIRMED）：
 *   score >= 70 AND 无 BLOCK finding AND constraint.forcedVerdict === undefined。
 *   （§3 原文 `forcedVerdict not in ("UNTESTED",)`；D16 扩展 forced 含 REFUTED/DEGRADED_SCOPE/INCONCLUSIVE 后，
 *    任一 forced 都应阻止 seal CONFIRMED，故收窄为 forcedVerdict===undefined。AT-REPORT-MISMATCH 不 force，
 *    structured wins 时仍可 seal——其 FAIL 由 validator RULE-PE-007 hasFail 门独立处理。）
 *
 * llmOverrideRejected（缺口 #10 裁决）：deterministic lint 保证 structured verdict wins——
 *   若 AT-JUDGE-OVERRIDE 检测到 LLM override 则 BLOCK（覆盖被拒绝）；无 override 则 vacuously true。
 *   故恒为 true（F3 deterministic kernel 不接受 LLM-as-final-judge）。
 *
 * 模型中立（F3/C1·无 qwen/dashscope/openai 字面量）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数（不 mutate input·不读 FS/网络）。
 */

import type { AntiTheaterFinding, AntiTheaterLintInput, AntiTheaterReport, DetectorFinding } from './types.ts';
import { applyVerdictConstraint } from './constraint.ts';
import { DETECTORS } from './detectors/index.ts';
import { computeAntiTheaterScore, SEAL_BLOCK_SCORE_THRESHOLD } from './score.ts';
import { assertVerifierModulesClean } from '../falsifiability/verifier_structural_gate.ts';

/**
 * 运行反剧场检测编排（§3·确定性·21 detector 顺序遍历）。
 *
 * @param input AntiTheaterLintInput（7 字段·fec/bindings/executionTrace/verdict/envelopeDraft/preregistrationRecord/runRegistry）。
 * @returns AntiTheaterReport（findings + hasFail/failCount/warnCount/llmOverrideRejected + score/canSealConfirmed/verdictConstraint）。
 */
export function runAntiTheaterLint(input: AntiTheaterLintInput): AntiTheaterReport {
  // 0. FUSION-OS-5 加载期 AST 结构门：确定性内核 + 21 detector 源码纯度自检（fail-closed·memoized）。
  assertVerifierModulesClean();
  // 1. 按 DETECTORS 顺序遍历，聚合 DetectorFinding[]。
  const detectorFindings: DetectorFinding[] = [];
  for (const detector of DETECTORS) {
    const result = detector(input);
    for (const finding of result) {
      detectorFindings.push(finding);
    }
  }

  // 2. score（§4·7 桶去重扣分·消费 fec 判 negative control 桶）。
  const antiTheaterScore = computeAntiTheaterScore(detectorFindings, input.fec);

  // 3. verdict 约束（§3.2·取严 forcedVerdict + blockSeal·消费 currentVerdict）。
  const verdictConstraint = applyVerdictConstraint(detectorFindings, input.verdict.verdict);

  // 4. 存储型 findings（取 stored·丢弃 ext 展示元数据）。
  const findings: AntiTheaterFinding[] = detectorFindings.map((df) => df.stored);
  const failCount = findings.filter((f) => f.outcome === 'FAIL').length;
  const warnCount = findings.filter((f) => f.outcome === 'WARN').length;
  const hasFail = failCount > 0;

  // 5. canSealConfirmed 三重条件（§3 + D16·forcedVerdict===undefined 才可 seal CONFIRMED）。
  const hasBlock = detectorFindings.some((df) => df.ext.severity === 'BLOCK');
  const canSealConfirmed =
    antiTheaterScore >= SEAL_BLOCK_SCORE_THRESHOLD &&
    !hasBlock &&
    verdictConstraint.forcedVerdict === undefined;

  // 6. llmOverrideRejected（缺口 #10·deterministic 保证·恒 true）。
  const llmOverrideRejected = true;

  return {
    findings,
    hasFail,
    failCount,
    warnCount,
    llmOverrideRejected,
    antiTheaterScore,
    canSealConfirmed,
    verdictConstraint,
  };
}
