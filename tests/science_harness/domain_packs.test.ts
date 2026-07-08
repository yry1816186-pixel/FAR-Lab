// tests/science_harness/domain_packs.test.ts
// 测 4 新 DomainPack harness（protein/catalyst/carbon/seismic）的 F8 预登记检验 + verdict_mapping。
// 每域期望 verdict 与其 demo seed 一致（B7 REFUTED / C3 DEGRADED_SCOPE / E2 CONFIRMED / G5 UNTESTED）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProteinChecks,
  mapProteinChecksToVerdict,
  B7_PROTEIN_DEFAULT_THRESHOLDS,
} from '../../src/science_harness/protein_harness.ts';
import {
  buildCatalystChecks,
  mapCatalystChecksToVerdict,
} from '../../src/science_harness/catalyst_harness.ts';
import {
  buildCarbonChecks,
  mapCarbonChecksToVerdict,
} from '../../src/science_harness/carbon_harness.ts';
import {
  buildSeismicChecks,
  mapSeismicChecksToVerdict,
} from '../../src/science_harness/seismic_harness.ts';

test('B7 protein: 实测 < 声称阈值 0.85 → WARN/FAIL → REFUTED (forceFail refute)', () => {
  // 实测 ΔG r=0.72 < 0.85 声称阈值 → WARN（不达声称）。
  const checks = buildProteinChecks({
    deltaGPearson: 0.72,
    tmScore: 0.41,
    top1Ranking: 0.58,
  });
  // 全 WARN（均不达声称阈值）→ mixed → INCONCLUSIVE；显式 refute 一项 → any_refute → REFUTED。
  assert.equal(checks.length, 3);
  assert.equal(checks[0]!.outcome, 'WARN'); // 0.72 < 0.85
  const refutedChecks = buildProteinChecks(
    { deltaGPearson: 0.72, tmScore: 0.41, top1Ranking: 0.58 },
    { forceOutcomes: { M1_deltaG_pearson: 'FAIL' } },
  );
  const v = mapProteinChecksToVerdict(refutedChecks);
  assert.equal(v.verdict, 'REFUTED');
  assert.equal(v.route, 'any_refute');
});

test('B7 protein: 阈值 F8 预登记锁（claim 声称值不可事后移动）', () => {
  assert.equal(B7_PROTEIN_DEFAULT_THRESHOLDS.M1_deltaG_pearson.value, 0.85);
  assert.equal(B7_PROTEIN_DEFAULT_THRESHOLDS.M1_deltaG_pearson.op, '>=');
  assert.equal(B7_PROTEIN_DEFAULT_THRESHOLDS.M2_tm_score.value, 0.5);
});

test('C3 catalyst: 全集 MAPE>0.15 + SAC 子集 PASS → scope_narrow → DEGRADED_SCOPE', () => {
  // 全集 MAPE 0.28 > 0.15（WARN），SAC 子集 0.11 ≤ 0.15（PASS），外推 0.3 < 0.8（WARN）。
  const checks = buildCatalystChecks({
    mapeFullSet: 0.28,
    mapeSacSubset: 0.11,
    extrapolationFraction: 0.3,
  });
  assert.equal(checks[0]!.outcome, 'WARN'); // full-set fails
  assert.equal(checks[1]!.outcome, 'PASS'); // SAC-only passes
  // scope_narrow 标志 → DEGRADED_SCOPE（声称仅在窄子集成立·scope laundering 反 theater）。
  const v = mapCatalystChecksToVerdict(checks, ['scope_narrow']);
  assert.equal(v.verdict, 'DEGRADED_SCOPE');
  assert.equal(v.route, 'scope_narrow');
});

test('C3 catalyst: 无 scope_narrow 标志时 mixed（部分 WARN）→ INCONCLUSIVE（不自动降级）', () => {
  const checks = buildCatalystChecks({
    mapeFullSet: 0.28,
    mapeSacSubset: 0.11,
    extrapolationFraction: 0.3,
  });
  const v = mapCatalystChecksToVerdict(checks); // 无 flag
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.equal(v.route, 'mixed');
});

test('E2 carbon: RMSE↓0.35 + bias 0.08 + 60 塔 → 全 PASS → CONFIRMED', () => {
  const checks = buildCarbonChecks({
    rmseReduction: 0.35,
    drylandAbsBias: 0.08,
    towerCount: 60,
  });
  assert.equal(checks.every((c) => c.outcome === 'PASS'), true);
  const v = mapCarbonChecksToVerdict(checks);
  assert.equal(v.verdict, 'CONFIRMED');
  assert.equal(v.route, 'all_pass');
});

test('E2 carbon: RMSE↓0.20 < 0.30 → WARN → mixed → INCONCLUSIVE', () => {
  const checks = buildCarbonChecks({
    rmseReduction: 0.2,
    drylandAbsBias: 0.08,
    towerCount: 60,
  });
  const v = mapCarbonChecksToVerdict(checks);
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.equal(v.route, 'mixed');
});

test('G5 seismic: 无前瞻证据（null）→ 空 checks → data_missing → UNTESTED（反剧场：禁伪造 precision）', () => {
  const checks = buildSeismicChecks({
    prospectivePrecision: null,
    prospectiveRecall: null,
    independentReplicationTeams: 0,
  });
  assert.equal(checks.length, 0); // 无前瞻证据 → 不构造检验（禁伪造）
  const v = mapSeismicChecksToVerdict(checks);
  assert.equal(v.verdict, 'UNTESTED');
  assert.equal(v.route, 'data_missing');
});

test('G5 seismic: 若有前瞻证据（生产 caller 注入）→ 构造有效检验', () => {
  const checks = buildSeismicChecks({
    prospectivePrecision: 0.85,
    prospectiveRecall: 0.55,
    independentReplicationTeams: 2,
  });
  assert.equal(checks.length, 3);
  assert.equal(checks.every((c) => c.outcome === 'PASS'), true);
  const v = mapSeismicChecksToVerdict(checks);
  assert.equal(v.verdict, 'CONFIRMED');
});
