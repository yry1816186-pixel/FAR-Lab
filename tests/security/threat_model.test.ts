// tests/security/threat_model.test.ts
// SEC-THREAT-001：14 面系统级威胁模型——结构完备性 / 真实资产绑定 / 架构 diff 同步 /
// 高风险路径测试存在性。真实树验证（无 mock·无 fixture 代替现实）；同步判别力由
// 合成目录清单双向验证（新模块未登记 fail·登记项消失 fail）。

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  CONSTITUTION_FACETS,
  HIGH_RISK_PATH_TESTS,
  SURFACE_MODULE_MAP,
  THREAT_SURFACES,
  checkThreatModelSync,
  syncStatus,
  verifyHighRiskPathTests,
} from '../../src/security/threat_model.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// 结构完备性：14 面·逐面字段非空
// ---------------------------------------------------------------------------

test('SEC-THREAT-001: 恰好 14 个威胁面，id 唯一，覆盖宪法 14 facet 逐字清单', () => {
  assert.equal(THREAT_SURFACES.length, 14, 'surface count must be exactly 14');
  const ids = THREAT_SURFACES.map((s) => s.id);
  assert.equal(new Set(ids).size, 14, 'surface ids must be unique');
  // 每个 facet 至少被一个 surface 声明覆盖。
  const declaredFacets = new Set(THREAT_SURFACES.flatMap((s) => s.facets));
  for (const facet of CONSTITUTION_FACETS) {
    assert.ok(
      declaredFacets.has(facet),
      `constitution facet not covered by any surface: ${facet}`,
    );
  }
  assert.equal(CONSTITUTION_FACETS.length, 14, 'constitution enumeration has 14 facets');
});

test('SEC-THREAT-001: 每面 assets/actors/trustBoundary/abuseCases/mitigations/residualRisk/owner 非空', () => {
  for (const s of THREAT_SURFACES) {
    assert.ok(s.id && s.title, `surface ${s.id} has id/title`);
    assert.ok(s.assets.length >= 1, `${s.id}: assets non-empty`);
    assert.ok(s.actors.length >= 1, `${s.id}: actors non-empty`);
    assert.ok(s.trustBoundary.length >= 1, `${s.id}: trustBoundary non-empty`);
    assert.ok(s.abuseCases.length >= 1, `${s.id}: abuseCases non-empty`);
    assert.ok(s.mitigations.length >= 1, `${s.id}: mitigations non-empty`);
    assert.ok(s.residualRisk.length >= 1, `${s.id}: residualRisk non-empty`);
    assert.ok(s.owner.length >= 1, `${s.id}: owner non-empty`);
    for (const ab of s.abuseCases) {
      assert.ok(['high', 'medium', 'low'].includes(ab.severity), `${s.id}: valid severity`);
      assert.ok(ab.case.length >= 10, `${s.id}: abuse case descriptive`);
    }
  }
});

test('SEC-THREAT-001: 每面 mitigation 绑定的真实仓库资产路径在磁盘上存在', () => {
  for (const s of THREAT_SURFACES) {
    for (const m of s.mitigations) {
      assert.ok(
        existsSync(join(REPO_ROOT, m.asset)),
        `${s.id}: mitigation asset missing on disk: ${m.asset}`,
      );
    }
  }
});

test('SEC-THREAT-001: 高风险面（high severity abuse case）必须 ≥1 个 mitigation', () => {
  for (const s of THREAT_SURFACES) {
    const hasHigh = s.abuseCases.some((ab) => ab.severity === 'high');
    if (hasHigh) {
      assert.ok(s.mitigations.length >= 1, `${s.id}: high-severity surface needs mitigations`);
    }
  }
});

