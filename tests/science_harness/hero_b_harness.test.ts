// tests/science_harness/hero_b_harness.test.ts
// 测试 hero-B-002 causal harness + F6 降级叙事（22 T-W2-06/07 · 任务 #12 决策 G）。
//
// F6 英雄叙事：M-checks 全 PASS（观测数据看似支持 → 本会 CONFIRMED）→ 叠加 ConfoundingGate FAIL
// （prior_knowledge 未测混杂）→ decideVerdictWithConfounding 降级 DEGRADED_SCOPE。
// 证 F6 阻止了本会发生的 CONFIRMED 过度声称（相关 ≠ 因果）。
//
// Authority: 22 T-W2-06/07 + 03 §7.5/§7.5.1 + 任务 #12。
// 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  HERO_B_002_CLAIM,
  HERO_B_CAUSAL_MODEL,
  HERO_B_CHECK_IDS,
  HERO_B_EVIDENCE_BASIS,
  HERO_B_EXPOSURE,
  HERO_B_OUTCOME,
  buildHeroBChecks,
} from '../../src/science_harness/hero_b_harness.ts';
import { mapChecksToVerdict } from '../../src/science_harness/tess_harness.ts';
import { decideVerdictWithConfounding } from '../../src/science_harness/confounding_integration.ts';
import { adjudicateConfounding } from '../../src/confounding_gate/adjudicate.ts';

// ===== harness：默认 measured 全 PASS → 本会 CONFIRMED（供 F6 降级演示）=====

test('hero-B: 设计 measured（全达标）→ M1-M3 全 PASS → mapChecksToVerdict CONFIRMED（本会确认）', () => {
  const checks = buildHeroBChecks({
    observedRateReduction: 0.1, // >= 0.05 PASS
    sampleSize: 300, // >= 200 PASS
    measurementValidity: 0.9, // >= 0.8 PASS
  });
  assert.ok(checks.every((c) => c.outcome === 'PASS'));
  const base = mapChecksToVerdict(checks);
  assert.equal(base.verdict, 'CONFIRMED');
  assert.equal(base.route, 'all_pass');
});

// ===== HERO_B_CAUSAL_MODEL → ConfoundingGate FAIL（prior_knowledge 未测混杂）=====

test('hero-B: HERO_B_CAUSAL_MODEL → adjudicateConfounding FAIL（prior_knowledge 后门未阻断+未测）', () => {
  const r = adjudicateConfounding(HERO_B_CAUSAL_MODEL, HERO_B_EXPOSURE, HERO_B_OUTCOME);
  assert.equal(r.outcome, 'FAIL');
  assert.deepEqual([...r.unblockedConfounders], ['prior_knowledge']);
  assert.deepEqual([...r.unmeasuredConfounders], ['prior_knowledge']);
  assert.deepEqual([...r.blockedConfounders], ['task_difficulty']); // task_difficulty ∈ Z 被阻断
  assert.equal(HERO_B_EVIDENCE_BASIS, 'observational_only');
});

// ===== F6 英雄叙事：本会 CONFIRMED → F6 FAIL 降级 DEGRADED_SCOPE =====

test('hero-B: F6 叙事——全 PASS checks（本会 CONFIRMED）+ ConfoundingGate FAIL → decideVerdictWithConfounding 降级 DEGRADED_SCOPE', () => {
  const checks = buildHeroBChecks({
    observedRateReduction: 0.1,
    sampleSize: 300,
    measurementValidity: 0.9,
  });
  const base = mapChecksToVerdict(checks);
  assert.equal(base.verdict, 'CONFIRMED'); // 前提：本会 CONFIRMED

  const confounding = adjudicateConfounding(HERO_B_CAUSAL_MODEL, HERO_B_EXPOSURE, HERO_B_OUTCOME);
  assert.equal(confounding.outcome, 'FAIL');

  // 叠加 F6 → DEGRADED_SCOPE（F6 阻止了本会发生的 CONFIRMED 过度声称）。
  const final = decideVerdictWithConfounding(base, confounding, HERO_B_EVIDENCE_BASIS);
  assert.equal(final.verdict, 'DEGRADED_SCOPE');
  assert.equal(final.route, 'scope_narrow');
  assert.ok(final.integrityFlags.includes('causal_confounding'), '须追加 causal_confounding 标志');
});

// ===== 确定性 + 常量契约 =====

test('hero-B: 确定性——同 measured 两次构造产相同 outcome 序列', () => {
  const measured = { observedRateReduction: 0.1, sampleSize: 300, measurementValidity: 0.9 };
  const a = buildHeroBChecks(measured);
  const b = buildHeroBChecks(measured);
  assert.deepEqual(
    a.map((c) => `${c.id}=${c.outcome}`),
    b.map((c) => `${c.id}=${c.outcome}`),
  );
});

test('hero-B: 常量契约（CLAIM/CHECK_IDS/exposure/outcome/evidenceBasis/DAG 结构）', () => {
  assert.ok(HERO_B_002_CLAIM.includes('causal'));
  assert.deepEqual([...HERO_B_CHECK_IDS], ['M1_observed_association', 'M2_sample_size', 'M3_measurement_validity']);
  assert.equal(HERO_B_EXPOSURE, 'cot_prompting');
  assert.equal(HERO_B_OUTCOME, 'hallucination_rate');
  // DAG 结构：4 节点 / 5 边 / controlledConfounders=[task_difficulty] / suspected=[prior_knowledge]。
  assert.equal(HERO_B_CAUSAL_MODEL.nodes.length, 4);
  assert.equal(HERO_B_CAUSAL_MODEL.edges.length, 5);
  assert.deepEqual([...HERO_B_CAUSAL_MODEL.controlledConfounders], ['task_difficulty']);
  assert.deepEqual([...HERO_B_CAUSAL_MODEL.unmeasuredConfoundersSuspected], ['prior_knowledge']);
});
