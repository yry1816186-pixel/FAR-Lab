// scripts/cli_json_probe.mjs
// P2-4 全命令 --json 契约探针（CLI_JSON_CONTRACT_CENSUS §三-P2-4 落地）。
//
// 方法：对每条顶层命令执行 `far <cmd> --json`（无其他参数的最小合法调用），分类：
//   PURE_JSON        exit 0 且 stdout 整体可 JSON.parse —— 契约完全合规
//   FAIL_CLOSED      exit 2 且 stderr 含 usage/unknown —— 无 --json 但 fail-closed（可辩护）
//   SILENT_IGNORE    exit 0 但 stdout 非纯 JSON —— 红线违规（用户以为拿到 JSON）
//   NONZERO_RUNTIME  其他非零退出（缺参数/缺凭证等运行时原因，如实记录 stderr 首行）
//   NEEDS_ARGS       exit 2 且 stderr 指向缺必需参数（--json 纯度需带参复探）
//   SKIP             探针自身豁免（长驻/交互/危险命令）
// 输出：控制台表 + .far/e2e/cli_json_probe.json（运行时产物纪律：.far/ 下，不进 repo 根）。
// 用法：node scripts/cli_json_probe.mjs [--timeout-ms 20000]

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const timeoutIdx = process.argv.indexOf('--timeout-ms');
const TIMEOUT_MS = timeoutIdx !== -1 ? Number(process.argv[timeoutIdx + 1]) : 20000;

/** 顶层命令清单（far.ts 分发表 2026-08-19 实测；SKIP 标注豁免理由）。 */
const COMMANDS = [
  'version', 'doctor', 'status', 'demo', 'ask', 'stream', 'replay', 'court', 'arena',
  'init', 'keygen', 'sign', 'verify-sig', 'snapshot-verify', 'verify-golden', 'bench',
  'export', 'rubric', 'fec', 'fsm', 'planning', 'governance', 'audit-seed-cherry',
  'audit-multiseed', 'c-astro', 'c-astro-loop', 'ground', 'check-resource', 'campaign',
  'research', 'lifecycle', 'backup', 'schedule', 'monitor', 'hardware', 'verify',
];
const SKIP = new Map([
  ['api', '长驻服务器——探针不起服务（已有专门 API 测试覆盖）'],
  ['repl', '交互式 REPL——范式豁免（census §一）'],
]);
/** per-command 超时覆写：status 设计性内嵌全量套件（实测 ~83s，已有进度活信号+有界超时）。 */
const TIMEOUT_OVERRIDES = new Map([['status', 150_000]]);

function classify(r) {
  const out = r.stdout ?? '';
  const err = r.stderr ?? '';
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') {
    return { cls: 'NONZERO_RUNTIME', note: `timeout ${TIMEOUT_MS}ms` };
  }
  // 先尝 JSON.parse（不看 exit code）：doctor 类命令契约 = 纯 JSON + 非零语义退出码（warn/fail）。
  if (out.trim() !== '') {
    try {
      JSON.parse(out);
      return r.status === 0
        ? { cls: 'PURE_JSON', note: '' }
        : { cls: 'PURE_JSON', note: `exit=${r.status}（语义化非零 + 纯 JSON——doctor 契约形态）` };
    } catch {
      if (r.status === 0) {
        return { cls: 'SILENT_IGNORE', note: out.split('\n')[0]?.slice(0, 80) ?? '' };
      }
    }
  }
  const errHead = (err.split('\n').find((l) => l.trim() !== '') ?? '').slice(0, 100);
  if (r.status === 2) {
    if (/usage|unknown|unsupported|expects|missing/i.test(err)) {
      return /required|missing.*arg|expects|需/i.test(err)
        ? { cls: 'NEEDS_ARGS', note: errHead }
        : { cls: 'FAIL_CLOSED', note: errHead };
    }
  }
  return { cls: 'NONZERO_RUNTIME', note: `exit=${r.status} ${errHead}` };
}

const results = [];
for (const cmd of COMMANDS) {
  if (SKIP.has(cmd)) {
    results.push({ cmd, cls: 'SKIP', note: SKIP.get(cmd) });
    continue;
  }
  const r = spawnSync(process.execPath, ['src/cli/far.ts', cmd, '--json'], {
    encoding: 'utf8',
    timeout: TIMEOUT_OVERRIDES.get(cmd) ?? TIMEOUT_MS,
    env: { ...process.env, FAR_DOTENV: process.env.FAR_DOTENV ?? 'off' }, // 探针 hermetic：不吸水合 .env
  });
  results.push({ cmd, ...classify(r) });
}

const tally = {};
for (const r of results) tally[r.cls] = (tally[r.cls] ?? 0) + 1;

console.log('\n  far <cmd> --json 契约探针（P2-4）');
console.log('  ─────────────────────────────────────────────────');
for (const r of results) {
  console.log(`  ${r.cls.padEnd(16)} ${r.cmd}${r.note !== '' ? `  · ${r.note}` : ''}`);
}
console.log('  ─────────────────────────────────────────────────');
console.log(`  ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' · ')}`);

const outDir = join('.far', 'e2e');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'cli_json_probe.json');
writeFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), timeoutMs: TIMEOUT_MS, tally, results }, null, 2)}\n`);
console.log(`  → ${outFile}\n`);

// 探针自身退出码：有 SILENT_IGNORE 即 1（红线违规必须可见）
process.exit((tally.SILENT_IGNORE ?? 0) > 0 ? 1 : 0);
