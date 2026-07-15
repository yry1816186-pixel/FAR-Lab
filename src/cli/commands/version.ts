// src/cli/commands/version.ts
// far version —— 打印版本号 + git HEAD。
// 与 packages/cli 对齐（v0.1.0 开源发布形态）。读根 package.json，向上定位含 src/cli/far.ts 的根。

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { DEMO_GIT_COMMIT_SHA } from '../../far_proof/demo_chain.ts';

function readRootPackage(): { readonly name: string; readonly version: string } | null {
  const pkgPath = resolve(PACKAGE_ROOT, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const j = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string };
    return { name: j.name ?? 'far-chain', version: j.version ?? '0.0.0' };
  } catch {
    return null;
  }
}

export function runVersion(): number {
  const pkg = readRootPackage();
  const resolved = resolveGitCommitSha();
  const sha = resolved === DEMO_GIT_COMMIT_SHA ? null : resolved.slice(0, 12);
  process.stdout.write(`${pkg?.name ?? 'far-chain'} ${pkg?.version ?? '0.0.0'} · git ${sha ?? '(not a git checkout)'}\n`);
  process.stdout.write('  Falsification-Anchored Research Chain · deterministic R0-R9 kernel · tamper-detectable · anti-theater\n');
  return 0;
}
