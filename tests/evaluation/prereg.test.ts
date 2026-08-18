// tests/evaluation/prereg.test.ts
// EVAL-PREREG-001：13 节冻结 + hash 篡改检出 + deviation 申报门 + 概念草案
// 不可绑定结果。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  PREREG_REQUIRED_SECTIONS,
  computeSpecHash,
  freezePrereg,
  listDeviations,
  preregResultGate,
  verifyFrozenRecord,
} from '../../src/evaluation/prereg.ts';
import type { DeviationDeclaration, PreregSpec } from '../../src/evaluation/prereg.ts';

function fullSpec(): PreregSpec {
  return {
    kind: 'executable-protocol',
    question: 'Does adapter-X reduce verdict latency at equal accuracy?',
    datasets: 'science-125 v3 frozen snapshot id=abc123',
    exclusions: 'items with known-answer contamination flags',
    baselines: 'adapter-W v2.1, adapter-V v1.0',
    metrics: 'accuracy (primary), p95 latency ms, cost USD per 100 items',
    sampleSizeRuns: '30 problems x 3 seeds = 90 runs',
    seeds: '11, 22, 33',
    statisticalAnalysis: 'paired bootstrap 10k resamples, two-sided alpha=0.05',
    leakageProbes: 'near-duplicate shingle scan vs benchmark answer key',
    stoppingRules: 'fixed sample, no early stop',
    hardwareSoftware: 'node 22, Windows 11, 32GB RAM, commit 4bebe30',
    costAccounting: 'per-run token metering, measured=true only',
    failureHandling: 'crash → resume from checkpoint, retry budget 2',
  };
}

test('EVAL-PREREG-001: 13 节清单齐全 + 冻结→干净执行 PASS_CLEAN + hash 确定性', () => {
  assert.equal(PREREG_REQUIRED_SECTIONS.length, 13);
  const frozen = freezePrereg(fullSpec(), 'before-run-label');
  assert.equal(frozen.preregHash.length, 64, 'sha256 hex');
  // 确定性：同 spec 两次冻结 → 同 hash；与 computeSpecHash 一致
  assert.equal(freezePrereg(fullSpec(), 'other-label').preregHash, frozen.preregHash);
  assert.equal(computeSpecHash(fullSpec()), frozen.preregHash);
  // frozenAtLabel 不进 hash 覆盖面（审计标签不是协议内容）
  // 干净执行（同 spec）→ PASS_CLEAN
  const gate = preregResultGate(frozen, fullSpec());
  assert.equal(gate.status, 'PASS_CLEAN');
  assert.equal(gate.hashMatches, true);
  assert.equal(gate.deviations.length, 0);
});

test('EVAL-PREREG-001: 缺节/空节拒绝冻结（fail-closed）+ 空 frozenAtLabel 拒绝', () => {
  const { stoppingRules: _omit, ...missing } = fullSpec();
  void _omit;
  // 负向测试：故意构造缺节 spec（单断言注入缺失字段——测试故意破坏形状）
  assert.throws(() => freezePrereg(missing as PreregSpec, 'label'), /section "stoppingRules" is empty/);
  const blank: PreregSpec = { ...fullSpec(), seeds: '   ' };
  assert.throws(() => freezePrereg(blank, 'label'), /section "seeds" is empty/);
  assert.throws(() => freezePrereg(fullSpec(), '  '), /frozenAtLabel/);
});

test('EVAL-PREREG-001: 篡改检出——静默换指标/换种子 → FAIL_UNDECLARED_DEVIATION + deviation 逐节列出', () => {
  const frozen = freezePrereg(fullSpec(), 'before-run-label');
  // 事后静默把主指标换成 F1、种子换成 77 —— 典型 p-hacking 面
  const tampered: PreregSpec = {
    ...fullSpec(),
    metrics: 'F1 (primary), latency ms',
    seeds: '77, 88, 99',
  };
  assert.equal(preregResultGate(frozen, tampered).hashMatches, false);
  const deviations = listDeviations(frozen.spec, tampered);
  assert.deepEqual(
    [...deviations.map((d) => d.section)].sort(),
    ['metrics', 'seeds'],
  );
  const m = deviations.find((d) => d.section === 'metrics');
  assert.ok(m?.preregValue.includes('accuracy (primary)'));
  assert.ok(m?.executedValue.includes('F1 (primary)'));

  // 未申报 → FAIL
  const unDeclared = preregResultGate(frozen, tampered);
  assert.equal(unDeclared.status, 'FAIL_UNDECLARED_DEVIATION');
  assert.deepEqual([...unDeclared.undeclaredSections].sort(), ['metrics', 'seeds']);

  // 全部显式申报 → PASS_WITH_DECLARED_DEVIATIONS（公开报告必须列出）
  const declared: DeviationDeclaration[] = [
    { section: 'metrics', reason: 'accuracy field missing in v3 snapshot rows' },
    { section: 'seeds', reason: 'seed 11 crashed deterministically; replaced under failureHandling clause' },
  ];
  const withDeclared = preregResultGate(frozen, tampered, declared);
  assert.equal(withDeclared.status, 'PASS_WITH_DECLARED_DEVIATIONS');
  assert.equal(withDeclared.undeclaredSections.length, 0);
  assert.equal(withDeclared.deviations.length, 2);
  // 只申报其一 → 仍 FAIL（漏报的 modification 不因部分申报被赦免）
  const halfDeclared = preregResultGate(frozen, tampered, declared.slice(0, 1));
  assert.equal(halfDeclared.status, 'FAIL_UNDECLARED_DEVIATION');
  assert.deepEqual(halfDeclared.undeclaredSections, ['seeds']);
});

test('EVAL-PREREG-001: 概念草案不可绑定结果 + 冻结记录本体篡改检出', () => {
  const draft = freezePrereg({ ...fullSpec(), kind: 'concept-draft' }, 'draft-label');
  // 即便执行与草案逐字一致（hash matches），草案不可作为结果预注册依据
  const gate = preregResultGate(draft, { ...fullSpec(), kind: 'concept-draft' });
  assert.equal(gate.status, 'FAIL_CONCEPT_DRAFT_CANNOT_BIND_RESULTS');
  assert.equal(gate.hashMatches, true);

  // 冻结记录本体被改：spec 与指纹不一致 → 完整性拒绝
  const frozen = freezePrereg(fullSpec(), 'label');
  const tamperedRecord = { ...frozen, spec: { ...frozen.spec, baselines: 'weaker-baseline-only' } };
  const integrity = verifyFrozenRecord(tamperedRecord);
  assert.equal(integrity.ok, false);
  assert.match(integrity.reason, /prereg hash mismatch/);
  assert.equal(verifyFrozenRecord(frozen).ok, true);
});
