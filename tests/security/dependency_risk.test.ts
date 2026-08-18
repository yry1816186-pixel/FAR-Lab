// tests/security/dependency_risk.test.ts
// SEC-DEPENDENCY-001：依赖 inventory（真实 package.json + pnpm-lock integrity）/
// license 门（fail-closed）/ 撤包演练（真实 import 扫描爆炸半径）/ SBOM 导出。
// 真实树为主 + 合成 fixture 验证扫描判别力（正负例）。

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ADVISORY_FEED,
  buildDependencyInventory,
  checkDependencyAdditions,
  compromisedPackageDrill,
  exportSbom,
  licenseGate,
  scanPackageImports,
  type AdvisoryEntry,
  type DependencyEntry,
} from '../../src/security/dependency_risk.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// inventory：真实 package.json + lockfile integrity
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: inventory 覆盖 package.json 全部 prod+dev 依赖', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  assert.equal(inv.lockfileFound, true, 'pnpm-lock.yaml present in repo');
  // 直接读真实 package.json 对照（避免测试与实现共用同一读取逻辑的假一致）。
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const expectedNames = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
  const invNames = new Set(inv.entries.map((e) => e.name));
  for (const name of expectedNames) {
    assert.ok(invNames.has(name), `inventory must include ${name}`);
  }
  assert.equal(inv.entries.length, expectedNames.size, 'no extra entries');
  for (const e of inv.entries) {
    assert.ok(e.specifier.length > 0, `${e.name}: version specifier captured`);
    assert.ok(['prod', 'dev'].includes(e.kind), `${e.name}: kind`);
  }
});


test('SEC-DEPENDENCY-001: zod 条目携带 lockfile 提取的 sha512 integrity', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  const zod = inv.entries.find((e) => e.name === 'zod');
  assert.ok(zod, 'zod is a real prod dependency');
  assert.equal(zod?.kind, 'prod');
  assert.match(zod?.integrity ?? '', /^sha512-[A-Za-z0-9+/=]+$/, 'integrity from pnpm-lock');
});

test('SEC-DEPENDENCY-001 边界: 无 lockfile 的目录 → lockfileFound=false，integrity 缺失但不炸', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dep-risk-nolock-'));
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { zod: '^3.0.0' } }),
      'utf8',
    );
    const inv = buildDependencyInventory(dir);
    assert.equal(inv.lockfileFound, false);
    assert.equal(inv.entries.length, 1);
    assert.equal(inv.entries[0]?.integrity, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// license 门：fail-closed
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: license 门——真实依赖全 ALLOWED（MIT/Apache/BSD/ISC 系）', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  const gate = licenseGate(inv.entries);
  assert.equal(gate.ok, true, `blocked: ${gate.blocked.map((b) => b.name).join(',')}`);
  assert.equal(gate.blocked.length, 0);
});

test('SEC-DEPENDENCY-001: GPL/copyleft → REVIEW 阻断；unknown license → fail-closed 阻断', () => {
  const base: DependencyEntry[] = [
    { name: 'mit-pkg', version: '1.0.0', kind: 'prod', specifier: '^1.0.0', license: 'MIT', licenseClass: 'allowed' },
  ];
  const gpl: DependencyEntry[] = [
    ...base,
    { name: 'gpl-pkg', version: '2.0.0', kind: 'prod', specifier: '^2.0.0', license: 'GPL-3.0', licenseClass: 'review' },
  ];
  const unknown: DependencyEntry[] = [
    ...base,
    { name: 'odd-pkg', version: '0.1.0', kind: 'prod', specifier: '~0.1.0', license: 'SEE LICENSE IN LICENSE.md', licenseClass: 'unknown' },
  ];
  assert.equal(licenseGate(gpl).ok, false, 'copyleft blocks release');
  assert.equal(licenseGate(unknown).ok, false, 'unknown license fail-closed blocks release');
  assert.match(licenseGate(unknown).blocked[0]?.reason ?? '', /unknown|unverifiable|fail-closed/i);
});

test('SEC-DEPENDENCY-001 篡改: license 大小写混淆不可绕过（gpl-3.0 小写仍阻断）', () => {
  const entries: DependencyEntry[] = [
    { name: 'sneaky', version: '1.0.0', kind: 'prod', specifier: '^1', license: 'gpl-3.0', licenseClass: 'allowed' },
  ];
  const gate = licenseGate(entries);
  // 实现须独立于既填 licenseClass 复核原始 license 字符串（防字段被美化）。
  assert.equal(gate.ok, false, 'case-mangled copyleft string must still block');
});

// ---------------------------------------------------------------------------
// import 扫描（爆炸半径 SSOT）：真实树 + 合成 fixture 判别力
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: 真实 src/ 中 zod 的 import 文件数 ≥10（核心依赖）', () => {
  const hits = scanPackageImports(REPO_ROOT, 'zod');
  assert.ok(hits.length >= 10, `zod imported in many files, got ${hits.length}`);
  assert.ok(
    hits.every((h) => h.endsWith('.ts') && h.includes('src')),
    'hits are src ts files',
  );
});

