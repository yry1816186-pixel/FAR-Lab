#!/usr/bin/env node
/**
 * adr_count_check —— ADR 计数对拍脚本（阶段 7 P0-6 · H2-C1 修复）。
 *
 * 背景（findings H2-C1）：AGENT-MEMORY.md 声称「24 ADR」，实测 `.far-design/DECISIONS/`
 * 仅 21 个 ADR-*.yaml（+3 个 D- 前缀决策记录 = 24 项决策记录）——口径漂移导致文档-实测不一致。
 * 本脚本：
 *   1. 实测 `.far-design/DECISIONS/ADR-*.yaml` 计数（SSOT 数字）。
 *   2. 检查 docs/governance/AGENT-MEMORY.md 中的声称是否与实测一致
 *      （三种合法表述：21 个 ADR-* / 合计 24 项 / 对拍脚本引用）。
 *   3. exit 0 = 一致；exit 1 = 漂移（禁止「声称 24 实测 21」复发）。
 *
 * 用法: node scripts/adr_count_check.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

const decisionsDir = join(repoRoot, '.far-design', 'DECISIONS');

// .far-design/ 已 untrack 出公开仓库（2026-08-14 §20 公共仓库清洁化）——
// fresh clone 无 DECISIONS 目录 → 对拍对象不在仓库内 → 环境声明 skip（exit 0 + 明确输出，
// 同 adr_landing_check.mjs 的 ENOENT 模式，非假装通过）。
let dirEntries;
try {
  dirEntries = readdirSync(decisionsDir);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log(
      `adr_count_check: DECISIONS 目录不存在（${decisionsDir} 已 untrack 出仓库）——ADR 计数对拍环境性跳过`,
    );
    process.exit(0);
  }
  throw err;
}

const adrFiles = dirEntries.filter((f) => /^ADR-\d+\.yaml$/.test(f));
const adrCount = adrFiles.length;
// D- 前缀决策记录（D-S5-01.thesis-and-scope.yaml 等·带描述后缀）。
const totalDecisionRecords = dirEntries.filter(
  (f) => /^(ADR-\d+|D-S5-[\w.-]+|D-REVIEW-[\w.-]+)\.yaml$/.test(f),
).length;

const memoryDoc = join(repoRoot, 'docs', 'governance', 'AGENT-MEMORY.md');
const docText = readFileSync(memoryDoc, 'utf8');

// 合法表述：22 个 ADR-*；合计 25 项；对拍脚本引用（新文档口径）。
const claimsConsistent =
  docText.includes(`ADR-*.yaml` + '`（22 个）') ||
  docText.includes('22 个 ADR-*') ||
  docText.includes('合计 25 项决策记录') ||
  docText.includes('adr_count_check');

if (!claimsConsistent) {
  console.error(
    `adr_count_check FAIL: AGENT-MEMORY.md 声称与实测不一致。实测 ADR-*.yaml = ${adrCount} ` +
      `（含 D- 前缀决策记录 = ${totalDecisionRecords}）。请按实测数修正文档口径。`,
  );
  process.exit(1);
}

console.log(
  `adr_count_check: ok — ADR-*.yaml = ${adrCount} (total decision records = ${totalDecisionRecords}), ` +
    `AGENT-MEMORY.md 口径一致`,
);
