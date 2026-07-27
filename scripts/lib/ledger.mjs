// scripts/lib/ledger.mjs
//
// DEPTH_LEDGER.md §C 行表解析器（depth_gate 与 depth_evidence bot 共享 SSOT）。
//
// 为什么独立成模块（R6 单口径）：
//   原本 parseLedgerTable + 行正则只活在 depth_gate.mjs:361-384；keystone bot 写回时
//   须用**同一份**行识别逻辑定位 row id（禁 text.replace(rowId)——§F 散文也含 P0-1，
//   字符串替换会腐蚀散文）。两份正则副本 = 双口径 = 漂移攻击面。本模块是唯一来源，
//   gate 与 bot 各自 import，正则逐字同源。
//
// 接口契约：
//   LEDGER_REL            —— 账本相对路径段（join(repoRoot, ...LEDGER_REL)）
//   LEDGER_ROW_RE         —— §C 行单行正则（无 g/m flag，bot 逐行定位 row id 用）
//   readLedgerText(root)  —— 读全文；不存在返回 null
//   extractSectionC(text) —— 抽 §C 表体（与原 depth_gate 语义逐字一致）
//   parseLedgerTable(root) —— { exists, rows[] }；rows 字段同原实现

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LEDGER_REL = ['FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'];

// §C 列：id | dep | callerFile:callerLine | proofTest | redCommit | status | closedBy | claimed_by_pr(可选)。
// group(1)=id（PK，唯一）；callerFile 用 ([^\s|]+) 接受任意路径（R7 收紧：原 src/ 锚点让 P2-1
// tests/real_backends/* 与 P3-1 scripts/* 等「caller 即测试/脚本自身」的合法行逃过 L1 全部字段校验。
// 放宽后这些行也进 L1（proof_test 存在 + test_name 存在 + caller 存在 + status 枚举））。
// R10 claimed_by_pr：第 8 列可选（向后兼容 8 列旧行 + evade 桩仓）——尾部 `(?:([^|]*?)\s*\|\s*)?`
// 匹配则 group(9)=claimedBy（如 `PR-42` / `-`），不匹配（8 列行）则 undefined。防多窗口 §C 状态竞争。
// 与原 depth_gate.mjs:370 逐字同源——R6 双口径禁令的物证。
const LEDGER_ROW_RE_SOURCE =
  String.raw`^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^\s|]+):(\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|\s*(?:([^|]*?)\s*\|\s*)?$`;

// 单行匹配（无 g/m）——bot 按 \n 切行后逐行 test()，定位要写回的 row。不含换行符的单行串上
// ^/$ 天然锚首尾，无需 m flag。
export const LEDGER_ROW_RE = new RegExp(LEDGER_ROW_RE_SOURCE);

export function readLedgerText(repoRoot) {
  const ledgerPath = join(repoRoot, ...LEDGER_REL);
  if (!existsSync(ledgerPath)) return null;
  // Normalize CRLF→LF: DEPTH_LEDGER.md is git-tracked and may have Windows line
  // endings. All downstream regexes (extractSectionC, LEDGER_ROW_RE, depth_gate
  // §C parsing, depth_evidence bot write-back) use bare \n anchors. Without this
  // normalization, extractSectionC's /\|[^\n]*\|\n/ fails on |...|\r\n headers,
  // silently zero-rows the parser → depth_gate CHECK-L1 false-fails.
  return readFileSync(ledgerPath, 'utf8').replace(/\r\n/g, '\n');
}

export function extractSectionC(text) {
  // §C may contain multiple tables (core + fusion-derivative), separated by
  // headings/paragraphs. We grab everything up to the next top-level section
  // (## §D), then the LEDGER_ROW_RE (applied with gm in parseLedgerTable)
  // picks out every table row regardless of inter-table prose.
  const sectionC = text.split('## §C')[1] || '';
  const upToNextSection = sectionC.split('## §D')[0] || sectionC;
  return upToNextSection;
}

// 返回 { exists: false, rows: [] }（账本缺失）或 { exists: true, rows[] }。
// rows 为空（§C 表体未解析出）时 exists 仍为 true——交由调用方判定 rows.length===0 是否 FAIL。
export function parseLedgerTable(repoRoot) {
  const text = readLedgerText(repoRoot);
  if (text === null) return { exists: false, rows: [] };
  const body = extractSectionC(text);
  const rows = [];
  const globalRe = new RegExp(LEDGER_ROW_RE_SOURCE, 'gm');
  let m;
  while ((m = globalRe.exec(body)) !== null) {
    rows.push({
      id: m[1].trim(),
      dep: m[2].trim(),
      callerFile: m[3].trim(),
      callerLine: parseInt(m[4], 10),
      proofTest: m[5].trim(),
      redCommit: m[6].trim(),
      status: m[7].trim(),
      closedBy: m[8].trim(),
      claimedBy: m[9] !== undefined ? m[9].trim() : undefined,
    });
  }
  return { exists: true, rows };
}