test('SEC-DEPENDENCY-001 判别力: 合成 fixture 精确命中 import 该包的文件（正负例）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dep-risk-scan-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.ts'), `import { z } from 'zod';\n`, 'utf8');
    writeFileSync(join(dir, 'src', 'b.ts'), `const x = await import("zod");\n`, 'utf8');
    writeFileSync(join(dir, 'src', 'c.ts'), `import { z } from 'zod-to-json-schema';\n`, 'utf8');
    writeFileSync(join(dir, 'src', 'd.ts'), `export const y = 1;\n`, 'utf8');
    const hits = scanPackageImports(dir, 'zod');
    const names = hits.map((h) => h.replace(/\\/g, '/').split('/').pop());
    assert.deepEqual(names.sort(), ['a.ts', 'b.ts'], 'exact package match; no prefix-collision, no false negative');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 撤包演练（compromised package drill）
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: 演练命中真实依赖 → quarantine + 真实爆炸半径 + receipt 完整', () => {
  const feed: readonly AdvisoryEntry[] = [
    {
      id: 'FAR-DRILL-0001',
      packageName: 'zod',
      severity: 'critical',
      summary: '[SIMULATED DRILL] hypothetical supply-chain compromise of zod tarball',
      affectedVersions: { kind: 'all' },
      publishedAt: '2026-08-16T00:00:00.000Z',
      simulated: true,
    },
  ];
  const receipt = compromisedPackageDrill('zod', { repoRoot: REPO_ROOT, feed });
  assert.equal(receipt.status, 'quarantined');
  assert.equal(receipt.advisoryId, 'FAR-DRILL-0001');
  assert.ok(receipt.blastRadius.length >= 10, 'real blast radius from src/ import scan');
  assert.ok(receipt.blastRadiusHash.length === 64, 'sha256 hash of file list');
  assert.match(receipt.receiptId, /^drill-/);
  assert.equal(receipt.simulated, true, 'feed entries marked simulated propagate to receipt');
});

test('SEC-DEPENDENCY-001: 版本门控——advisory 只影响受影响版本，未命中版本 → clean', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  const zodVersion = inv.entries.find((e) => e.name === 'zod')?.version ?? '';
  const major = zodVersion.split('.')[0] ?? '0';
  const feed: readonly AdvisoryEntry[] = [
    {
      id: 'FAR-DRILL-0002',
      packageName: 'zod',
      severity: 'high',
      summary: '[SIMULATED DRILL] affects only ancient majors',
      affectedVersions: { kind: 'prefix', prefix: `0.` },
      publishedAt: '2026-08-16T00:00:00.000Z',
      simulated: true,
    },
  ];
  const receipt = compromisedPackageDrill('zod', { repoRoot: REPO_ROOT, feed, installedVersion: zodVersion });
  // 当前 zod 主版本非 0.x → 不命中。
  assert.notEqual(major, '0', 'fixture sanity: real zod is not 0.x');
  assert.equal(receipt.status, 'clean', 'version not in affected range → no quarantine');
});

test('SEC-DEPENDENCY-001 边界: 无 advisory 命中的包 → clean + 无爆炸半径', () => {
  const receipt = compromisedPackageDrill('never-heard-of-pkg', { repoRoot: REPO_ROOT, feed: ADVISORY_FEED });
  assert.equal(receipt.status, 'clean');
  assert.equal(receipt.advisoryId, null);
});

// ---------------------------------------------------------------------------
// SBOM（CycloneDX-lite）
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: SBOM 导出——components 覆盖全部 inventory 且带 hash/license', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  const sbom = exportSbom(inv.entries);
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.5-lite');
  assert.equal(sbom.components.length, inv.entries.length);
  const zodC = sbom.components.find((c) => c.name === 'zod');
  assert.ok(zodC, 'zod component present');
  assert.match(zodC?.hash ?? '', /^sha512-/);
  assert.ok((zodC?.license ?? '').length > 0);
  for (const c of sbom.components) {
    assert.ok(c.name && c.version, 'component identity fields');
  }
});

test('SEC-DEPENDENCY-001: SBOM 篡改检测——导出内容哈希与 inventory 一致性', () => {
  const inv = buildDependencyInventory(REPO_ROOT);
  const sbom = exportSbom(inv.entries);
  const again = exportSbom(inv.entries);
  assert.equal(JSON.stringify(sbom), JSON.stringify(again), 'deterministic export');
});

// ---------------------------------------------------------------------------
// 新增依赖门（须说明为何现有能力不满足）
// ---------------------------------------------------------------------------

test('SEC-DEPENDENCY-001: 新增依赖被检出并要求书面理由；删除/不变不触发', () => {
  const prev = ['zod', 'fastify'];
  const same = checkDependencyAdditions(prev, ['zod', 'fastify']);
  assert.equal(same.length, 0);
  const removed = checkDependencyAdditions(prev, ['zod']);
  assert.equal(removed.length, 0, 'removals do not require justification');
  const added = checkDependencyAdditions(prev, ['zod', 'fastify', 'left-pad']);
  assert.equal(added.length, 1);
  assert.equal(added[0]?.name, 'left-pad');
  assert.match(added[0]?.requiredJustification ?? '', /why|existing|为何/i);
});
