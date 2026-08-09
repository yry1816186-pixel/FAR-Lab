// tests/planning/risk.test.ts
// opencode /risk 源代码化测试：P0-P4 确定性分级（AGENT-LIFECYCLE §4）。
// 真实依赖：gradeRisk / isHigherRisk / maxRisk（src/planning/risk.ts，无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gradeRisk, isHigherRisk, maxRisk } from '../../src/planning/risk.ts';
import type { RiskSignals } from '../../src/planning/types.ts';

const none: RiskSignals = {
  readOnly: false,
  docOnly: false,
  boundedWrite: false,
  touchesTrustKernel: false,
  newCliOrApi: false,
  crossModule: false,
  destructive: false,
  irreversible: false,
  ambiguous: false,
};

test('irreversible dominates everything → P4 with dual-authorization rationale', () => {
  const r = gradeRisk({ ...none, irreversible: true, touchesTrustKernel: true, ambiguous: true });
  assert.equal(r.level, 'P4');
  assert.ok(r.reasons.some((x) => x.includes('irreversible')));
});

test('touchesTrustKernel → P3 with additive-only rationale', () => {
  const r = gradeRisk({ ...none, touchesTrustKernel: true });
  assert.equal(r.level, 'P3');
  assert.ok(r.reasons.some((x) => x.includes('trust-kernel')));
});

test('newCliOrApi → P3', () => {
  assert.equal(gradeRisk({ ...none, newCliOrApi: true }).level, 'P3');
});

test('crossModule (3+ files) → P3', () => {
  assert.equal(gradeRisk({ ...none, crossModule: true }).level, 'P3');
});

test('destructive → P3; destructive + ambiguous → P4 (round up)', () => {
  assert.equal(gradeRisk({ ...none, destructive: true }).level, 'P3');
  assert.equal(gradeRisk({ ...none, destructive: true, ambiguous: true }).level, 'P4');
});

test('boundedWrite → P2 with rollback rationale', () => {
  const r = gradeRisk({ ...none, boundedWrite: true });
  assert.equal(r.level, 'P2');
  assert.ok(r.reasons.some((x) => x.includes('reversible bounded write')));
});

test('docOnly → P1; readOnly → P0', () => {
  assert.equal(gradeRisk({ ...none, docOnly: true }).level, 'P1');
  assert.equal(gradeRisk({ ...none, readOnly: true }).level, 'P0');
});

test('ambiguous rounds up: P2 → P3, P1 → P2, P0 → P1', () => {
  assert.equal(gradeRisk({ ...none, boundedWrite: true, ambiguous: true }).level, 'P3');
  assert.equal(gradeRisk({ ...none, docOnly: true, ambiguous: true }).level, 'P2');
  assert.equal(gradeRisk({ ...none, readOnly: true, ambiguous: true }).level, 'P1');
});

test('ambiguous on P3 signals rounds up to P4 (cap)', () => {
  assert.equal(gradeRisk({ ...none, touchesTrustKernel: true, ambiguous: true }).level, 'P4');
});

test('no write signal at all → conservative P2 fallback with declared rationale', () => {
  const r = gradeRisk({ ...none });
  assert.equal(r.level, 'P2');
  assert.ok(r.reasons.some((x) => x.includes('fallback')));
});

test('P4 ambiguous stays P4 (cap, no P5)', () => {
  assert.equal(gradeRisk({ ...none, irreversible: true, ambiguous: true }).level, 'P4');
});

test('isHigherRisk strict ordering', () => {
  assert.equal(isHigherRisk('P3', 'P2'), true);
  assert.equal(isHigherRisk('P2', 'P3'), false);
  assert.equal(isHigherRisk('P4', 'P4'), false);
});

test('maxRisk takes the higher level', () => {
  assert.equal(maxRisk('P2', 'P3'), 'P3');
  assert.equal(maxRisk('P4', 'P0'), 'P4');
});