test('SEC-THREAT-001: SURFACE_MODULE_MAP 引用的面 id 全部存在于 THREAT_SURFACES', () => {
  const ids = new Set(THREAT_SURFACES.map((s) => s.id));
  for (const [dir, surfaces] of Object.entries(SURFACE_MODULE_MAP)) {
    assert.ok(surfaces.length >= 1, `${dir}: mapped to at least one surface`);
    for (const sid of surfaces) {
      assert.ok(ids.has(sid), `${dir} references unknown surface id: ${sid}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 架构 diff 同步：src/ 顶层目录清单 ↔ SURFACE_MODULE_MAP 双向
// ---------------------------------------------------------------------------

test('SEC-THREAT-001: 真实仓库树在同步状态（无未登记顶层模块）', () => {
  const result = checkThreatModelSync(REPO_ROOT);
  assert.equal(result.ok, true, `unregistered: ${result.unregistered.join(', ')} / stale: ${result.registeredUnused.join(', ')}`);
  assert.equal(result.unregistered.length, 0);
  assert.equal(result.registeredUnused.length, 0);
  assert.ok(result.topLevelDirs.length >= 30, 'real src/ has dozens of top-level modules');
});

test('SEC-THREAT-001 判别力: 新增未登记顶层模块 → fail（架构 diff 未同步威胁模型）', () => {
  const result = syncStatus(['api', 'security', 'brand_new_module']);
  assert.equal(result.ok, false, 'unregistered module must fail sync');
  assert.deepEqual(result.unregistered, ['brand_new_module']);
  // 隔离判定：完整登记集 + 仅 1 个未登记目录——ok 必须因 unregistered 而 false
  //（registeredUnused 此时为空——排除 ok=false 的另一来源）。
  const fullPlusOne = [...Object.keys(SURFACE_MODULE_MAP), 'brand_new_module'];
  const isolated = syncStatus(fullPlusOne);
  assert.equal(isolated.registeredUnused.length, 0, 'fixture sanity: no stale entries');
  assert.deepEqual(isolated.unregistered, ['brand_new_module']);
  assert.equal(isolated.ok, false, 'unregistered alone must fail ok');
});

test('SEC-THREAT-001 判别力: 登记模块从代码树消失 → fail（威胁模型陈旧）', () => {
  const result = syncStatus(['api']);
  assert.equal(result.ok, false, 'stale registry entries must fail sync');
  assert.ok(result.registeredUnused.includes('security'), 'security dir is registered but absent from synthetic tree');
  assert.ok(result.registeredUnused.length > 10, 'most registered dirs absent in single-dir synthetic tree');
});

// ---------------------------------------------------------------------------
// 高风险路径测试存在性
// ---------------------------------------------------------------------------

test('SEC-THREAT-001: highRiskPathTests 映射的真实测试文件全部存在', () => {
  assert.ok(HIGH_RISK_PATH_TESTS.length >= 8, 'at least 8 high-risk path test mappings');
  const surfaces = new Set(THREAT_SURFACES.map((s) => s.id));
  for (const t of HIGH_RISK_PATH_TESTS) {
    assert.ok(surfaces.has(t.surface), `mapping references known surface: ${t.surface}`);
    assert.ok(t.risk.length > 0 && t.testFile.length > 0, 'mapping fields non-empty');
  }
  const result = verifyHighRiskPathTests(REPO_ROOT);
  assert.equal(result.ok, true, `missing test files: ${result.missing.join(', ')}`);
});

test('SEC-THREAT-001 篡改: 测试文件路径被替换 → existsSync 检出 missing', () => {
  const tampered = HIGH_RISK_PATH_TESTS.map((t, i) =>
    i === 0 ? { ...t, testFile: 'tests/does_not_exist_999.test.ts' } : t,
  );
  const result = verifyHighRiskPathTests(REPO_ROOT, tampered);
  assert.equal(result.ok, false, 'tampered mapping must be detected');
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0] ?? '', /does_not_exist_999/);
});

test('SEC-THREAT-001: 高风险面全部有测试映射覆盖（authn/sandbox/proof-tamper/supply-chain）', () => {
  const covered = new Set(HIGH_RISK_PATH_TESTS.map((t) => t.surface));
  for (const required of ['authn-authz', 'sandbox-escape', 'proof-tamper', 'supply-chain']) {
    assert.ok(covered.has(required), `high-risk surface must map to real tests: ${required}`);
  }
});
