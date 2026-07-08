// src/cli/commands/version.ts
// far version —— 打印版本号 + git HEAD。
// 与 packages/cli 对齐（v0.1.0 开源发布形态）。读根 package.json，向上定位含 src/cli/far.ts 的根。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGitCommitSha } from '../git_commit_sha.ts';

function readRootPackage(): { readonly name: string; readonly version: string } | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(dir, 'src/cli/far.ts')) && existsSync(resolve(dir, 'package.json'))) {
      try {
        const j = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as { name?: string; version?: string };
        return { name: j.name ?? 'far-chain', version: j.version ?? '0.0.0' };
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function runVersion(): number {
  const pkg = readRootPackage();
  const sha = resolveGitCommitSha().slice(0, 12);
  process.stdout.write(`${pkg?.name ?? 'far-chain'} ${pkg?.version ?? '0.0.0'} · git ${sha}\n`);
  process.stdout.write('  Falsification-Anchored Research Chain · 确定性 R0-R9 内核 · 篡改可检测 · 反剧场\n');
  return 0;
}
