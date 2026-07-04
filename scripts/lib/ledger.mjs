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

export const LEDGER_REL = ['PROJECT_PLAN', 'DEPTH_LEDGER.md'];

// §C 7 列：id | dep | callerFile:callerLine | proofTest | redCommit | status | closedBy。
// group(1)=id（PK，唯一）；callerFile 强制 src/ 前缀（R7：触发 L1 existsSync 校验）。
// 与原 depth_gate.mjs:370 逐字同源——R6 双口径禁令的物证。
const LEDGER_ROW_RE_SOURCE =
  String.raw`^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*(src\/[^\s|]+):(\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|\s*$`;

// 单行匹配（无 g/m）——bot 按 \n 切行后逐行 test()，定位要写回的 row。不含换行符的单行串上
// ^/$ 天然锚首尾，无需 m flag。
export const LEDGER_ROW_RE = new RegExp(LEDGER_ROW_RE_SOURCE);

export function readLedgerText(repoRoot) {
  const ledgerPath = join(repoRoot, ...LEDGER_REL);
  if (!existsSync(ledgerPath)) return null;
  return readFileSync(ledgerPath, 'utf8');
}

export function extractSectionC(text) {
  const sectionC = text.split('## §C')[1] || '';
  const tableMatch = sectionC.match(/\|[^\n]*\|\n([\s\S]*?)(?=\n[^|]|\n## |\n---|$)/);
  return tableMatch ? tableMatch[1] : '';
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
    });
  }
  return { exists: true, rows };
}
