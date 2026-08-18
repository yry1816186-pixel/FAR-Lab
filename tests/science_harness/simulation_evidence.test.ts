// tests/science_harness/simulation_evidence.test.ts
// EXP-SIMULATION-001：卡片 7 字段+5 证据位校验、模型内/现实分级 fail-closed、
// seed 显式性、话术门。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  SIMULATION_CARD_FIELDS,
  SIMULATION_EVIDENCE_SLOTS,
  assertNotRealWorldClaim,
  gradeSimulationEvidence,
  hasExplicitSeed,
  validateSimulationCard,
} from '../../src/science_harness/simulation_evidence.ts';
import type { SimulationCard } from '../../src/science_harness/simulation_evidence.ts';

function fullCard(): SimulationCard {
  return {
    modelEquations: 'dr/dt = alpha*r*(1 - r/K) - beta*r*I',
    parameters: 'alpha=0.42/day, beta=0.03, K=1e4',
    initialConditions: 'r(0)=350, I(0)=12',
    randomSource: 'mersenne-twister seed=20260817',
    numericalMethod: 'RK4, dt=0.01 day',
    calibrationData: 'WHO weekly reports 2019-2021, n=114 weeks',
    applicabilityDomain: 'closed populations 1e3..1e6, no spatial structure',
    referenceCases: 'sim-ref-cases.md cases 1-8 (analytic limits match)',
    convergence: 'dt halving study: solution change < 1e-6',
    sensitivity: 'Sobol indices, alpha most influential (S1=0.61)',
    seedReplay: '5 seeds x 3 replicates — summary stats stable within CI',
    misspecificationTests: 'structural-form perturbation suite B (7 alternatives rejected)',
  };
}

test('EXP-SIMULATION-001: 卡片 7 记录字段 + 5 证据位清单 + 完整卡片过校验', () => {
  assert.equal(SIMULATION_CARD_FIELDS.length, 7);
  assert.equal(SIMULATION_EVIDENCE_SLOTS.length, 5);
  const v = validateSimulationCard(fullCard());
  assert.equal(v.ok, true);
  assert.deepEqual(v.missingEvidenceSlots, []);
  assert.equal(hasExplicitSeed('mersenne-twister seed=20260817'), true);
});

test('EXP-SIMULATION-001: 缺字段/无 seed → 校验拒绝；证据位缺失如实列出（不伪造）', () => {
  const noSeed = validateSimulationCard({ ...fullCard(), randomSource: 'hardware rng' });
  assert.equal(noSeed.ok, false);
  if (!noSeed.ok) assert.ok(noSeed.problems.some((p) => p.includes('explicit seed')));

  const blank = validateSimulationCard({ ...fullCard(), modelEquations: '  ' });
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.ok(blank.problems.some((p) => p.includes('modelEquations')));

  // 缺 2 个证据位 → 校验仍 ok（字段在）但缺失清单如实
  const partial: SimulationCard = { ...fullCard(), sensitivity: null, misspecificationTests: null };
  const pv = validateSimulationCard(partial);
  assert.equal(pv.ok, true);
  assert.deepEqual([...pv.missingEvidenceSlots].sort(), ['misspecificationTests', 'sensitivity']);
});

test('EXP-SIMULATION-001: 分级——完整卡只到 SUPPORTED_MODEL_INTERNAL；缺证据位降 IN_MODEL_UNVALIDATED', () => {
  const full = gradeSimulationEvidence(fullCard(), 'model-internal');
  assert.equal(full.grade, 'SUPPORTED_MODEL_INTERNAL');
  assert.match(full.cannotProve, /inside this model/);

  const partial = gradeSimulationEvidence({ ...fullCard(), convergence: null }, 'model-internal');
  assert.equal(partial.grade, 'IN_MODEL_UNVALIDATED');
  assert.deepEqual(partial.missingEvidenceSlots, ['convergence']);

  // 卡片字段烂 + model-internal → 连模型内都不支持
  const broken = gradeSimulationEvidence({ ...fullCard(), parameters: '' }, 'model-internal');
  assert.equal(broken.grade, 'IN_MODEL_UNVALIDATED');
  assert.ok(broken.problems.length > 0);
});

test('EXP-SIMULATION-001: 现实外推 fail-closed——完整卡也不能把仿真升格为现实验证', () => {
  // 即便 7 字段 + 5 证据位全部齐全，real-world 声称仍被阻断
  const blocked = gradeSimulationEvidence(fullCard(), 'real-world');
  assert.equal(blocked.grade, 'BLOCKED_NEEDS_INDEPENDENT_EVIDENCE');
  assert.match(blocked.cannotProve, /independent evidence/);
  assert.match(blocked.cannotProve, /cannot validate real-world claims under any card completeness/);
  // 烂卡 + real-world 同样阻断（阻断优先于卡片问题）
  assert.equal(gradeSimulationEvidence({ ...fullCard(), numericalMethod: '' }, 'real-world').grade, 'BLOCKED_NEEDS_INDEPENDENT_EVIDENCE');
});

test('EXP-SIMULATION-001: 话术门——「现实验证」样式命中 + 全仿真证据 → 违规；独立证据在场或改口径 → 通过', () => {
  const simOnly = [{ ref: 'sim-card-1', kind: 'simulation' as const }];
  const flagged = assertNotRealWorldClaim('The intervention effect is real-world validated by our agent-based model.', simOnly);
  assert.equal(flagged.ok, false);
  if (!flagged.ok) assert.match(flagged.reason, /all evidence refs are simulations/);

  const chineseFlag = assertNotRealWorldClaim('该预测在现实系统验证中成立。', simOnly);
  assert.equal(chineseFlag.ok, false);

  // 有独立实证证据 → 通过
  const withField = [
    { ref: 'sim-card-1', kind: 'simulation' as const },
    { ref: 'field-trial-2025', kind: 'field-data' as const },
  ];
  assert.equal(assertNotRealWorldClaim('The effect is real-world validated.', withField).ok, true);

  // 模型内口径（不触发现实验证话术）→ 全仿真证据合法
  assert.equal(assertNotRealWorldClaim('Within this model, the effect is robust across seeds.', simOnly).ok, true);
});
