/**
 * V1 claim fixture roadmap 诚实清单测试（evo-03 · 22 T-W2-06 三 claimType · 任务 #12 三覆盖）。
 *
 * 反 DO_NOT_CLAIM：断言 V1 三 claimType 全交付（3 delivered），每 fixture 对应正确 claimType，
 * 且无第 4 claimType 偷渡。防止「声称 N 交付 M<N」过度声称，亦防「偷渡额外 claimType」
 * （33 FP3-ENG-GPU-005 honesty_risk）。
 *
 * Authority: 22 T-W2-06 + 21 §8 + 33 FP3-ENG-GPU-005 + 任务 #12。
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  V1_CLAIM_FIXTURE_ROADMAP,
  countDeliveredV1ClaimFixtures,
} from '../../src/science_harness/claim_fixtures.ts';

test('evo-03: V1 delivers all 3 claimType (existence/quantitative/causal)', () => {
  // V1 实际交付 = 3（任务 #12 三覆盖）。22 T-W2-06 三 claimType 全交付。
  assert.equal(countDeliveredV1ClaimFixtures(), 3);
  const delivered = V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'delivered');
  assert.equal(delivered.length, 3);

  // 每 fixtureId 对应正确 claimType。
  const byId = new Map(delivered.map((e) => [e.fixtureId, e.claimType]));
  assert.equal(byId.get('C-ASTRO-0001'), 'existence');
  assert.equal(byId.get('hero-A-001'), 'quantitative');
  assert.equal(byId.get('hero-B-002'), 'causal');

  // 全部 delivered 的 fixture reason===null（无残留「未实现」理由·诚实落地）。
  for (const e of delivered) {
    assert.equal(e.reason, null, `${e.fixtureId} delivered 但 reason 非 null（残留未实现标注）`);
  }
});

test('evo-03: 无 not_implemented 残留·无第 4 claimType 偷渡', () => {
  // 全部 delivered（任务 #12 后无 not_implemented 残留）。
  const notImpl = V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'not_implemented');
  assert.equal(notImpl.length, 0);

  // claimType 集合 = 恰好 {existence, quantitative, causal}（无第 4 偷渡）。
  const claimTypes = new Set(V1_CLAIM_FIXTURE_ROADMAP.map((e) => e.claimType));
  assert.deepEqual([...claimTypes].sort(), ['causal', 'existence', 'quantitative']);
  assert.equal(V1_CLAIM_FIXTURE_ROADMAP.length, 3);
});

test('evo-03: roadmap covers all 3 claimType per 22 T-W2-06 (existence/quantitative/causal)', () => {
  const claimTypes = new Set(V1_CLAIM_FIXTURE_ROADMAP.map((e) => e.claimType));
  assert.ok(claimTypes.has('existence'));
  assert.ok(claimTypes.has('quantitative'));
  assert.ok(claimTypes.has('causal'));
  assert.equal(V1_CLAIM_FIXTURE_ROADMAP.length, 3);
});
