// tests/governance/omission_ledger.test.ts
//
// GOV-OMISSION-001 验收测试：轮终遗漏登记 append-only + 清偿必须带证据 +
// 下轮登记必须复盘全部未清偿项 + 与 evaluateStopReport 残差分类对齐。
// 纯函数确定性测试（时间显式注入）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearOmission,
  openOmissions,
  registerOmission,
  reviewAtRoundStart,
  unreportedOpenOmissions,
  type OmissionEntry,
  type OmissionLedger,
} from '../../src/governance/omission_ledger.ts';
import { RESIDUAL_CLASSES } from '../../src/gates/gov_and_gates.ts';

function makeEntry(overrides: Partial<OmissionEntry> = {}): OmissionEntry {
  return {
    id: 'OM-1',
    discoveredInRound: 'day-r9',
    item: '前端 404 页无 E2E 断言',
    valueEstimate: 'mh',
    sources: ['usability'],
    clearingCondition: 'tests/e2e 含 404 路由用例且全绿',
    owner: 'far-ux-engineer',
    residualClass: 'T2',
    status: 'open',
    evidenceRefs: [],
    clearedOn: null,
    ...overrides,
  };
}

test('register: append-only happy path; duplicate id rejected', () => {
  const empty: OmissionLedger = { entries: [] };
  const r1 = registerOmission(empty, makeEntry());
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.ledger.entries.length, 1);
    const dup = registerOmission(r1.ledger, makeEntry());
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.match(dup.problem, /duplicate omission id/);
  }
});

test('register: field-level fail-closed (empty clearing condition / bad residual class / bogus source)', () => {
  for (const overrides of [
    { clearingCondition: ' ' },
    { residualClass: 'T9' },
    { sources: ['dream'] },
    { owner: '' },
    { valueEstimate: 'ultra' },
  ] as const) {
    const r = registerOmission({ entries: [] }, makeEntry(overrides as Partial<OmissionEntry>));
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(overrides)}`);
  }
  // residualClass 词汇表与 evaluateStopReport 的 RESIDUAL_CLASSES 同源。
  assert.deepEqual([...RESIDUAL_CLASSES], ['T1', 'T2', 'T3', 'BLOCKED_EXTERNAL', 'NOT_APPLICABLE']);
});

test('round-start review assertion: new registration must enumerate every open omission', () => {
  const ledger = { entries: [makeEntry()] };
  // 不带 reviewedOpenIds → 拒绝。
  const blind = registerOmission(ledger, makeEntry({ id: 'OM-2', discoveredInRound: 'day-r10' }));
  assert.equal(blind.ok, false);
  if (!blind.ok) assert.match(blind.problem, /OM-1/);

  // 带全量复盘 → 允许。
  const reviewed = registerOmission(ledger, makeEntry({ id: 'OM-2', discoveredInRound: 'day-r10' }), {
    reviewedOpenIds: ['OM-1'],
  });
  assert.equal(reviewed.ok, true);

  // 已清偿项不阻塞新轮登记。
  const cleared = clearOmission(ledger, 'OM-1', ['test:tests/ux/404.test.ts'], '2026-08-18');
  assert.equal(cleared.ok, true);
  if (cleared.ok) {
    const after = registerOmission(cleared.ledger, makeEntry({ id: 'OM-3', discoveredInRound: 'day-r10' }));
    assert.equal(after.ok, true, 'cleared omissions must not block round-start review');
  }
});

test('reviewAtRoundStart returns prior-round open items in deterministic order', () => {
  const ledger: OmissionLedger = {
    entries: [
      makeEntry({ id: 'OM-b', discoveredInRound: 'day-r9' }),
      makeEntry({ id: 'OM-a', discoveredInRound: 'day-r9' }),
      makeEntry({ id: 'OM-old', discoveredInRound: 'day-r8' }),
      makeEntry({ id: 'OM-done', discoveredInRound: 'day-r8', status: 'cleared', evidenceRefs: ['doc:x'], clearedOn: '2026-08-17' }),
      makeEntry({ id: 'OM-current', discoveredInRound: 'day-r10' }),
    ],
  };
  const prior = reviewAtRoundStart(ledger, 'day-r10');
  assert.deepEqual(
    prior.map((e) => e.id),
    ['OM-old', 'OM-a', 'OM-b'],
  );
  assert.equal(openOmissions(ledger).length, 4);
});

test('clear: requires kind:path evidence; one-way only; bad date rejected', () => {
  const ledger = { entries: [makeEntry()] };
  for (const badRefs of [[], ['口头说清了'], ['test:'], [':tests/x.ts']] as const) {
    const r = clearOmission(ledger, 'OM-1', badRefs, '2026-08-18');
    assert.equal(r.ok, false, `evidence ${JSON.stringify(badRefs)} must be rejected`);
  }
  const badDate = clearOmission(ledger, 'OM-1', ['test:tests/x.ts'], 'yesterday');
  assert.equal(badDate.ok, false);

  const ok = clearOmission(ledger, 'OM-1', ['test:tests/x.ts', 'pr:#102'], '2026-08-18');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const again = clearOmission(ok.ledger, 'OM-1', ['test:tests/x.ts'], '2026-08-19');
    assert.equal(again.ok, false, 're-clearing must be rejected (append-only)');
    assert.equal(ok.ledger.entries[0]!.status, 'cleared');
    assert.equal(ok.ledger.entries[0]!.clearedOn, '2026-08-18');
  }
  const missing = clearOmission(ledger, 'OM-404', ['test:t'], '2026-08-18');
  assert.equal(missing.ok, false);
});

test('alignment with evaluateStopReport: open omissions missing from stop residuals are surfaced', () => {
  const ledger = { entries: [makeEntry(), makeEntry({ id: 'OM-2', item: 'db 迁移回滚演练缺失' })] };
  // stop report 只列了 OM-1 的 item → OM-2 是未上报的 open 遗漏。
  const unreported = unreportedOpenOmissions(ledger, ['前端 404 页无 E2E 断言']);
  assert.deepEqual(unreported.map((e) => e.id), ['OM-2']);
  const all = unreportedOpenOmissions(ledger, ['前端 404 页无 E2E 断言', 'db 迁移回滚演练缺失']);
  assert.equal(all.length, 0);
});
