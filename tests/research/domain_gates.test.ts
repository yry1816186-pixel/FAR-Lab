// tests/research/domain_gates.test.ts
// 领域门禁注册表 —— 判定语义与 experiment.ts 原 isExoplanetApplicable 等价迁移
// （行为不变回归）+ 注册表泛化形态（多领域路由基础）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOMAIN_GATES, matchingDomain } from '../../src/research/domain_gates.ts';

test('registry: exoplanet gate registered with ≥2 term-hit semantics', () => {
  const gate = DOMAIN_GATES.find((g) => g.domain === 'exoplanet');
  assert.ok(gate, 'exoplanet gate registered');
  assert.ok(gate.terms.includes('exoplanet'));
  assert.ok(gate.hints.includes('astro'));
  assert.equal(gate.minTermHits, 2, 'single loose hit must NOT suffice (2026-08-14 defect)');
});

test('matchingDomain: astro domain hint → exoplanet', () => {
  assert.equal(matchingDomain('astrophysics', 'unrelated text'), 'exoplanet');
  assert.equal(matchingDomain('exoplanet research', 'x'), 'exoplanet');
});

test('matchingDomain: two keyword hits without domain hint → exoplanet', () => {
  assert.equal(matchingDomain(null, 'Do hot Jupiters show radius inflation with insolation?'), 'exoplanet');
});

test('matchingDomain: one loose hit is NOT enough (diabetes refusal preserved)', () => {
  // 单一 "period"/"radius" 类宽松命中 → 不适用（糖尿病/NLP run 拒绝嫁接 exoplanet 分析）。
  assert.equal(matchingDomain(null, 'diabetes patients measured over a 6-month period'), null);
  assert.equal(matchingDomain(null, 'radius of a circle'), null);
});

test('matchingDomain: empty/null scope and text → null (no domain)', () => {
  assert.equal(matchingDomain(null, ''), null);
  assert.equal(matchingDomain(undefined, '   '), null);
});

test('matchingDomain: term matching is case-insensitive', () => {
  assert.equal(matchingDomain(null, 'Exoplanet transits observed in Hot Jupiter systems'), 'exoplanet');
});
