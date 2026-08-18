// tests/governance/borrow_registry.test.ts
//
// CORE-BORROW-001 验收测试：真实依赖清单纪律——新增依赖必须有 alternatives-
// considered 记录（与 dependency_risk.checkDependencyAdditions 对齐）、试用
// 证据路径必须真实存在、候选集比较 ≥2。repo 根由 import.meta.url 推导（可移植）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BORROW_INVENTORY,
  checkBorrowDiscipline,
  type BorrowRecord,
} from '../../src/governance/borrow_registry.ts';
import { checkDependencyAdditions } from '../../src/security/dependency_risk.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeRecord(overrides: Partial<BorrowRecord> = {}): BorrowRecord {
  return {
    technology: 'zod',
    usedFor: 'schema SSOT',
    alternativesConsidered: [
      { name: 'ajv', whyRejected: '无 TS 类型推导' },
      { name: 'io-ts', whyRejected: '与结构化输出直通不匹配' },
    ],
    trialEvidence: ['tests:tests/schema/schema_smoke.test.ts'],
    decision: 'adopted',
    decidedAt: '2026-03-12',
    ...overrides,
  };
}

test('real inventory: every production dependency in package.json has a borrow record with valid on-disk evidence', () => {
  const pkg = JSON.parse(readPkg()) as { dependencies: Record<string, string> };
  const deps = Object.keys(pkg.dependencies);
  assert.ok(deps.length >= 13, 'production dependency set sanity');
  const check = checkBorrowDiscipline(BORROW_INVENTORY, REPO_ROOT, deps);
  assert.deepEqual(
    { unrecorded: check.unrecorded, broken: check.brokenEvidence, thin: check.thinComparisons },
    { unrecorded: [], broken: [], thin: [] },
    `every prod dep must be recorded with ≥2 alternatives and existing evidence paths (got ${JSON.stringify(check)})`,
  );
});

test('unrecorded dependency fails the gate and is listed', () => {
  const check = checkBorrowDiscipline([makeRecord()], REPO_ROOT, ['zod', 'left-pad']);
  assert.equal(check.ok, false);
  assert.deepEqual(check.unrecorded, ['left-pad']);
});

test('broken trial-evidence path (file that does not exist) fails the gate', () => {
  const check = checkBorrowDiscipline(
    [makeRecord({ trialEvidence: ['tests:tests/does-not-exist/ghost.test.ts'] })],
    REPO_ROOT,
    ['zod'],
  );
  assert.equal(check.ok, false);
  assert.deepEqual(check.brokenEvidence, [{ technology: 'zod', path: 'tests/does-not-exist/ghost.test.ts' }]);
  // cmd: 证据形态不做存在性检查（运行时命令），但非法 kind 拒绝。
  const badKind = checkBorrowDiscipline([makeRecord({ trialEvidence: ['wat:somewhere'] })], REPO_ROOT, ['zod']);
  assert.equal(badKind.ok, false);
  assert.ok(badKind.brokenEvidence.some((b) => b.path === 'wat:somewhere'));
});

test('thin comparison (<2 alternatives) fails even when evidence exists', () => {
  const check = checkBorrowDiscipline(
    [makeRecord({ alternativesConsidered: [{ name: 'only-one', whyRejected: 'x' }] })],
    REPO_ROOT,
    ['zod'],
  );
  assert.equal(check.ok, false);
  assert.deepEqual(check.thinComparisons, ['zod']);
});

test('addition detection aligns with dependency_risk.checkDependencyAdditions (same diff semantics)', () => {
  const check = checkBorrowDiscipline(
    [makeRecord()],
    REPO_ROOT,
    ['zod', 'better-sqlite3'],
    ['zod'],
  );
  assert.deepEqual(
    check.additions.map((a) => a.name),
    ['better-sqlite3'],
  );
  // 与源函数语义一致（对齐面：同一 prev/current → 同一检出）。
  assert.deepEqual(
    checkDependencyAdditions(['zod'], ['zod', 'better-sqlite3']).map((a) => a.name),
    ['better-sqlite3'],
  );
  // 全量盘点模式（无 prev）：additions 为空——记录完备性单独由 unrecorded 管。
  const full = checkBorrowDiscipline([makeRecord()], REPO_ROOT, ['zod']);
  assert.deepEqual(full.additions, []);
});

function readPkg(): string {
  return readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
}
