/**
 * V1 claim fixture roadmap 诚实清单测试（evo-03 · 22 T-W2-06 三 claimType）。
 *
 * 反 DO_NOT_CLAIM：断言 V1 只交付 C-ASTRO-0001 existence，hero-A/hero-B 诚实标 not_implemented。
 * 防止「声称 3 claimType 交付 1」过度声称（33 FP3-ENG-GPU-005 honesty_risk）。
 *
 * Authority: 22 T-W2-06 + 21 §8 + 33 FP3-ENG-GPU-005。
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  V1_CLAIM_FIXTURE_ROADMAP,
  countDeliveredV1ClaimFixtures,
} from '../../src/science_harness/claim_fixtures.ts';

test('evo-03: V1 delivers only C-ASTRO-0001 existence (not 3 claimType)', () => {
  // V1 实际交付 = 1（仅 existence）。22 T-W2-06 三 claimType 是 roadmap，未全交付。
  assert.equal(countDeliveredV1ClaimFixtures(), 1);
  const delivered = V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'delivered');
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0]!.fixtureId, 'C-ASTRO-0001');
  assert.equal(delivered[0]!.claimType, 'existence');
});

test('evo-03: hero-A (quantitative) + hero-B (causal) honestly marked not_implemented', () => {
  const notImpl = V1_CLAIM_FIXTURE_ROADMAP.filter((e) => e.v1Status === 'not_implemented');
  assert.equal(notImpl.length, 2);
  const heroA = notImpl.find((e) => e.fixtureId === 'hero-A-001');
  const heroB = notImpl.find((e) => e.fixtureId === 'hero-B-002');
  assert.ok(heroA, 'hero-A-001 should be in roadmap');
  assert.ok(heroB, 'hero-B-002 should be in roadmap');
  assert.equal(heroA!.claimType, 'quantitative');
  assert.equal(heroB!.claimType, 'causal');
  // 未实现 fixture 必有 reason（诚实标注，非假装覆盖）。
  assert.ok(heroA!.reason !== null);
  assert.ok(heroB!.reason !== null);
  // hero-B 依赖 T-W2-07 ConfoundingGate（V1 未实现）。
  assert.ok(heroB!.reason!.includes('T-W2-07'));
});

test('evo-03: roadmap covers all 3 claimType per 22 T-W2-06 (existence/quantitative/causal)', () => {
  const claimTypes = new Set(V1_CLAIM_FIXTURE_ROADMAP.map((e) => e.claimType));
  assert.ok(claimTypes.has('existence'));
  assert.ok(claimTypes.has('quantitative'));
  assert.ok(claimTypes.has('causal'));
  assert.equal(V1_CLAIM_FIXTURE_ROADMAP.length, 3);
});
