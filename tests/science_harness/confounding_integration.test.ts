// tests/science_harness/confounding_integration.test.ts
// 测试 decideVerdictWithConfounding（F6 因果门与 verdict_mapping 集成 · 任务 #12 决策 E）。
//
// 三分支（§7.5:955-961 outcome→verdict · 经 confoundingOutcomeVerdictEffect）：
//   - PASS → base 原样（none）。
//   - WARN + base CONFIRMED → INCONCLUSIVE（downgrade）。
//   - WARN + base 非 CONFIRMED → base 原样（none）。
//   - FAIL → DEGRADED_SCOPE + causal_confounding 标志（degrade）。
//
// Authority: 03 §7.5 + 任务 #12 决策 D/E。
// 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideVerdictWithConfounding } from '../../src/science_harness/confounding_integration.ts';
import type { ConfoundingGateResult, EvidenceBasis } from '../../src/confounding_gate/types.ts';
import type { VerdictMappingResult } from '../../src/science_harness/types.ts';

// ===== 辅助 fixture =====

/** 构造最小 ConfoundingGateResult（仅 outcome 有意义·其余字段占位·decideVerdictWithConfounding 只读 outcome）。 */
function gateResult(outcome: ConfoundingGateResult['outcome']): ConfoundingGateResult {
  return {
    outcome,
    unblockedConfounders: [],
    blockedConfounders: [],
    unmeasuredConfounders: outcome === 'FAIL' ? ['latent_x'] : [],
    backdoorPaths: [],
    blockedPaths: [],
    unblockedPaths: [],
    rationale: `test fixture outcome=${outcome}`,
  };
}

/** 构造 base VerdictMappingResult。 */
function base(verdict: VerdictMappingResult['verdict'], integrityFlags: readonly string[] = []): VerdictMappingResult {
  return { verdict, route: 'all_pass', integrityFlags };
}

// ===== PASS → base 原样 =====

test('decideVerdictWithConfounding: PASS → base 原样（none·不改编判）', () => {
  const b = base('CONFIRMED', ['data_resolved']);
  const out = decideVerdictWithConfounding(b, gateResult('PASS'), 'interventional');
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.route, 'all_pass');
  assert.deepEqual([...out.integrityFlags], ['data_resolved']);
});

// ===== WARN + CONFIRMED → INCONCLUSIVE（downgrade）=====

test('decideVerdictWithConfounding: WARN + base CONFIRMED → INCONCLUSIVE（route mixed·保 base flags）', () => {
  const b = base('CONFIRMED', ['data_resolved']);
  const out = decideVerdictWithConfounding(b, gateResult('WARN'), 'observational_only');
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.route, 'mixed');
  // 保 base.integrityFlags（不追加 causal_confounding·仅 FAIL 分支追加）。
  assert.deepEqual([...out.integrityFlags], ['data_resolved']);
});

// ===== WARN + 非 CONFIRMED → base 原样（none）=====

test('decideVerdictWithConfounding: WARN + base INCONCLUSIVE → base 原样（本就不会 CONFIRMED·no-op）', () => {
  const b = base('INCONCLUSIVE', []);
  const out = decideVerdictWithConfounding(b, gateResult('WARN'), 'observational_only');
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.route, 'all_pass'); // 原样·route 不改
});

// ===== FAIL → DEGRADED_SCOPE + causal_confounding =====

test('decideVerdictWithConfounding: FAIL → DEGRADED_SCOPE + causal_confounding 标志', () => {
  const b = base('CONFIRMED', ['data_resolved']);
  const out = decideVerdictWithConfounding(b, gateResult('FAIL'), 'observational_only');
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.route, 'scope_narrow');
  assert.ok(out.integrityFlags.includes('causal_confounding'));
  assert.ok(out.integrityFlags.includes('data_resolved')); // 保 base flags
});

test('decideVerdictWithConfounding: FAIL 无论 base verdict 均 DEGRADED_SCOPE（F2 优先级最高）', () => {
  // 即便 base 是 INCONCLUSIVE（非 CONFIRMED），FAIL 仍降 DEGRADED_SCOPE。
  const out = decideVerdictWithConfounding(base('INCONCLUSIVE', []), gateResult('FAIL'), 'interventional');
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
});

test('decideVerdictWithConfounding: FAIL 追加 causal_confounding 去重（base 已含则不重复）', () => {
  const b = base('CONFIRMED', ['causal_confounding']);
  const out = decideVerdictWithConfounding(b, gateResult('FAIL'), 'observational_only');
  const flags = [...out.integrityFlags];
  assert.equal(flags.filter((f) => f === 'causal_confounding').length, 1, 'causal_confounding 不得重复');
});

// ===== evidenceBasis 各值不影响 verdictEffect（仅影响 reasonCode·由 confoundingOutcomeVerdictEffect 处理）=====

test('decideVerdictWithConfounding: FAIL + interventional/mixed/n_a → 仍 DEGRADED_SCOPE（evidenceBasis 不改 verdict）', () => {
  const b = base('CONFIRMED', []);
  for (const eb of ['interventional', 'mixed', 'n_a'] as EvidenceBasis[]) {
    const out = decideVerdictWithConfounding(b, gateResult('FAIL'), eb);
    assert.equal(out.verdict, 'DEGRADED_SCOPE', `${eb} 应仍降 DEGRADED_SCOPE`);
  }
});
