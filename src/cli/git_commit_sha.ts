// src/cli/git_commit_sha.ts
// 共享：解析当前 git HEAD commit sha（CLI 命令注入 runAgentLoop.gitCommitSha）。
//
// 回退 DEMO_GIT_COMMIT_SHA（仅当不在 git 仓库 / git 缺失时·fresh-clone 解包场景）。
// CG-1 合规：本文件零 LLM import、零网络。

import { spawnSync } from 'node:child_process';
import { DEMO_GIT_COMMIT_SHA } from '../far_proof/demo_chain.ts';
import { PACKAGE_ROOT } from './paths.ts';

/**
 * resolve git commit sha.
 */
export function resolveGitCommitSha(): string {
  // cwd=PACKAGE_ROOT, not the caller's CWD: otherwise an installed `far` run from inside
  // another git repo silently stamps that repo's SHA into session/cert provenance — FUSION-OS C-1 (来源不可自填).
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: PACKAGE_ROOT });
  if (r.status === 0) {
    const sha = r.stdout.trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  }
  return DEMO_GIT_COMMIT_SHA;
}
