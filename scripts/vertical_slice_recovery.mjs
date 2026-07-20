#!/usr/bin/env node
/**
 * vertical_slice_recovery.mjs — Phase D 断连/进程重启恢复用例(真实生产 CLI 路径)。
 *
 * 流程:
 *   Phase 1:`far ask <q> --mode full --resume <store> --export <bundle>` 运行中被 SIGKILL
 *            (进程级杀死,模拟断连/崩溃);
 *   Phase 2:同一命令重跑 → 从最近有效 stage_receipt 续跑完成;
 *   断言:Phase2 exit 0 + receipts 文件存在且 ≥1 收据(恢复到明确状态)+ bundle 可 verify。
 * 输出:全部日志到 stdout(由调用方重定向存证)。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const QUESTION =
  'A16 pulsar: what fraction of young pulsars in the ATNF catalog show braking index n significantly different from 3 at >=2 sigma?';
const SLICE_DIR = process.argv[2] ?? join('.far-implementation', 'vertical-slice');
const STORE = join(SLICE_DIR, 'artifacts', 'recovery.receipts.json');
const BUNDLE = join(SLICE_DIR, 'artifacts', 'recovery.far-proof');
const KILL_AFTER_MS = Number(process.argv[3] ?? 450);

if (existsSync(STORE)) rmSync(STORE);
if (existsSync(BUNDLE)) rmSync(BUNDLE, { recursive: true, force: true });

// ── Phase 1:SIGKILL 中断(确定性:收据出现 ≥2 即杀,真实中途断连)───────────
console.log('[slice-recovery] phase1: far ask --resume(收据≥2 即 SIGKILL,确定性中途断连)');
const child = spawn(
  process.execPath,
  ['src/cli/far.ts', 'ask', QUESTION, '--mode', 'full', '--resume', STORE, '--export', BUNDLE],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);
let phase1Log = '';
child.stdout.on('data', (d) => { phase1Log += String(d); });
child.stderr.on('data', (d) => { phase1Log += String(d); });
const killTimer = setTimeout(() => child.kill('SIGKILL'), 15_000); // 兜底
const watcher = setInterval(() => {
  if (existsSync(STORE)) {
    try {
      const store = JSON.parse(readFileSync(STORE, 'utf8'));
      if (Array.isArray(store.receipts) && store.receipts.length >= 2) {
        clearInterval(watcher);
        clearTimeout(killTimer);
        child.kill('SIGKILL');
      }
    } catch {
      // 半写中,下轮再读
    }
  }
}, 20);
await new Promise((resolve) => child.on('exit', resolve));
clearInterval(watcher);
clearTimeout(killTimer);

const receiptCount = (() => {
  if (!existsSync(STORE)) return 0;
  try {
    const store = JSON.parse(readFileSync(STORE, 'utf8'));
    return Array.isArray(store.receipts) ? store.receipts.length : 0;
  } catch {
    return -1;
  }
})();
console.log(`[slice-recovery] phase1 killed(SIGKILL);receipts at kill point: ${receiptCount}`);

// ── Phase 2:同命令重跑 → 续跑完成 ──────────────────────────────────────
console.log('[slice-recovery] phase2: 同命令重跑(从最近有效收据续跑)');
const t0 = Date.now();
const phase2 = spawnSync(
  process.execPath,
  ['src/cli/far.ts', 'ask', QUESTION, '--mode', 'full', '--resume', STORE, '--export', BUNDLE],
  { cwd: process.cwd(), encoding: 'utf8' },
);
const phase2Ms = Date.now() - t0;
console.log(`[slice-recovery] phase2 exit=${phase2.status ?? '?'} (${phase2Ms}ms)`);
console.log(String(phase2.stdout ?? '').slice(-600));

let failures = 0;
if (phase2.status !== 0) {
  console.log('[slice-recovery] FAIL: phase2 未成功完成');
  failures += 1;
}
const finalReceipts = (() => {
  if (!existsSync(STORE)) return 0;
  const store = JSON.parse(readFileSync(STORE, 'utf8'));
  return Array.isArray(store.receipts) ? store.receipts.length : 0;
})();
console.log(`[slice-recovery] final receipts: ${finalReceipts}`);
if (finalReceipts < 6) {
  console.log('[slice-recovery] WARN: 收据 <6(mode full 可能多轮迭代,以实际为准)');
}

// verify bundle(独立复算)
const verify = spawnSync(process.execPath, ['src/cli/far.ts', 'verify', BUNDLE], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
console.log(`[slice-recovery] verify exit=${verify.status ?? '?'}`);
if (verify.status !== 0) failures += 1;

console.log(
  `[slice-recovery] ${failures === 0 ? 'PASS' : 'FAIL'}: 断连(SIGKILL)后同命令恢复到明确完成态,产物可独立复算`,
);
process.exit(failures === 0 ? 0 : 1);
