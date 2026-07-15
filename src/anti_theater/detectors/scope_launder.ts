/**
 * detect_scope_launder —— AT-SCOPE-LAUNDER 检测器（scope laundering 攻击）。
 *
 * 攻击语义：实验证据 scope 被悄悄收窄（claim 是全局，但只在子集上验证），
 *           借此回避同 scope 反证或把未覆盖包装成"已验证"。本检测器在 anti-theater
 *           前置 verdict 的 scopeReport 上做确定性判断，把降级 scope 拉回可见。
 *
 * 适配裁决 D4（VKO 无 proofChecks/verdictNodes/hasDirectRefutation·APPENDIX_E 伪代码字段对齐）：
 *   - scope.isStrictSubset(claim.scope) → verdict.scopeReport.coverage !== 'full'
 *     （即 'partial' / 'none'：scope 窄于 claim，或完全无有效覆盖）。
 *   - verdict.hasDirectRefutation → verdict.scopeReport.hasSameScopeRefutation
 *     （同 scope 且越过 refutation 阈值的矛盾证据存在）。
 *   - coverage === 'full' → 无发现（[]）。
 *   - coverage !== 'full' 且 hasSameScopeRefutation=true → outcome='FAIL'
 *       reasonCode='REFUTATION_HIDDEN_BY_SCOPE'（affected=['verdictTrace.verdict']）。
 *       反证优先级最高（03 §6）：即使 verdict 已是 DEGRADED_SCOPE，反证也必须升至 REFUTED。
 *   - coverage !== 'full' 且 hasSameScopeRefutation=false 且 verdict='CONFIRMED' → outcome='FAIL'
 *       reasonCode='SCOPE_LAUNDERED'（affected=['verdictTrace.scopeReport']）。
 *       overclaim theater：claim 全局但证据仅覆盖子集，kernel 仍封 CONFIRMED。
 *   - coverage !== 'full' 且 hasSameScopeRefutation=false 且 verdict≠'CONFIRMED' → 无发现（[]）。
 *       honest degrade：kernel 已产 DEGRADED_SCOPE/REFUTED/INCONCLUSIVE/UNTESTED，APPENDIX_E §2
 *       expectedVerdict=DEGRADED_SCOPE 目标已达成——overclaim 不存在 → 非 theater → 放行。
 *       R4 路径（verdict_kernel_v2.ts:285）必然同时产 coverage='partial'（evaluateScope line 449），
 *       此分支避免对诚实 R4 降级误报（承诺误报率=0 基准）。
 *
 * honest-degrade 修复（对齐 APPENDIX_E §2 设计意图 line 461/464 expectedVerdict=DEGRADED_SCOPE）：
 *   原实现「coverage!=='full' 一律 FAIL」是 D4 适配对 isStrictSubset 的过度收窄——R4 诚实降级
 *   被 verdict 二级分流前的实现误判为 theater。修复后仅 overclaim（CONFIRMED+partial）触发 FAIL。
 *
 * 安全保证（承诺误报率=0）：
 *   - 纯函数 / 确定性 / 不 mutate input / 不读 FS / 不联网。
 *   - 仅当 scopeReport 明确声明 coverage 非全量时才 FAIL；coverage='full' 一律放行。
 *   - 不依赖 LLM 判断（F3）；reasonCode 由 coverage + hasSameScopeRefutation 两布尔确定。
 *
 * 模型中立：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测 scope laundering 攻击。
 *
 * @param input anti-theater lint 输入（消费 input.verdict.scopeReport + input.verdict.verdict）。
 * @returns 单个 FAIL finding（coverage 非全量且 overclaim/refutation-hidden 时）或空数组
 *          （coverage 全量·或 kernel 已诚实降级 DEGRADED_SCOPE/REFUTED/INCONCLUSIVE/UNTESTED）。
 */
export function detect_scope_launder(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const scope = input.verdict.scopeReport;

  // coverage === 'full' → 证据完整覆盖 claim scope，无 laundering 风险，放行。
  if (scope.coverage === 'full') {
    return [];
  }

  // coverage !== 'full'（'partial' / 'none'）→ scope 被收窄或无覆盖。
  // 二级分流：是否存在被 scope 收窄"藏起来"的同 scope 反证。
  if (scope.hasSameScopeRefutation) {
    // 同 scope 反证存在却被降级 scope 掩盖 → 最严重的 laundering 形态。
    return [
      makeFinding({
        attackId: 'AT-SCOPE-LAUNDER',
        outcome: 'FAIL',
        reasonCode: 'REFUTATION_HIDDEN_BY_SCOPE',
        evidenceRef: 'verdictTrace.verdict',
        message:
          `Scope laundering detected: verdict.scopeReport.coverage='${scope.coverage}' ` +
          `(narrower than claim scope) while a same-scope refutation exists ` +
          `(hasSameScopeRefutation=true). The refutation is hidden behind a degraded scope.`,
        affectedProofHashInputs: ['verdictTrace.verdict'],
        remediation:
          'Restore full-scope evidence coverage or explicitly acknowledge the refutation; ' +
          'do not seal a CONFIRMED verdict over a scope that hides a same-scope refutation.',
      }),
    ];
  }

  // coverage 非全量 + 无同 scope 反证：判断 kernel 是否已诚实降级。
  // 仅 verdict='CONFIRMED'（overclaim：claim 全局但证据仅覆盖子集，kernel 仍封 CONFIRMED）才 FAIL。
  // verdict 已诚实降级（DEGRADED_SCOPE/REFUTED/INCONCLUSIVE/UNTESTED）→ 放行（honest degrade）：
  //   APPENDIX_E §2 expectedVerdict=DEGRADED_SCOPE 目标已达成，overclaim 不存在 → 非 theater。
  //   R4 路径（verdict_kernel_v2.ts:285）必然产 coverage='partial'（evaluateScope line 449）——
  //   若此处仍 FAIL，则任何走 R4 的合法 e2e 用例都会被误判 theater（违反承诺误报率=0）。
  if (input.verdict.verdict === 'CONFIRMED') {
    return [
      makeFinding({
        attackId: 'AT-SCOPE-LAUNDER',
        outcome: 'FAIL',
        reasonCode: 'SCOPE_LAUNDERED',
        evidenceRef: 'verdictTrace.scopeReport',
        message:
          `Scope laundering detected: verdict.scopeReport.coverage='${scope.coverage}' ` +
          `(narrower than claim scope) while verdict='CONFIRMED'. Evidence does not cover the ` +
          `full claimed scope; the supported scope is smaller than declared (overclaim theater).`,
        affectedProofHashInputs: ['verdictTrace.scopeReport'],
        remediation:
          'Either narrow the claim to match the supported scope, or provide additional evidence ' +
          'covering the missing scope edges before sealing a CONFIRMED verdict.',
      }),
    ];
  }

  // verdict 已诚实降级（DEGRADED_SCOPE/REFUTED/INCONCLUSIVE/UNTESTED）→ 非 theater → 放行。
  return [];
}
