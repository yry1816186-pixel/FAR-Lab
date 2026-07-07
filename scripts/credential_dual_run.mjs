// scripts/credential_dual_run.mjs
// P1-2/P1-3/P1-6b inherent-limit proof test 一键双跑 harness。
//
// 这 3 行在 DEPTH_LEDGER §C 维持 WIRED_RED，因为 proof 需真实 DashScope HTTP / 网络 / lightkurve，
// 「无法 stub 而不失真实 HTTP/网络集成本意」（DEPTH_LEDGER §C 末段）。agent 本地无法产出物证。
// 本 harness 让 maintainer 配凭据/网络后一键跑 proof test；产出的 PASS 物证可由
// .github/workflows/depth-evidence.yml keystone bot 写回 WIRED_GREEN。
//
// 用法：
//   DASHSCOPE_API_KEY=sk-xxx node scripts/credential_dual_run.mjs        # P1-2/P1-3
//   DASHSCOPE_API_KEY=sk-xxx FAR_ONLINE=1 node scripts/credential_dual_run.mjs  # + P1-6b

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';

const PROOFS = [
  {
    id: 'P1-2',
    desc: 'executeFallbackChain 真实 429/5xx 穿透（qwen_vl_adapter:340）',
    test: 'tests/llm_gateway/fallback_real_http.test.ts',
    prereq: () => readKey() !== null,
    prereqDesc: 'DASHSCOPE_API_KEY',
  },
  {
    id: 'P1-3',
    desc: 'createQwenAdapter 真实 DashScope HTTP chat.completions 穿透',
    test: 'tests/llm_gateway/qwen_adapter_fallback.test.ts',
    prereq: () => readKey() !== null,
    prereqDesc: 'DASHSCOPE_API_KEY',
  },
  {
    id: 'P1-6b',
    desc: 'fetchOnlineDataset lightkurve/MAST 真实取数',
    test: 'tests/science_harness/dataset_real.test.ts',
    prereq: () => process.env.FAR_ONLINE === '1' && hasLightkurve(),
    prereqDesc: 'FAR_ONLINE=1 + lightkurve + 网络',
  },
];

function readKey() {
  return process.env.DASHSCOPE_API_KEY ?? process.env.FAR_DASHSCOPE_API_KEY ?? null;
}

function hasLightkurve() {
  // 须镜像测试的 buildPythonPath（repro + .python-deps）：lightkurve 装进 .python-deps（ensure_py_deps 不自动装可选 science 包），
  // 不设 PYTHONPATH 则系统 python 找不到 → harness 永远报 unavailable → P1-6b 永远 SKIP（即便已正确安装）。对齐 dataset_real.test.ts:buildPythonPath。
  const prev = process.env.PYTHONPATH;
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (prev !== undefined && prev.length > 0) parts.push(prev);
  const env = { ...process.env, PYTHONPATH: parts.join(delimiter) };
  const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import lightkurve'], {
    encoding: 'utf8',
    stdio: 'ignore',
    env,
  });
  return r.status === 0;
}

process.stdout.write('FAR-Chain · 凭据/网络 inherent-limit proof 双跑 harness\n');
process.stdout.write('═══════════════════════════════════════════════════════\n');
process.stdout.write(`DASHSCOPE_API_KEY : ${readKey() === null ? '<未设置>' : '已设置'}\n`);
process.stdout.write(`lightkurve        : ${hasLightkurve() ? 'available' : 'unavailable'}\n`);
process.stdout.write('───────────────────────────────────────────────────────\n\n');

let passCount = 0;
let skipCount = 0;
let failCount = 0;

for (const p of PROOFS) {
  if (!existsSync(p.test)) {
    process.stdout.write(`[${p.id}] SKIP — proof test 不存在 (${p.test})\n`);
    skipCount++;
    continue;
  }
  if (!p.prereq()) {
    process.stdout.write(`[${p.id}] SKIP — 需 ${p.prereqDesc}\n   ${p.desc}\n`);
    skipCount++;
    continue;
  }
  process.stdout.write(`[${p.id}] RUN — ${p.desc}\n`);
  const r = spawnSync(process.execPath, ['--test', p.test], {
    encoding: 'utf8',
    env: { ...process.env, DASHSCOPE_API_KEY: readKey() ?? '' },
    stdio: 'inherit',
  });
  if (r.status === 0) {
    process.stdout.write(`[${p.id}] ✓ PASS → WIRED_GREEN 候选（keystone bot depth-evidence.yml 双跑写回）\n\n`);
    passCount++;
  } else {
    process.stdout.write(`[${p.id}] ✗ FAIL/环境失败（网络/配额/认证/5xx·见 test 输出）\n\n`);
    failCount++;
  }
}

process.stdout.write('═══════════════════════════════════════════════════════\n');
process.stdout.write(`汇总：PASS ${passCount} · SKIP ${skipCount} · FAIL ${failCount}\n`);
if (skipCount > 0) {
  process.stdout.write(
    '\nSKIP 项需凭据/网络（inherent limit·非代码缺口）。配置后重跑本 harness 产出物证。\n',
  );
}
process.exit(failCount > 0 ? 1 : 0);
