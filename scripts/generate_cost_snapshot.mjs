// scripts/generate_cost_snapshot.mjs
// 职责：E6 成本快照归档生成器（SECURITY.md §88-99 格式合规）。
// 权威 SSOT：SECURITY.md §Cost Snapshot Archiving / 30_FINAL_CHECKLIST.md §E6。
//
// 格式契约（SECURITY.md §88-99）：
//   位置: evidence/dashscope_calls/YYYY-MM-DD_cost_snapshot.json
//   必填字段: date, model_id, request_count, total_tokens, verdict
//   禁填字段（防泄露计费）: unit_price, total_cost_rmb, account_balance, quota_remaining
//   占位: 定价敏感数值字段用 __redacted__
//
// 诚实设计（反假证据）：
//   - 无参数 → 只打印格式说明 + 退出（绝不写假文件）。
//   - 带 --request-count / --total-tokens（用户从真实计费调用控制台读取）→ 写合规快照。
//   - 定价字段（unit_price/total_cost_rmb 等）永远 __redacted__——本脚本永不接受定价输入。
//
// 用法：
//   node scripts/generate_cost_snapshot.mjs                                   # 打印格式
//   node scripts/generate_cost_snapshot.mjs --request-count=4 --total-tokens=1234 --verdict=OK

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- argv 解析 ----------

function parseArg(argv, key) {
  const prefix = `--${key}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  if (hit === undefined) return null;
  return hit.slice(prefix.length);
}

const argv = process.argv.slice(2);
const requestCountRaw = parseArg(argv, 'request-count');
const totalTokensRaw = parseArg(argv, 'total-tokens');
const verdictRaw = parseArg(argv, 'verdict');

// ---------- 禁填字段（永远 __redacted__·防泄露计费） ----------

const PROHIBITED_FIELDS_REDACTED = {
  unit_price: '__redacted__',
  total_cost_rmb: '__redacted__',
  account_balance: '__redacted__',
  quota_remaining: '__redacted__',
};

// ---------- 主流程 ----------

function printFormatAndExit() {
  console.log('═══════════════════════════════════════════');
  console.log('  E6 Cost Snapshot 格式（SECURITY.md §88-99）');
  console.log('═══════════════════════════════════════════');
  console.log('位置: evidence/dashscope_calls/YYYY-MM-DD_cost_snapshot.json');
  console.log('必填: date, model_id, request_count, total_tokens, verdict');
  console.log('禁填（永远 __redacted__）: unit_price, total_cost_rmb, account_balance, quota_remaining');
  console.log('');
  console.log('诚实铁律：无真实计费数据，绝不写假快照。');
  console.log('完成 E6 步骤：');
  console.log('  1. set DASHSCOPE_API_KEY && pnpm exec tsx ci/competition_qwen_smoke.ts');
  console.log('  2. 从真实响应 usage 字段读取 total_tokens；从 smoke 输出数 request_count');
  console.log('  3. node scripts/generate_cost_snapshot.mjs --request-count=N --total-tokens=M --verdict=OK');
  console.log('  4. 百炼控制台截图（含 request_id + 成本）脱敏后人工归档');
  console.log('═══════════════════════════════════════════');
  process.exit(0);
}

if (requestCountRaw === null || totalTokensRaw === null) {
  printFormatAndExit();
}

const requestCount = Number.parseInt(requestCountRaw, 10);
const totalTokens = Number.parseInt(totalTokensRaw, 10);
if (!Number.isFinite(requestCount) || !Number.isFinite(totalTokens) || requestCount < 0 || totalTokens < 0) {
  console.error('generate_cost_snapshot: --request-count 和 --total-tokens 须为非负整数');
  process.exit(1);
}

const verdict = verdictRaw ?? 'OK';

// 日期（ISO 当日·文件名 + date 字段）。本脚本为人工工具，允许 new Date()。
const now = new Date();
const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
const isoTimestamp = now.toISOString();

const snapshot = {
  date: isoDate,
  model_id: 'qwen3.7-max-2026-05-20 (competition profile)',
  request_count: requestCount,
  total_tokens: totalTokens,
  verdict,
  archived_at: isoTimestamp,
  redaction_notice: '定价字段永远 __redacted__（SECURITY.md §88-99 防泄露计费）',
  ...PROHIBITED_FIELDS_REDACTED,
};

const outDir = join(repoRoot, 'evidence', 'dashscope_calls');
const outFile = join(outDir, `${isoDate}_cost_snapshot.json`);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

console.log(`✅ E6 cost snapshot 已归档（合规·定价 __redacted__）: ${outFile}`);
console.log(`   request_count=${requestCount} total_tokens=${totalTokens} verdict=${verdict}`);
console.log('   注意：百炼控制台截图（含 request_id + 成本）须脱敏后人工归档至同目录。');
if (existsSync(join(repoRoot, '.gitignore'))) {
  console.log('   提示：确认 evidence/ 在 .gitignore 中（防截图/敏感物入库）。');
}
