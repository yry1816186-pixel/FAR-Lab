#!/usr/bin/env node
/**
 * generate_sbom.mjs — SBOM 生成(Phase G · SEC-007 供应链基线)。
 *
 * 内容:直接依赖+版本(package.json)+devDependencies、lockfile sha256、
 * node_modules 顶层包许可证清单(读各包 package.json license 字段)、
 * Node/平台指纹。确定性(无时间戳;license 扫描按包名排序)。
 *
 * 用法:node scripts/generate_sbom.mjs [--out <path>]  (默认 .far-release/sbom.json)
 * 退出码:0 成功;1 缺依赖目录(lockfile/node_modules 缺失)。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? args[outIdx + 1] : join(ROOT, '.far-release', 'sbom.json');
if (OUT === undefined) throw new Error('--out requires a value');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lockPath = join(ROOT, 'pnpm-lock.yaml');
if (!existsSync(lockPath)) {
  console.error('sbom: pnpm-lock.yaml 缺失(lockfile 固定是 SEC-007 基线)');
  process.exit(1);
}
const lockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');

function readLicense(name) {
  try {
    const p = JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
    const lic = p.license ?? p.licenses ?? 'UNKNOWN';
    return typeof lic === 'string' ? lic : JSON.stringify(lic);
  } catch {
    return 'UNREADABLE';
  }
}

const directDeps = Object.entries(pkg.dependencies ?? {}).map(([name, range]) => ({
  name,
  range,
  license: readLicense(name),
}));
const directDevDeps = Object.entries(pkg.devDependencies ?? {}).map(([name, range]) => ({
  name,
  range,
  license: readLicense(name),
}));

let topLevelCount = 0;
const licenseHistogram = {};
const nmDir = join(ROOT, 'node_modules');
if (existsSync(nmDir)) {
  for (const entry of readdirSync(nmDir)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      try {
        for (const sub of readdirSync(join(nmDir, entry))) {
          topLevelCount += 1;
          const lic = readLicense(`${entry}/${sub}`);
          licenseHistogram[lic] = (licenseHistogram[lic] ?? 0) + 1;
        }
      } catch {
        // 非目录条目跳过
      }
    } else {
      topLevelCount += 1;
      const lic = readLicense(entry);
      licenseHistogram[lic] = (licenseHistogram[lic] ?? 0) + 1;
    }
  }
}
for (const dep of [...directDeps, ...directDevDeps]) {
  licenseHistogram[dep.license] = licenseHistogram[dep.license] ?? 0;
}

const sbom = {
  bomFormat: 'farlab-sbom-lite',
  specVersion: '1.0',
  authority: 'SEC-007(供应链基线;CycloneDX 完整导出=V2 延期登记)',
  name: pkg.name,
  version: pkg.version,
  packageManager: pkg.packageManager,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  lockfile: { file: 'pnpm-lock.yaml', sha256: lockHash },
  directDependencies: directDeps,
  directDevDependencies: directDevDeps,
  topLevelPackageCount: topLevelCount,
  licenseHistogram,
  notes: [
    '许可证数据来自各包 package.json license 字段(未做 SPDX 全量解析;许可证监控深度=DEF-15 登记)',
    'SBOM 内容确定性(无时间戳);lockfile sha256 供产物-源码哈希比对',
  ],
};

mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, JSON.stringify(sbom, null, 2) + '\n', 'utf8');
console.log(`sbom: written → ${OUT}`);
console.log(`  direct deps: ${directDeps.length} + devDeps: ${directDevDeps.length};top-level: ${topLevelCount};lockfile sha256: ${lockHash.slice(0, 16)}…`);
console.log(`  licenses: ${JSON.stringify(licenseHistogram)}`);
