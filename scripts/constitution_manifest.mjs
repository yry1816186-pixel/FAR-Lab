#!/usr/bin/env node
/**
 * constitution_manifest —— 宪法源文件完整性哈希清单（CORE-GOVCHANGE-001）。
 *
 * 作用：requirements_registry 的 lint 只约束「编译产物格式」；编译器或宪法文件本体被改动
 * 时 lint 仍可能全绿（弱化逃逸）。本脚本把宪法源文件锁定在 sha256 清单上：
 *   --write  生成/刷新 .far/constitution/MANIFEST.sha256（业主交付包变更后的受控动作）
 *   --check  逐文件重算比对，任何漂移 → exit 1（fail-closed：规范变更必须显式过 manifest）
 * 宪法文件在私有 .far 层（业主铁律：不入公开仓库）——本脚本 + 其测试是仓库侧机器层；
 * --check 同时在本地会话启动与 requirements:compile 前运行（宪法被改而 manifest 未更新 = 拒绝）。
 * 诚实边界：manifest 防护「未登记的宪法漂移」；掌握写权限者可同时改文件与 manifest——
 * 该级对手需 git 历史审计/业主交付包重验（超出本层能力）。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONSTITUTION_FILES = [
  'CORE_CONSTITUTION.md',
  'DOMAIN_PROTOCOLS.md',
  'MACHINE_SCHEMAS.yaml',
];

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path), 'utf8').digest('hex');
}

export function manifestLine(file, hash) {
  return `${hash}  ${file}`;
}

export function verifyManifest(srcDir, manifestText) {
  const results = [];
  const recorded = new Map(
    manifestText
      .split(/\r?\n/)
      .filter((l) => /^[0-9a-f]{64}  \S+/.test(l))
      .map((l) => {
        const m = /^([0-9a-f]{64})  (\S+)$/.exec(l);
        return [m[2], m[1]];
      }),
  );
  for (const file of CONSTITUTION_FILES) {
    const path = join(srcDir, file);
    if (!existsSync(path)) {
      results.push({ file, ok: false, kind: 'missing-source' });
      continue;
    }
    const expected = recorded.get(file);
    if (expected === undefined) {
      results.push({ file, ok: false, kind: 'not-in-manifest' });
      continue;
    }
    const actual = sha256File(path);
    results.push({ file, ok: actual === expected, kind: actual === expected ? 'ok' : 'hash-drift', actual });
  }
  // 清单里出现未知的额外条目 → 拒绝（防夹带）
  for (const file of recorded.keys()) {
    if (!CONSTITUTION_FILES.includes(file)) {
      results.push({ file, ok: false, kind: 'unknown-manifest-entry' });
    }
  }
  return results;
}

function main() {
  const mode = process.argv[2];
  const srcDir = '.far/constitution';
  const manifestPath = join(srcDir, 'MANIFEST.sha256');
  if (mode === '--write') {
    if (!existsSync(join(srcDir, CONSTITUTION_FILES[0]))) {
      console.error('constitution_manifest: constitution source missing (fail-closed)');
      process.exit(3);
    }
    const lines = [
      '# MANIFEST.sha256 — 宪法源文件完整性清单（CORE-GOVCHANGE-001）',
      '# 生成：node scripts/constitution_manifest.mjs --write（宪法受控变更后）',
      '# 校验：node scripts/constitution_manifest.mjs --check（漂移 → exit 1）',
      ...CONSTITUTION_FILES.map((f) => manifestLine(f, sha256File(join(srcDir, f)))),
      '',
    ];
    writeFileSync(manifestPath, lines.join('\n'), 'utf8');
    console.log(`constitution_manifest: WROTE ${manifestPath} (${CONSTITUTION_FILES.length} files)`);
    process.exit(0);
  }
  if (mode === '--check') {
    if (!existsSync(manifestPath)) {
      console.error(`constitution_manifest: FAIL — manifest missing: ${manifestPath}（先 --write 生成）`);
      process.exit(1);
    }
    const results = verifyManifest(srcDir, readFileSync(manifestPath, 'utf8'));
    const bad = results.filter((r) => !r.ok);
    if (bad.length > 0) {
      console.error(`constitution_manifest: FAIL — ${bad.length} drift/missing finding(s):`);
      for (const r of bad) console.error(`  [${r.kind}] ${r.file}`);
      process.exit(1);
    }
    console.log(`constitution_manifest: PASS — ${results.length} file(s) verified`);
    process.exit(0);
  }
  console.error('usage: node scripts/constitution_manifest.mjs --write | --check');
  process.exit(2);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('constitution_manifest.mjs')) {
  main();
}
