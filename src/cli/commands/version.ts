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

/**
 * run version.
 * `--json`：stdout = 单个合法 JSON 文档（CLI_JSON_CONTRACT_CENSUS §4-1），banner 抑制。
 * 未知参数：fail-closed —— stderr usage + exit 2（修复前为静默忽略，普查实证 P2-1）。
 */
export function runVersion(args: readonly string[] = []): number {
  const json = args.includes('--json');
  const unknown = args.filter((a) => a !== '--json');
  if (unknown.length > 0) {
    process.stderr.write(`far version: unknown argument '${unknown[0]}'\n  usage: far version [--json]\n`);
    return 2;
  }
  const pkg = readRootPackage();
  const resolved = resolveGitCommitSha();
  const sha = resolved === DEMO_GIT_COMMIT_SHA ? null : resolved.slice(0, 12);
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ name: pkg?.name ?? 'far-chain', version: pkg?.version ?? '0.0.0', gitCommit: sha })}\n`,
    );
    return 0;
  }
  process.stdout.write(`${pkg?.name ?? 'far-chain'} ${pkg?.version ?? '0.0.0'} · git ${sha ?? '(not a git checkout)'}\n`);
  process.stdout.write('  Falsification-Anchored Research Chain · deterministic R0-R9 kernel · tamper-detectable · anti-theater\n');
  return 0;
}
