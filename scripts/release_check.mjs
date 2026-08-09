#!/usr/bin/env node
/**
 * release_check —— tag↔Release 对拍脚本（阶段 7 P0-9 · AT14/BV3-1 修复）。
 *
 * 背景（findings BV3-G1）：v1.1.0 tag 存在但 GitHub Release 不存在（假发布）——tag 推送后
 * release.yml 质量门超时失败，Release 从未产出，仓库显示"已发布"实为虚。
 * 本脚本：
 *   1. 读取 `git tag -l 'v*'`（排除 depth-* 等非发布 tag）。
 *   2. 对每个 v* tag 调 `gh release view` 检查对应 Release 存在（含 ≥1 资产）。
 *   3. 缺失 → FAIL（exit 1）——防未来 tag 无 Release 复发。
 *
 * 依赖：gh CLI 已认证（`gh auth status`）。
 * 用法: node scripts/release_check.mjs
 */

import { execFileSync } from 'node:child_process';

/** 列出所有发布 tag（v* 且非 depth-* 等内部 tag）。 */
export function listReleaseTags() {
  const out = execFileSync('git', ['tag', '-l', 'v*'], { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+/.test(t))
    .sort();
}

/** 检查 tag 是否有对应 Release（含 ≥1 资产）。返回 null=存在；非 null=缺失原因。 */
export function checkReleaseForTag(tag) {
  try {
    const out = execFileSync(
      'gh',
      ['release', 'view', tag, '--json', 'assets', '--jq', '[.assets[] | .name] | join(",")'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const assets = out.trim();
    if (assets.length === 0) {
      return `Release ${tag} exists but has zero assets (fake release)`;
    }
    return null;
  } catch {
    return `Release for tag ${tag} does not exist (tag pushed without release — BV3-G1 regression)`;
  }
}

if (import.meta.main) {
  const tags = listReleaseTags();
  const missing = [];
  for (const tag of tags) {
    const problem = checkReleaseForTag(tag);
    if (problem !== null) {
      missing.push(problem);
    }
  }
  if (missing.length > 0) {
    console.error(`release_check FAIL: ${missing.length} tag(s) without a real Release:`);
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    process.exit(1);
  }
  console.log(`release_check: ok — all ${tags.length} release tag(s) have a GitHub Release with assets`);
}
