#!/usr/bin/env node
/**
 * verify_release_checksums.mjs — 发布件哈希清单核验(Phase G)。
 *
 * 生成/校验 .far-release/SHA256SUMS.txt(格式:<sha256>  <相对路径>)。
 * 用法:
 *   node scripts/verify_release_checksums.mjs --write   生成/刷新清单
 *   node scripts/verify_release_checksums.mjs --check   校验(任一不符 → exit 1)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SUMS = join(ROOT, '.far-release', 'SHA256SUMS.txt');
/** 发布件清单(净机安装/复算所需的最小真实文件集) */
const ARTIFACTS = [
  'package.json',
  'pnpm-lock.yaml',
  'scripts/install.sh',
  'scripts/install.ps1',
  'scripts/generate_sbom.mjs',
  '.far-release/sbom.json',
  'benchmark/benchmark_report.json',
  'schema/json/fec.schema.json',
  'schema/json/proof-envelope.schema.json',
  'schema/json/verdict.schema.json',
  'schema/json/data-manifest.schema.json',
];

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const mode = process.argv[2] ?? '--check';
if (mode === '--write') {
  const lines = ARTIFACTS.map((rel) => {
    if (!existsSync(join(ROOT, rel))) {
      console.error(`missing artifact: ${rel}`);
      process.exit(1);
    }
    return `${sha256File(join(ROOT, rel))}  ${rel}`;
  });
  writeFileSync(SUMS, lines.join('\n') + '\n', 'utf8');
  console.log(`checksums: written → ${SUMS}(${lines.length} entries)`);
  process.exit(0);
}

if (!existsSync(SUMS)) {
  console.error(`checksums: ${SUMS} 不存在(先跑 --write)`);
  process.exit(1);
}
let bad = 0;
for (const line of readFileSync(SUMS, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (t === '') continue;
  const parts = t.split(/\s+/);
  const hash = parts[0];
  const rel = parts[parts.length - 1];
  if (rel === undefined || hash === undefined) {
    bad += 1;
    console.error(`checksums: malformed line: ${t}`);
    continue;
  }
  if (!existsSync(join(ROOT, rel))) {
    bad += 1;
    console.error(`checksums: MISSING ${rel}`);
    continue;
  }
  const actual = sha256File(join(ROOT, rel));
  if (actual !== hash) {
    bad += 1;
    console.error(`checksums: MISMATCH ${rel}(expected ${hash.slice(0, 16)}… actual ${actual.slice(0, 16)}…)`);
  }
}
console.log(bad === 0 ? `checksums: OK(${ARTIFACTS.length} entries)` : `checksums: FAIL(${bad} problems)`);
process.exit(bad === 0 ? 0 : 1);
