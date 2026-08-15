/**
 * FEC V2 mandate gate 单测（03 §2.3 fail-closed 降级 + CI 阻断）。
 *
 * 覆盖：
 *   1. 编译通过 → allowed=true。
 *   2. HARD_FAIL_UNTESTED → allowed=false, verdict=UNTESTED, ciBlocked=false（F1 反 theater）。
 *   3. LLM_FROZEN（CI_BLOCK）→ allowed=false, ciBlocked=true（§2.3 禁静默吞 LLM-as-judge）。
 *   4. allowed=true 时 verdict=fallbackVerdict 占位。
 *   5. assertFecGate：ciBlocked 时 throw，否则不 throw。
 *
 * 权威：。零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFec } from '../../src/fec/compiler.ts';
import { assertFecGate, enforceFecMandatoryGate } from '../../src/fec/fec_mandate.ts';
import { makeValidFec } from './fixtures.ts';

test('enforceFecMandatoryGate: 编译通过 → allowed=true, ciBlocked=false', () => {
  const result = compileFec({ fec: makeValidFec() });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, true);
  assert.equal(decision.ciBlocked, false);
});

test('enforceFecMandatoryGate: HARD_FAIL_UNTESTED → allowed=false, verdict=UNTESTED（F1 反 theater）', () => {
  const result = compileFec({ fec: makeValidFec({ measurableImplication: '' }) });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.verdict, 'UNTESTED');
  assert.equal(decision.ciBlocked, false);
  assert.ok(decision.reason.includes('FEC_NOT_COMPILABLE'), 'reason 须含 reasonCode');
});

test('enforceFecMandatoryGate: LLM_FROZEN → ciBlocked=true（03 §2.3 CI 阻断）', () => {
  // 测试专用：构造非法 frozenBy 绕过字面量类型（frozenBy 字段是 'deterministic_freezer' 字面量）。
  // 单层窄断言配注释：此处刻意制造 LLM_FROZEN 触发条件，非生产代码。
  const fec = makeValidFec();
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const result = compileFec({ fec: tampered });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.ciBlocked, true);
  assert.ok(decision.reason.includes('LLM_FROZEN'));
});

test('enforceFecMandatoryGate: 多个 HARD_FAIL 中含 LLM_FROZEN → ciBlocked=true（取最严）', () => {
  const fec = makeValidFec({ measurableImplication: '' }); // 叠加 #1 FEC_NOT_COMPILABLE
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const result = compileFec({ fec: tampered });
  const decision = enforceFecMandatoryGate(result);
  // 任一 CI_BLOCK error → ciBlocked=true（§2.3：LLM_FROZEN 优先阻断）。
  assert.equal(decision.ciBlocked, true);
});

test('enforceFecMandatoryGate: allowed=true 时 verdict=fallbackVerdict 占位（交 kernel 覆盖）', () => {
  const result = compileFec({ fec: makeValidFec() });
  const decision = enforceFecMandatoryGate(result, 'INCONCLUSIVE');
  assert.equal(decision.allowed, true);
  assert.equal(decision.verdict, 'INCONCLUSIVE');
});

test('assertFecGate: ciBlocked 时 throw（CI 入口阻断）', () => {
  const fec = makeValidFec();
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const decision = enforceFecMandatoryGate(compileFec({ fec: tampered }));
  assert.throws(() => assertFecGate(decision), /LLM_FROZEN/);
});

test('assertFecGate: 非 ciBlocked 不 throw', () => {
  const decision = enforceFecMandatoryGate(compileFec({ fec: makeValidFec() }));
  assert.doesNotThrow(() => assertFecGate(decision));
});

test('enforceFecMandatoryGate: HARD_FAIL_UNTESTED 不被 ciBlocked（仅 LLM_FROZEN 阻断）', () => {
  const result = compileFec({ fec: makeValidFec({ scope: { ...makeValidFec().scope, population: '' } }) });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.ciBlocked, false); // SCOPE_UNBOUNDED 是 UNTESTED 非 CI_BLOCK
  assert.equal(decision.verdict, 'UNTESTED');
});
