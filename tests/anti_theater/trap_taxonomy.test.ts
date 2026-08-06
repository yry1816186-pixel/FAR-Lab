/**
 * trap_taxonomy.test.ts —— 统计陷阱分类法（批次 1-B·借鉴 scientific-agent-skills）
 *
 * 覆盖：
 *   1. TRAP_TAXONOMY 键集合与 AntiTheaterAttackKind 闭合联合（经 ATTACK_ID_TO_KIND 值）
 *      全量对拍——21 项无一遗漏、无多余。
 *   2. 每项 taxonomy 的 attackId 与 ATTACK_ID_TO_KIND 反向映射一致（id ↔ kind 自洽）。
 *   3. trapTaxonomyFor 对已知 kind 返回；未知 kind 抛错（不变量风格与 attackKindToId 一致）。
 *   4. summarizeTraps 聚合正确性：去重/计数/hasFail/空输入。
 *   5. 每个 taxonomy 含完整字段（what/cures 非空·realCase 非空串）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATTACK_ID_TO_KIND, attackKindToId } from '../../src/anti_theater/types.ts';
import {
  TRAP_TAXONOMY,
  trapTaxonomyFor,
  summarizeTraps,
  type TrapCategory,
} from '../../src/anti_theater/trap_taxonomy.ts';
import type { AntiTheaterFinding, AntiTheaterAttackKind } from '../../src/anti_theater/types.ts';

function allKinds(): readonly AntiTheaterAttackKind[] {
  return Object.values(ATTACK_ID_TO_KIND);
}

test('TRAP_TAXONOMY covers the full AntiTheaterAttackKind union (21 kinds)', () => {
  const kinds = allKinds();
  assert.ok(kinds.length >= 20, `expected >=20 attack kinds, got ${kinds.length}`);
  const missing = kinds.filter((k) => !(k in TRAP_TAXONOMY));
  assert.deepEqual(missing, [], `taxonomy missing kinds: ${missing.join(', ')}`);
  const extra = Object.keys(TRAP_TAXONOMY).filter((k) => !kinds.includes(k as AntiTheaterAttackKind));
  assert.deepEqual(extra, [], `taxonomy has unknown kinds: ${extra.join(', ')}`);
});

test('every taxonomy attackId round-trips with ATTACK_ID_TO_KIND (id <-> kind self-consistency)', () => {
  for (const [kind, tax] of Object.entries(TRAP_TAXONOMY) as [AntiTheaterAttackKind, (typeof TRAP_TAXONOMY)[AntiTheaterAttackKind]][]) {
    // kind → id → kind 闭环
    assert.equal(tax.kind, kind, `taxonomy.kind mismatch for key ${kind}`);
    const idFromKind = attackKindToId(kind);
    assert.equal(idFromKind, tax.attackId, `attackId ${tax.attackId} does not match ATTACK_ID_TO_KIND[${kind}]`);
    // id → kind 闭环
    assert.equal(ATTACK_ID_TO_KIND[tax.attackId], kind, `ATTACK_ID_TO_KIND[${tax.attackId}] != ${kind}`);
  }
});

test('every taxonomy entry has complete fields', () => {
  for (const [kind, tax] of Object.entries(TRAP_TAXONOMY)) {
    assert.ok(tax.name.length > 0, `taxonomy[${kind}].name empty`);
    assert.ok(tax.what.length > 0, `taxonomy[${kind}].what empty`);
    assert.ok(tax.cures.length > 0, `taxonomy[${kind}].cures empty`);
    assert.ok(tax.realCase.length > 0, `taxonomy[${kind}].realCase empty`);
    assert.ok(CATEGORY_UNION.includes(tax.category), `taxonomy[${kind}].category ${tax.category} not in union`);
  }
});

const CATEGORY_UNION: readonly TrapCategory[] = [
  'significance-abuse',
  'data-integrity',
  'artifact-integrity',
  'scope-integrity',
  'methodology',
  'process-integrity',
  'reporting',
  'reproducibility',
  'forgery',
  'provenance',
  'evidence-adequacy',
];

test('trapTaxonomyFor returns known entry and throws on unknown', () => {
  const t = trapTaxonomyFor('p-hacking-alpha-inflation');
  assert.equal(t.attackId, 'AT-PHACK-ALPHA');
  assert.throws(() => trapTaxonomyFor('does-not-exist' as AntiTheaterAttackKind));
});

function finding(kind: AntiTheaterAttackKind, hasFail: boolean): AntiTheaterFinding {
  return {
    findingId: `T-${kind}`,
    attackKind: kind,
    outcome: hasFail ? 'FAIL' : 'WARN',
    hasFail,
    evidenceRef: 'test-ref',
    message: `finding for ${kind}`,
  };
}

test('summarizeTraps aggregates, dedups and counts categories', () => {
  const summary = summarizeTraps([
    finding('p-hacking-alpha-inflation', true),
    finding('p-hacking-alpha-inflation', true), // duplicate kind → dedup
    finding('seed-cherry-picking', false),
    finding('missing-raw-artifact', false),
  ]);
  assert.equal(summary.totalFindings, 4);
  assert.equal(summary.triggeredKinds.length, 3, 'kinds should be deduplicated');
  assert.deepEqual([...summary.triggeredKinds].sort(), ['missing-raw-artifact', 'p-hacking-alpha-inflation', 'seed-cherry-picking']);
  assert.equal(summary.hasFail, true);
  assert.equal(summary.triggeredCategories.length, 3);
  assert.equal(summary.categoryCounts['significance-abuse'], 1);
  assert.equal(summary.categoryCounts['methodology'], 1);
  assert.equal(summary.categoryCounts['artifact-integrity'], 1);
  // 未触发大类计数为 0
  assert.equal(summary.categoryCounts['forgery'], 0);
  assert.equal(summary.categoryCounts['provenance'], 0);
});

test('summarizeTraps handles empty findings', () => {
  const s = summarizeTraps([]);
  assert.equal(s.totalFindings, 0);
  assert.equal(s.triggeredKinds.length, 0);
  assert.equal(s.hasFail, false);
  assert.ok(Object.values(s.categoryCounts).every((c) => c === 0));
});

test('all categoryCounts keys present (11 categories)', () => {
  const s = summarizeTraps([finding('fake-pass-forgery', true)]);
  assert.equal(Object.keys(s.categoryCounts).length, 11);
  assert.equal(s.categoryCounts['forgery'], 1);
});
