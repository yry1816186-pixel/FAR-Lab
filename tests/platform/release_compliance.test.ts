// tests/platform/release_compliance.test.ts
// REL-COMPLIANCE-001：十项合规 checklist 绑定真实资产 / 缺失 fail-closed /
// LEGAL_UNKNOWNS 登记一致 / release inventory 完整 / 汇总 readiness。无 mock。

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPLIANCE_CHECKLIST,
  LEGAL_UNKNOWNS,
  complianceReadiness,
  releaseInventory,
  runComplianceChecklist,
  verifyLegalUnknowns,
  type ComplianceItemId,
} from '../../src/release/compliance.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const EXPECTED_IDS: ComplianceItemId[] = [
  'project-license',
  'notice',
  'dependency-licenses',
  'dataset-licenses',
  'attribution',
  'redistribution',
  'privacy-retention',
  'security-policy',
  'contribution-terms',
  'ai-disclosures',
];

test('REL-COMPLIANCE-001 checklist: 十项唯一全覆盖 + 每项有 cannot-prove 声明', () => {
  assert.equal(COMPLIANCE_CHECKLIST.length, 10);
  assert.deepEqual(
    [...COMPLIANCE_CHECKLIST.map((c) => c.id)].sort(),
    [...EXPECTED_IDS].sort(),
  );
  for (const item of COMPLIANCE_CHECKLIST) {
    assert.ok(item.requirement.length > 0, `${item.id} requirement empty`);
    assert.ok(item.assets.length >= 1, `${item.id} no bound asset`);
    assert.ok(item.cannotProve.length > 0, `${item.id} cannot-prove empty（逐项诚实边界）`);
  }
});

test('REL-COMPLIANCE-001 真实仓库: 十项全过（资产存在 + 关键标记在位）', () => {
  const checks = runComplianceChecklist(REPO_ROOT);
  for (const check of checks) {
    assert.equal(check.ok, true, `[${check.id}] ${check.problems.join('; ')}`);
  }
  assert.equal(checks.length, 10);
});

test('REL-COMPLIANCE-001 fail-closed: 空目录假 repo → 十项全败（缺失列名）', () => {
  const farRoot = join(REPO_ROOT, '.far');
  mkdirSync(farRoot, { recursive: true });
  const fakeRoot = mkdtempSync(join(farRoot, 'tmp-empty-repo-'));
  try {
    const checks = runComplianceChecklist(fakeRoot);
    for (const check of checks) {
      assert.equal(check.ok, false, `${check.id} should fail on empty repo`);
      assert.ok(check.problems.length >= 1);
      assert.ok((check.problems[0] ?? '').includes('missing'), check.problems.join('; '));
    }
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test('REL-COMPLIANCE-001 LEGAL_UNKNOWNS: 登记一致 + 第三方元数据再分发不确定→仅元数据模式', () => {
  const verify = verifyLegalUnknowns();
  assert.equal(verify.ok, true, verify.problems.join('; '));
  assert.ok(LEGAL_UNKNOWNS.length >= 2);
  const ids = new Set(LEGAL_UNKNOWNS.map((u) => u.id));
  assert.ok(ids.has('LU-001') && ids.has('LU-002'));
  const crossref = LEGAL_UNKNOWNS.find((u) => u.id === 'LU-001');
  assert.equal(crossref?.status, 'RESOLVED_METADATA_ONLY');
  assert.ok(crossref?.mitigation.includes('仅元数据'), '缓解 = 仅元数据模式');
  assert.ok(crossref?.affectedAsset.includes('src/retrieval/types.ts'), '引用现有 citation/license gate 资产');
  // OPEN 项必须仍有缓解（无缓解的 OPEN 不可发布）
  const open = LEGAL_UNKNOWNS.filter((u) => u.status === 'OPEN');
  assert.ok(open.every((u) => u.mitigation.length > 0));
});

test('REL-COMPLIANCE-001 release inventory: package.json files 正条目 + 根文档全部存在', () => {
  const inventory = releaseInventory(REPO_ROOT);
  for (const entry of inventory) {
    assert.equal(entry.exists, true, `declared release path missing: ${entry.path}`);
  }
  const paths = inventory.map((e) => e.path);
  for (const doc of ['LICENSE', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'README.md']) {
    assert.ok(paths.includes(doc), `${doc} not in inventory`);
  }
  // 发布代码面在清单里（src/schema/golden_vectors——package.json files 声明）
  for (const shipped of ['src', 'schema', 'golden_vectors']) {
    assert.ok(paths.includes(shipped), `${shipped} not in inventory`);
  }
});

test('REL-COMPLIANCE-001 汇总: complianceReadiness 在真实仓库上 ready', () => {
  const readiness = complianceReadiness(REPO_ROOT);
  assert.equal(readiness.ready, true, readiness.blockers.join(' | '));
  assert.equal(readiness.checklist.length, 10);
  assert.equal(readiness.legalUnknownsOk, true);
  assert.equal(readiness.blockers.length, 0);
});
