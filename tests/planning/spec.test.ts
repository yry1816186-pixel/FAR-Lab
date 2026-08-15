// tests/planning/spec.test.ts
// Spec 可验证规格门禁。
// 真实依赖：validateSpec / TRUST_KERNEL_PATHS（src/planning/spec.ts，纯函数无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { TRUST_KERNEL_PATHS, validateSpec } from '../../src/planning/spec.ts';
import type { Spec } from '../../src/planning/types.ts';

function okSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    story: 'researcher wants tamper-evident receipts so replicators can trust the bundle',
    delta: { added: ['src/api/routes/x.ts', 'tests/api/x.test.ts'], modified: [], removed: [] },
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'endpoint returns sealed receipt', verification: 'pnpm test -- tests/api/x.test.ts' },
      { id: 'AC-2', statement: 'tamper is detected', verification: 'node src/cli/far.ts verify --bundle' },
      { id: 'AC-3', statement: 'schema drift is blocked', verification: 'pnpm openapi:check' },
    ],
    risk: 'P3',
    ...overrides,
  };
}

test('valid spec with 3 verifiable ACs passes', () => {
  const r = validateSpec(okSpec());
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('empty story → EMPTY_STORY (defense below schema min(1))', () => {
  const r = validateSpec(okSpec({ story: '  ' }));
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'EMPTY_STORY'));
});

test('empty delta → EMPTY_DELTA (no fuzzy specs)', () => {
  const r = validateSpec(okSpec({ delta: { added: [], modified: [], removed: [] } }));
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'EMPTY_DELTA'));
});

test('fewer than 3 acceptance criteria → TOO_FEW_CRITERIA (OpenSpec law)', () => {
  const spec = okSpec({ acceptanceCriteria: okSpec().acceptanceCriteria.slice(0, 2) });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'TOO_FEW_CRITERIA'));
});

test('criterion without verification method → CRITERION_NOT_VERIFIABLE', () => {
  const spec = okSpec({
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'x', verification: 'cmd' },
      { id: 'AC-2', statement: 'y', verification: 'cmd' },
      { id: 'AC-3', statement: 'z', verification: '   ' },
    ],
  });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'CRITERION_NOT_VERIFIABLE'));
});

test('duplicate AC id → DUPLICATE_CRITERION_ID', () => {
  const spec = okSpec({
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'x', verification: 'cmd' },
      { id: 'AC-1', statement: 'y', verification: 'cmd' },
      { id: 'AC-2', statement: 'z', verification: 'cmd' },
    ],
  });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'DUPLICATE_CRITERION_ID'));
});

test('delta touching trust-kernel without declaration → TRUST_KERNEL_MISSING_DECLARATION', () => {
  const spec = okSpec({ delta: { added: ['src/falsifiability/new_rule.ts'], modified: [], removed: [] } });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'TRUST_KERNEL_MISSING_DECLARATION'));
});

test('trust-kernel declaration with additiveOnly=false → TRUST_KERNEL_NOT_ADDITIVE', () => {
  const spec = okSpec({
    delta: { added: ['src/falsifiability/new_rule.ts'], modified: [], removed: [] },
    trustKernel: { additiveOnly: false, cannotProveStatement: 'x' },
  });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'TRUST_KERNEL_NOT_ADDITIVE'));
});

test('trust-kernel delta with additiveOnly + cannotProveStatement passes', () => {
  const spec = okSpec({
    delta: { added: ['src/falsifiability/new_rule.ts'], modified: [], removed: [] },
    trustKernel: { additiveOnly: true, cannotProveStatement: 'does not prove statistical truth of the claim' },
  });
  assert.equal(validateSpec(spec).ok, true);
});

test('removed without justification → REMOVED_WITHOUT_JUSTIFICATION (destructive-change bar)', () => {
  const spec = okSpec({ delta: { added: [], modified: [], removed: ['src/api/routes/old.ts'] } });
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'REMOVED_WITHOUT_JUSTIFICATION'));
});

test('removed with justification passes', () => {
  const spec = okSpec({
    delta: { added: [], modified: [], removed: ['src/api/routes/old.ts'] },
    removedJustification: 'grep shows zero callers; verified no external consumer',
  });
  assert.equal(validateSpec(spec).ok, true);
});

test('custom trust-kernel path table overrides defaults', () => {
  // 默认表不含 src/planning/ —— 不报；自定义表命中则报
  const custom = ['src/planning/'];
  const spec = okSpec({ delta: { added: ['src/planning/new_engine.ts'], modified: [], removed: [] } });
  assert.equal(validateSpec(spec).ok, true);
  const r = validateSpec(spec, custom);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'TRUST_KERNEL_MISSING_DECLARATION'));
});

test('TRUST_KERNEL_PATHS covers the AGENTS.md §7 high-risk modules', () => {
  for (const prefix of ['src/falsifiability/', 'src/evidence_log/', 'src/fec/', 'src/far_proof/', 'schema/migrations/']) {
    assert.ok(TRUST_KERNEL_PATHS.includes(prefix), `missing ${prefix}`);
  }
});
