/**
 * detect_fake_degraded —— AT-FAKE-DEGRADED 检测器（fake degraded scope 攻击）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_fake_degraded 伪代码）+
 *            03 §7.4 evaluate_scope（ScopeReport.hasSameScopeRefutation）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：确定性 / 误报率=0 / 不用 LLM-as-judge）。
 *
 * 攻击语义：研究者把本应"REFUTED"（或被同 scope 反证压住）的结论伪装成"DEGRADED_SCOPE"，
 *           借 scope 降级之名行回避反证之实；同时把预登记的 null result（阴性结果）从
 *           ProofEnvelope 中悄悄隐去（不入 proofHash），让已声明的阴性结果对最终裁决"消失"。
 *           本检测确定性捕获两类 fake-degraded 攻击：
 *             1) REFUTATION_HIDDEN_BY_SCOPE —— verdict 已判 DEGRADED_SCOPE，但 scopeReport
 *                同时存在同 scope 反证（hasSameScopeRefutation=true）：真正的反证被 scope 降级掩盖。
 *             2) NULL_RESULT_LAUNDERED —— runRegistry.declaredNullResults 中声明的某个 null result
 *                既未出现在 envelopeDraft.nullResults（未 sealed），也未 enteredProofHash
 *                （未进 proofHash）：预登记的阴性结果被洗掉。
 *
 * 适配裁决 D4（VKO 无 proofChecks/verdictNodes/hasDirectRefutation·APPENDIX_E 伪代码字段对齐）：
 *   - input.verdict.hasDirectRefutation → input.verdict.scopeReport.hasSameScopeRefutation
 *     （同 scope 且越过 refutation 阈值的矛盾证据存在）。
 *   - 子路径 1：verdict.verdict === 'DEGRADED_SCOPE' 且 scopeReport.hasSameScopeRefutation === true
 *       → outcome='FAIL' reasonCode='REFUTATION_HIDDEN_BY_SCOPE'
 *       （findingIdSuffix='-HIDDEN_REFUTATION'，affected=['verdictTrace.verdict']）。
 *   - 子路径 2：对 runRegistry.declaredNullResults 中每个 declared null，
 *       若其 nullResultId 不在 envelopeDraft.nullResults[*].nullResultId 的 sealed 集合中，
 *       且该 declared null 的 enteredProofHash === false → outcome='FAIL'
 *       reasonCode='NULL_RESULT_LAUNDERED'
 *       （findingIdSuffix=`-NULL_${nr.nullResultId}`，affected=[`nullResults[${nr.nullResultId}]`]）。
 *
 * 安全保证（承诺误报率=0）：
 *   - 纯函数 / 确定性 / 不 mutate input / 不读 FS / 不联网。
 *   - 子路径 1 仅当 verdict 字面量 === 'DEGRADED_SCOPE' 且 scopeReport 显式 hasSameScopeRefutation=true
 *     时才 FAIL；两者任一不满足即放行。
 *   - 子路径 2 仅当 declared null 的 enteredProofHash 显式 === false（预登记方已声明"未入 proofHash"）
 *     且该 id 确实不在 sealed 集合时才 FAIL；两个确定性集合/布尔判定，无启发式。
 *   - 不依赖 LLM 判断（F3）；reasonCode 由确定性字段精确比较产出。
 *
 * 模型中立：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测 fake degraded scope 攻击（AT-FAKE-DEGRADED）。
 *
 * list 型 detector：最多产出（1 + N）条 FAIL finding
 *   - 1 条 REFUTATION_HIDDEN_BY_SCOPE（子路径 1 命中时）。
 *   - N 条 NULL_RESULT_LAUNDERED（每个被洗掉的 declared null 一条，N ≤ declaredNullResults.length）。
 * 用 findingIdSuffix 区分（-HIDDEN_REFUTATION / -NULL_${nullResultId}）。无发现返回 []。
 *
 * @param input anti-theater lint 输入（消费 input.verdict.verdict / input.verdict.scopeReport /
 *              input.runRegistry.declaredNullResults / input.envelopeDraft.nullResults）
 * @returns 命中的 DetectorFinding 列表或空数组（未命中）
 */
export function detect_fake_degraded(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  // —— 子路径 1：REFUTATION_HIDDEN_BY_SCOPE（D4·hasDirectRefutation → scopeReport.hasSameScopeRefutation）——
  // verdict 字面量精确匹配 'DEGRADED_SCOPE' 且同 scope 反证存在 → 反证被 scope 降级掩盖。
  if (input.verdict.verdict === 'DEGRADED_SCOPE' && input.verdict.scopeReport.hasSameScopeRefutation) {
    findings.push(
      makeFinding({
        attackId: 'AT-FAKE-DEGRADED',
        outcome: 'FAIL',
        reasonCode: 'REFUTATION_HIDDEN_BY_SCOPE',
        evidenceRef: 'verdictTrace.verdict',
        message:
          `Fake degraded scope detected: verdict.verdict='DEGRADED_SCOPE' while a same-scope ` +
          `refutation exists (scopeReport.hasSameScopeRefutation=true). The refutation is hidden ` +
          `behind a degraded-scope verdict instead of being surfaced.`,
        affectedProofHashInputs: ['verdictTrace.verdict'],
        remediation:
          'Surface the same-scope refutation and route the verdict through the refutation path; ' +
          'do not seal a DEGRADED_SCOPE verdict that masks a same-scope refutation.',
        findingIdSuffix: 'HIDDEN_REFUTATION',
      }),
    );
  }

  // —— 子路径 2：NULL_RESULT_LAUNDERED ——
  // declared_nulls = input.runRegistry.declaredNullResults（空数组兜底）。
  // sealed_nulls = set(input.envelopeDraft.nullResults.map(n => n.nullResultId))。
  // 每个 declared null：nullResultId 不在 sealed 集合 且 enteredProofHash === false → 被洗掉。
  const declaredNulls = input.runRegistry.declaredNullResults ?? [];
  const sealedNullIds = new Set<string>(
    input.envelopeDraft.nullResults.map((nr) => nr.nullResultId),
  );

  for (const nr of declaredNulls) {
    if (!sealedNullIds.has(nr.nullResultId) && !nr.enteredProofHash) {
      findings.push(
        makeFinding({
          attackId: 'AT-FAKE-DEGRADED',
          outcome: 'FAIL',
          reasonCode: 'NULL_RESULT_LAUNDERED',
          evidenceRef: input.envelopeDraft.envelopeId,
          message:
            `Declared null result '${nr.nullResultId}' (testId='${nr.testId}', reason='${nr.reason}') ` +
            `is absent from envelopeDraft.nullResults and has enteredProofHash=false; ` +
            `a pre-registered null result is being laundered out of the proof envelope.`,
          affectedProofHashInputs: [`nullResults[${nr.nullResultId}]`],
          remediation:
            `Enter the declared null result '${nr.nullResultId}' into the proof envelope ` +
            `(set enteredProofHash=true / include in nullResults) before sealing; do not omit ` +
            `pre-registered null results from the sealed envelope.`,
          findingIdSuffix: `NULL_${nr.nullResultId}`,
        }),
      );
    }
  }

  return findings;
}
