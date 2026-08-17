// tests/governance/adr_schema.test.ts
//
// CORE-DECISION-001 验收：ADR schema 完整（7 槽位）+ 台账解析 fail-closed + 真实台账实跑。
// 「关键假设已登记」腿：UNKNOWN_REGISTRY assumptions（PR #59）——见文末对账测试。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AdrEntrySchema, parseDecisionLedger } from '../../src/governance/adr_schema.ts';
import { lintRegistry } from '../../src/governance/unknown_registry.ts';
import { GovernanceRegistrySchema } from '../../src/governance/types.ts';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LEDGER = `# 决策择优台账

## D-2026-08-15-01 完整样例决策

- **背景**：需要决策的背景描述。
- **候选**：① 方案一 ② 方案二。
- **所选**：①。
- **依据**：方案一先行依赖更少。
- **弃因**：② 阻塞于前置。
- **回滚**：删目录。
`;

test('schema: 7 槽位完整通过；缺任一必填槽位拒绝（fail-closed）', () => {
  const base = {
    id: 'D-2026-08-15-01',
    title: '完整样例',
    context: 'c',
    options: 'o',
    chosen: 'x',
    rationale: 'r',
    rejectedReasons: 'j',
    rollback: 'rb',
  };
  assert.equal(AdrEntrySchema.safeParse(base).success, true);
  for (const field of ['id', 'title', 'context', 'options', 'chosen', 'rejectedReasons', 'rollback']) {
    const partial = { ...base } as Record<string, unknown>;
    delete partial[field];
    assert.equal(AdrEntrySchema.safeParse(partial).success, false, `missing ${field} must fail`);
  }
  // rationale 允许 null（部分决策以弃因表达全部理由）
  assert.equal(AdrEntrySchema.safeParse({ ...base, rationale: null }).success, true);
  // 坏 id 形状拒绝
  assert.equal(AdrEntrySchema.safeParse({ ...base, id: 'D-bad' }).success, false);
});

test('parser: 完整台账全过；缺槽位块计入 violations（不静默跳过）', () => {
  const ok = parseDecisionLedger(LEDGER);
  assert.equal(ok.entries.length, 1);
  assert.equal(ok.entries[0]!.id, 'D-2026-08-15-01');
  assert.equal(ok.entries[0]!.rationale, '方案一先行依赖更少。');
  assert.deepEqual(ok.violations, []);

  const broken = LEDGER.replace('- **弃因**：② 阻塞于前置。\n', '');
  const bad = parseDecisionLedger(broken);
  assert.equal(bad.entries.length, 0);
  assert.equal(bad.violations.length, 1);
  assert.deepEqual(bad.violations[0]!.missingFields, ['弃因']);
});

test('parser: 确定性（同文本同结果）', () => {
  const a = JSON.stringify(parseDecisionLedger(LEDGER));
  const b = JSON.stringify(parseDecisionLedger(LEDGER));
  assert.equal(a, b);
});

test('real ledger: 私有层存在时实跑 PASS（CI 无 .far 层 → skip-if-absent）', (t) => {
  const ledgerPath = join(REPO, '.far', 'agent', 'decisions.md');
  if (!existsSync(ledgerPath)) {
    t.skip('decision ledger is machine-local (gitignored) — verified on dev machines');
    return;
  }
  const { entries, violations } = parseDecisionLedger(readFileSync(ledgerPath, 'utf8'));
  assert.deepEqual(violations, []);
  assert.ok(entries.length >= 5, `expected real ledger entries, got ${entries.length}`);
});

test('CORE-DECISION-001 对账: 关键假设已登记（UNKNOWN_REGISTRY assumptions ≥1 且 lint-clean）', (t) => {
  const registryPath = join(REPO, '.far', 'state', 'UNKNOWN_REGISTRY.yaml');
  if (!existsSync(registryPath)) {
    t.skip('unknown registry is machine-local — verified on dev machines');
    return;
  }
  const registry = GovernanceRegistrySchema.parse(parseYaml(readFileSync(registryPath, 'utf8')));
  assert.ok(registry.assumptions.length >= 3, 'key assumptions must be registered');
  assert.deepEqual(lintRegistry(registry), []);
});
