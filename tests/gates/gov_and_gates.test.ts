// tests/gates/gov_and_gates.test.ts
// 批 29 八项：RELIABILITY/SCIENCE/UX 三门（真实资产聚合）+ GOV 五项机器层。
// 真实依赖：三门对真实仓库文件断言；GOV 层纯函数。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONTEXT_PACK_REQUIRED,
  SCENARIO_CATEGORIES,
  checkBehaviorChanges,
  checkContextPack,
  checkScenarioLedger,
  evaluateStopReport,
  freshnessCheck,
  reliabilityGate,
  scienceGate,
  uxGate,
} from '../../src/gates/gov_and_gates.ts';
import type { BehaviorChangeRecord, ExternalFact, ScenarioEntry, StopReportInput } from '../../src/gates/gov_and_gates.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// 三门
// ---------------------------------------------------------------------------

test('GATE-RELIABILITY-001: 七证据面在场全绿；幽灵根全红', () => {
  const gate = reliabilityGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.pass, true);
  assert.equal(reliabilityGate('C:/phantom').pass, false);
});

test('GATE-SCIENCE-001: 七证据面在场全绿；幽灵根全红', () => {
  const gate = scienceGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.pass, true);
  assert.equal(scienceGate('C:/phantom').pass, false);
});

test('GATE-UX-001: 六证据面在场全绿；幽灵根全红', () => {
  const gate = uxGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.pass, true);
  assert.equal(uxGate('C:/phantom').pass, false);
});

// ---------------------------------------------------------------------------
// GOV-CONTEXT-001
// ---------------------------------------------------------------------------

test('GOV-CONTEXT-001: 14 字段最小充分 + 缺失列名 + 猜测填充拒（不得猜，须补载）', () => {
  assert.equal(CONTEXT_PACK_REQUIRED.length, 14);
  const full = Object.fromEntries(CONTEXT_PACK_REQUIRED.map((f) => [f, `value-${f}`]));
  const ok = checkContextPack(full as Record<string, unknown> as Parameters<typeof checkContextPack>[0]);
  assert.equal(ok.ok, true);

  const partial = { ...full } as Record<string, unknown>;
  delete partial.t0Redlines;
  delete partial.rollback;
  const missing = checkContextPack(partial as Parameters<typeof checkContextPack>[0]);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing.sort(), ['rollback', 't0Redlines']);

  const guessed = { ...full, unknowns: 'guess: 应该没问题吧' } as Parameters<typeof checkContextPack>[0];
  const g = checkContextPack(guessed);
  assert.equal(g.ok, false);
  assert.deepEqual(g.guessFilled, ['unknowns'], '猜测填充必须显式拒——上下文不足须请求补载');
});

// ---------------------------------------------------------------------------
// GOV-EXTERNAL-001
// ---------------------------------------------------------------------------

test('GOV-EXTERNAL-001: freshness 三档（新鲜可用/90 天重查/180 天阻断高风险）+ 坏日期拒', () => {
  const fresh: ExternalFact = {
    id: 'F1', source: 'official', verifiedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    confidence: 0.9, recheckTrigger: '版本发布', affectedDecisions: ['d1'],
  };
  assert.equal(freshnessCheck(fresh).action, 'usable');

  const aging: ExternalFact = { ...fresh, id: 'F2', verifiedAt: new Date(Date.now() - 120 * 86_400_000).toISOString() };
  const a = freshnessCheck(aging);
  assert.equal(a.action, 'recheck-required');
  assert.equal(a.fresh, false);

  const stale: ExternalFact = { ...fresh, id: 'F3', verifiedAt: new Date(Date.now() - 365 * 86_400_000).toISOString() };
  const s = freshnessCheck(stale);
  assert.equal(s.action, 'block-high-risk');
  assert.match(s.detail, /stale.*blocked/);

  const bad: ExternalFact = { ...fresh, id: 'F4', verifiedAt: 'not-a-date' };
  assert.equal(freshnessCheck(bad).action, 'block-high-risk');
});

// ---------------------------------------------------------------------------
// GOV-PROMPTREG-001
// ---------------------------------------------------------------------------

