// tests/report/result_taxonomy.test.ts
// STAT-NEGATIVE-001 负结果完整保留：5 类 taxonomy（仅 NEGATIVE_RESULT 计反证；
// 执行失败/低功效恒不等于反证）、运行产物映射、append-only registry（无 GC/
// 删除路径）、报告渲染（5 类分列 + 执行失败≠反证标注）、EPISTEMIC_TAGS 对齐。

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as taxonomyModule from '../../src/science/result_taxonomy.ts';
import {
  NEGATIVE_RESULTS_ROOT,
  RESULT_OUTCOMES,
  RESULT_TAXONOMY,
  RESULT_TO_EPISTEMIC_TAG,
  classifyResultOutcome,
  negativeResultRetentionGuarantee,
  readNegativeResults,
  registerNegativeResult,
  renderNegativeResultSection,
} from '../../src/science/result_taxonomy.ts';
import { verdictToEpistemicTag } from '../../src/report/epistemic.ts';

const FIXED_CLOCK = (): Date => new Date('2026-08-17T00:00:00Z');

function entry(outcome: (typeof RESULT_OUTCOMES)[number], id: string) {
  return { id, claimId: `claim-${id}`, outcome, detail: `detail for ${id}` };
}

// ---------------------------------------------------------------------------
// taxonomy：5 类语义（countsAsCounterEvidence 仅 NEGATIVE_RESULT 为 true）
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 taxonomy: exactly five classes, only NEGATIVE_RESULT counts as counter-evidence', () => {
  assert.deepEqual([...RESULT_OUTCOMES].sort(), [
    'EXECUTION_FAILURE', 'INCONCLUSIVE', 'INVALID_DESIGN', 'NEGATIVE_RESULT', 'NULL_RESULT',
  ]);
  assert.equal(RESULT_TAXONOMY.NEGATIVE_RESULT.countsAsCounterEvidence, true);
  // 执行失败与低功效 null 恒不等于反证（宪法原文）
  assert.equal(RESULT_TAXONOMY.EXECUTION_FAILURE.countsAsCounterEvidence, false);
  assert.equal(RESULT_TAXONOMY.NULL_RESULT.countsAsCounterEvidence, false, 'underpowered non-detection is NOT refutation');
  assert.equal(RESULT_TAXONOMY.INCONCLUSIVE.countsAsCounterEvidence, false);
  assert.equal(RESULT_TAXONOMY.INVALID_DESIGN.countsAsCounterEvidence, false);
});

// ---------------------------------------------------------------------------
// classifyResultOutcome：运行产物 → 类别（全分支）
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 classify: outcome mapping covers all five classes plus positive→null', () => {
  const completed = { status: 'completed' as const, designValid: true };
  assert.equal(classifyResultOutcome({ ...completed, effectDetected: false, powered: true })?.outcome, 'NEGATIVE_RESULT');
  assert.equal(classifyResultOutcome({ ...completed, effectDetected: false, powered: false })?.outcome, 'NULL_RESULT', 'underpowered non-detection → NULL (not counter-evidence)');
  assert.equal(classifyResultOutcome({ ...completed, effectDetected: null, powered: true })?.outcome, 'INCONCLUSIVE');
  assert.equal(classifyResultOutcome({ status: 'failed', effectDetected: null, powered: null, designValid: true })?.outcome, 'EXECUTION_FAILURE');
  assert.equal(classifyResultOutcome({ status: 'completed', effectDetected: true, powered: true, designValid: true }), null, 'positive result is outside the negative-result family');
  // 设计无效优先于执行失败：坏设计的“失败”不冒充执行失败
  assert.equal(classifyResultOutcome({ status: 'failed', effectDetected: null, powered: null, designValid: false })?.outcome, 'INVALID_DESIGN');
  const classified = classifyResultOutcome({ status: 'completed', effectDetected: null, powered: null, designValid: false });
  assert.equal(classified?.outcome, 'INVALID_DESIGN');
  assert.equal(classified?.countsAsCounterEvidence, false, 'classification carries the counter-evidence semantics');
});

