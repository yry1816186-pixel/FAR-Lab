// tests/anti_theater/scope_launder_honest_degrade.test.ts
//
// scope_launder detector honest-degrade 单元测试:FUSION-OS-1 c_astro follow-up 期间发现的
// 误报 bug 物证。原实现「coverage!=='full' 一律 FAIL」对 R4 诚实降级路径误报——R4
// (verdict_kernel_v2.ts:285)必然产 coverage='partial'(evaluateScope line 449),原实现对任何
// 走 R4 的合法 e2e 用例都误判 theater。修复后:仅 verdict='CONFIRMED'+partial 才 FAIL(overclaim),
// 已降级(DEGRADED_SCOPE/REFUTED/INCONCLUSIVE/UNTESTED)+partial → 放行(honest degrade)。
//
// Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2 AT-SCOPE-LAUNDER(line 461/464
//   expectedVerdict=DEGRADED_SCOPE·设计意图是"把 verdict 推到 DEGRADED_SCOPE",kernel 已降级则目标达成)
//   + src/anti_theater/detectors/scope_launder.ts(D4 适配裁决 + honest-degrade verdict 二级分流)。
//
// RED→GREEN 物证:honest_degraded_scope_partial_pass 用例在修复前(coverage!=='full' 一律 FAIL)产
// SCOPE_LAUNDERED FAIL,修复后(verdict 二级分流)放行——证明 R4 诚实降级不再被误报 theater。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detect_scope_launder } from '../../src/anti_theater/detectors/scope_launder.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import type { AntiTheaterLintInput } from '../../src/anti_theater/types.ts';
import type { VerdictKernelOutput } from '../../src/falsifiability/verdict_kernel_v2.ts';

type FiveValueVerdict = VerdictKernelOutput['verdict'];
type ScopeCoverage = VerdictKernelOutput['scopeReport']['coverage'];

/**
 * 不可变构造:base + 覆盖 verdict.verdict / scopeReport.coverage / scopeReport.hasSameScopeRefutation。
 * 铁律 #10(不可变操作):spread 构造新对象,不 mutate base。
 */
function inputWithScope(
  base: AntiTheaterLintInput,
  options: {
    verdict?: FiveValueVerdict;
    coverage?: ScopeCoverage;
    hasSameScopeRefutation?: boolean;
  },
): AntiTheaterLintInput {
  return {
    ...base,
    verdict: {
      ...base.verdict,
      ...(options.verdict !== undefined ? { verdict: options.verdict } : {}),
      scopeReport: {
        ...base.verdict.scopeReport,
        ...(options.coverage !== undefined ? { coverage: options.coverage } : {}),
        ...(options.hasSameScopeRefutation !== undefined
          ? { hasSameScopeRefutation: options.hasSameScopeRefutation }
          : {}),
      },
    },
  };
}

const BASE = makeCleanBaseInput();

test('base_full_coverage_no_finding: coverage=full → [] (base 不变·误报率=0 基准)', () => {
  const findings = detect_scope_launder(BASE);
  assert.equal(findings.length, 0);
});

test('overclaim_confirmed_partial_fail: verdict=CONFIRMED + partial → FAIL SCOPE_LAUNDERED (overclaim theater 保留)', () => {
  // gv-scope-launder-01 形态:claim 全局但证据子集,kernel 仍封 CONFIRMED → overclaim theater。
  const input = inputWithScope(BASE, { verdict: 'CONFIRMED', coverage: 'partial' });
  const findings = detect_scope_launder(input);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.stored.outcome, 'FAIL');
  assert.equal(findings[0]?.stored.attackKind, 'scope-laundering');
  assert.equal(findings[0]?.ext.reasonCode, 'SCOPE_LAUNDERED');
});

test('honest_degraded_scope_partial_pass: verdict=DEGRADED_SCOPE + partial → [] (RED→GREEN·R4 诚实降级不再误报)', () => {
  // c_astro cached_fixture / 任何 R4 路径形态:kernel 已诚实降级,overclaim 不存在 → 非 theater。
  // 修复前(coverage!=='full' 一律 FAIL):此用例 FAIL(SCOPE_LAUNDERED)→ R4 e2e 误报 theater。
  // 修复后(verdict 二级分流):DEGRADED_SCOPE + partial → 放行。
  const input = inputWithScope(BASE, { verdict: 'DEGRADED_SCOPE', coverage: 'partial' });
  const findings = detect_scope_launder(input);
  assert.equal(
    findings.length,
    0,
    'DEGRADED_SCOPE + partial must pass (honest degrade, not theater); ' +
      'non-empty findings indicate the over-narrow D4 adaptation regressed',
  );
});

test('honest_lower_support_partial_pass: verdict=REFUTED/INCONCLUSIVE/UNTESTED + partial → [] (更低支持度更非 theater)', () => {
  // SUPPORT_RANK: REFUTED(0) < UNTESTED(1) < INCONCLUSIVE(2) < DEGRADED_SCOPE(3) < CONFIRMED(4)。
  // 比 DEGRADED_SCOPE 更低支持度的 verdict + partial 更不可能是 overclaim → 一律放行。
  const lowerSupport: readonly FiveValueVerdict[] = ['REFUTED', 'INCONCLUSIVE', 'UNTESTED'];
  for (const verdict of lowerSupport) {
    const input = inputWithScope(BASE, { verdict, coverage: 'partial' });
    const findings = detect_scope_launder(input);
    assert.equal(
      findings.length,
      0,
      `verdict=${verdict} + partial must pass (honest, lower support than DEGRADED_SCOPE)`,
    );
  }
});

test('refutation_hidden_always_fail: hasSameScopeRefutation=true + partial → FAIL REFUTATION_HIDDEN_BY_SCOPE (反证优先级最高·即使已降级)', () => {
  // 反证优先(03 §6):即使 verdict 已是 DEGRADED_SCOPE,同 scope 反证也必须升至 REFUTED。
  const input = inputWithScope(BASE, {
    verdict: 'DEGRADED_SCOPE',
    coverage: 'partial',
    hasSameScopeRefutation: true,
  });
  const findings = detect_scope_launder(input);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.stored.outcome, 'FAIL');
  assert.equal(findings[0]?.ext.reasonCode, 'REFUTATION_HIDDEN_BY_SCOPE');
});
