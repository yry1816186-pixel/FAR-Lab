/**
 * detect_scope_launder —— AT-SCOPE-LAUNDER 检测器（scope laundering 攻击）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_scope_launder 伪代码）+
 *            03 §7.4 evaluate_scope（ScopeReport.coverage / hasSameScopeRefutation）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：误报率=0 / 反 LLM-as-judge）。
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
 *   - coverage !== 'full' 且 hasSameScopeRefutation=true → outcome='FAIL'
 *       reasonCode='REFUTATION_HIDDEN_BY_SCOPE'（affected=['verdictTrace.verdict']）。
 *   - coverage !== 'full' 且 hasSameScopeRefutation=false → outcome='FAIL'
 *       reasonCode='SCOPE_LAUNDERED'（affected=['verdictTrace.scopeReport']）。
 *   - coverage === 'full' → 无发现（[]）。
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
 * @param input anti-theater lint 输入（消费 input.verdict.scopeReport）。
 * @returns 单个 FAIL finding（coverage 非全量时）或空数组（coverage 全量时）。
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

  // coverage 非全量但无同 scope 反证 → 单纯的 scope 收窄（claim 过宽 / 证据不足）。
  return [
    makeFinding({
      attackId: 'AT-SCOPE-LAUNDER',
      outcome: 'FAIL',
      reasonCode: 'SCOPE_LAUNDERED',
      evidenceRef: 'verdictTrace.scopeReport',
      message:
        `Scope laundering detected: verdict.scopeReport.coverage='${scope.coverage}' ` +
        `(narrower than claim scope). Evidence does not cover the full claimed scope; ` +
        `the supported scope is smaller than declared.`,
      affectedProofHashInputs: ['verdictTrace.scopeReport'],
      remediation:
        'Either narrow the claim to match the supported scope, or provide additional evidence ' +
        'covering the missing scope edges before sealing.',
    }),
  ];
}