// ---------------------------------------------------------------------------
// registry：append-only、5 类皆可登记、防重、无 GC
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 registry: all five classes registrable, append-only, idempotency-guarded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'negres-'));
  try {
    for (const outcome of RESULT_OUTCOMES) {
      registerNegativeResult(dir, entry(outcome, outcome.toLowerCase()), FIXED_CLOCK);
    }
    const all = readNegativeResults(dir);
    assert.equal(all.length, RESULT_OUTCOMES.length, 'all five classes registered and retained');
    // 登记顺序保留（append-only 不重排）
    assert.deepEqual(all.map((r) => r.outcome), [...RESULT_OUTCOMES]);

    // 再登记一条 → 追加不覆盖
    registerNegativeResult(dir, entry('NEGATIVE_RESULT', 'extra-1'), FIXED_CLOCK);
    assert.equal(readNegativeResults(dir).length, RESULT_OUTCOMES.length + 1);

    // 重复 id → 拒绝（防重复登记污染计数）
    assert.throws(() => registerNegativeResult(dir, entry('INCONCLUSIVE', 'extra-1'), FIXED_CLOCK), /duplicate/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('STAT-NEGATIVE-001 registry: default root lives under .far (runtime zone, never the repo root)', () => {
  assert.equal(NEGATIVE_RESULTS_ROOT, '.far/negative-results');
});

test('STAT-NEGATIVE-001 retention: no GC / no deletion path on the module surface', () => {
  const guarantee = negativeResultRetentionGuarantee();
  assert.equal(guarantee.garbageCollection, false);
  assert.deepEqual(guarantee.deletionPaths, []);
  assert.equal(guarantee.registerableOutcomes.length, 5);
  // 导出面钉住：不存在 delete/gc/prune 命名的函数（append-only 的结构性证据）
  const exported = Object.keys(taxonomyModule).filter((k) => /delete|remove|gc|prune|truncate/i.test(k));
  assert.deepEqual(exported, [], 'no deletion-flavored exports on the registry module');
});

// ---------------------------------------------------------------------------
// tamper：改写历史行 → entryHash 校验失败（fail-closed 读取）
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 tamper: editing a registered line breaks its entry hash on read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'negres-'));
  try {
    registerNegativeResult(dir, entry('EXECUTION_FAILURE', 'ef-1'), FIXED_CLOCK);
    const path = join(dir, 'registry.jsonl');
    const tampered = readFileSync(path, 'utf8').replace('detail for ef-1', 'retconned detail');
    writeFileSync(path, tampered, 'utf8');
    assert.throws(() => readNegativeResults(dir), /entryHash mismatch|tampered/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 报告渲染：5 类分列 + 执行失败≠反证标注
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 render: five sections, explicit execution-failure≠counter-evidence note, per-entry rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'negres-'));
  try {
    registerNegativeResult(dir, entry('EXECUTION_FAILURE', 'ef-1'), FIXED_CLOCK);
    registerNegativeResult(dir, entry('NEGATIVE_RESULT', 'nr-1'), FIXED_CLOCK);
    const markdown = renderNegativeResultSection(readNegativeResults(dir));

    // 5 类分列（空类也渲染，注明 none registered——沉默缺节=可疑）
    for (const outcome of RESULT_OUTCOMES) {
      assert.ok(markdown.includes(`### ${outcome}`), `section for ${outcome}`);
    }
    assert.match(markdown, /NULL_RESULT[\s\S]*none registered/, 'empty section rendered honestly');
    // 执行失败≠反证 显式标注
    assert.match(markdown, /execution failure is NOT counter-evidence/i);
    assert.match(markdown, /underpowered/i, 'low-power semantics noted');
    // 条目行：id + claimId + counter-evidence 语义
    assert.match(markdown, /ef-1/);
    assert.match(markdown, /nr-1/);
    assert.match(markdown, /counts as counter-evidence: yes/i);
    assert.match(markdown, /counts as counter-evidence: no/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// EPISTEMIC_TAGS 对齐（INCONCLUSIVE → UNKNOWN，与裁决映射同一诚实值）
// ---------------------------------------------------------------------------

test('STAT-NEGATIVE-001 epistemic: mapping aligns with verdictToEpistemicTag (INCONCLUSIVE → UNKNOWN)', () => {
  assert.equal(RESULT_TO_EPISTEMIC_TAG.NEGATIVE_RESULT, 'EVIDENCE', 'a powered refutation is evidence (aligns REFUTED→EVIDENCE)');
  for (const outcome of ['NULL_RESULT', 'INCONCLUSIVE', 'EXECUTION_FAILURE', 'INVALID_DESIGN'] as const) {
    assert.equal(RESULT_TO_EPISTEMIC_TAG[outcome], 'UNKNOWN');
  }
  // 与既有裁决映射对拍：INCONCLUSIVE 裁决与 INCONCLUSIVE 负结果是同一认知值
  const verdictTag = verdictToEpistemicTag({ claimId: 'c', verdict: 'INCONCLUSIVE', evidenceCount: 3 });
  assert.equal(RESULT_TO_EPISTEMIC_TAG.INCONCLUSIVE, verdictTag, 'no divergence between the two INCONCLUSIVE mappings');
});