test('GOV-PROMPTREG-001: 行为变更必须带回归套件+差异审阅；缺任一拒（保持旧配置）', () => {
  const good: BehaviorChangeRecord = {
    changeId: 'C1', kind: 'system-prompt', at: 'T', regressionSuite: 'tests/golden_vectors', diffReviewRef: 'review#1',
  };
  assert.equal(checkBehaviorChanges([good]).ok, true);

  const noSuite: BehaviorChangeRecord = { ...good, changeId: 'C2', regressionSuite: '' };
  const r1 = checkBehaviorChanges([noSuite]);
  assert.equal(r1.ok, false);
  assert.ok(r1.problems.some((p) => p.includes('without regression suite')));

  const noReview: BehaviorChangeRecord = { ...good, changeId: 'C3', diffReviewRef: ' ' };
  assert.equal(checkBehaviorChanges([noReview]).ok, false);

  assert.ok(checkBehaviorChanges([good, { ...good }]).problems.some((p) => p.includes('duplicate')));
});

// ---------------------------------------------------------------------------
// GOV-SCENARIO-001
// ---------------------------------------------------------------------------

function fullLedger(): ScenarioEntry[] {
  return SCENARIO_CATEGORIES.map((category, i) => ({
    id: `s-${i}`, category, scenario: `scenario ${i}`, status: 'handled' as const,
  }));
}

test('GOV-SCENARIO-001: 九类全覆盖+handled 全过；空类拒；accepted 缺 owner/期限拒', () => {
  assert.equal(SCENARIO_CATEGORIES.length, 9);
  assert.equal(checkScenarioLedger(fullLedger()).ok, true);

  const missingCategory = fullLedger().filter((e) => e.category !== 'adversarial-security');
  const r1 = checkScenarioLedger(missingCategory);
  assert.equal(r1.ok, false);
  assert.ok(r1.problems.some((p) => p.includes('adversarial-security')));

  const acceptedNoOwner = fullLedger().map((e, i) =>
    i === 0 ? { ...e, status: 'accepted-with-owner' as const } : e,
  );
  assert.ok(checkScenarioLedger(acceptedNoOwner).problems.some((p) => p.includes('without owner')));

  const acceptedProper = fullLedger().map((e, i) =>
    i === 0 ? { ...e, status: 'accepted-with-owner' as const, owner: 'ops', expiry: '2026-12-31', evidence: 'ev-1' } : e,
  );
  assert.equal(checkScenarioLedger(acceptedProper).ok, true);
});

// ---------------------------------------------------------------------------
// GOV-STOP-001
// ---------------------------------------------------------------------------

test('GOV-STOP-001: 五条件全满足+搜索边界+两轮狩猎证据+剩余分类才 ready；缺件列名', () => {
  const input: StopReportInput = {
    conditionsMet: ['all-applicable-t0-pass', 'p0p1-zero', 'independent-red-team-done', 'two-consecutive-zero-find-value-hunts', 'residuals-classified-with-owner'],
    searchBoundary: 'deadline 2026-09-05；FCS 内部消融族；requirements 180 条全检；unknowns 登记簿 3 条；渠道：代码/测试/CI',
    residuals: [
      { item: 'soak', cls: 'T1', owner: 'release' },
      { item: '远端备份', cls: 'BLOCKED_EXTERNAL', owner: 'operator' },
    ],
    huntEvidence: ['hunt-1 报告', 'hunt-2 报告'],
  };
  assert.equal(evaluateStopReport(input).ready, true);

  const partial: StopReportInput = { ...input, conditionsMet: input.conditionsMet.slice(0, 3) };
  const r1 = evaluateStopReport(partial);
  assert.equal(r1.ready, false);
  assert.deepEqual(r1.unmet.sort(), ['two-consecutive-zero-find-value-hunts', 'residuals-classified-with-owner'].sort());

  const badClass: StopReportInput = { ...input, residuals: [{ item: 'x', cls: 'T1', owner: '' }] };
  assert.equal(evaluateStopReport(badClass).ready, false);
  assert.ok(evaluateStopReport(badClass).unclassifiedResiduals.includes('x'));
  // 只有一轮狩猎证据 → 不 ready
  assert.equal(evaluateStopReport({ ...input, huntEvidence: ['only-one'] }).ready, false);
});
