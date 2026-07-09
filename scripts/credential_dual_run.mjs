// scripts/credential_dual_run.mjs
// P1-2/P1-3/P1-6b proof test 一键双跑 harness。
//
// 这 3 行在 DEPTH_LEDGER §C 维持 WIRED_RED。P1-2 使用本地 OpenAI-compatible proof server
// 跑真实 HTTP 429 fallback，不需要外部凭据；P1-3/P1-6b 仍需真实 DashScope HTTP / 网络 / lightkurve。
// 本 harness 让 maintainer 配凭据/网络后一键跑 proof test；产出的 PASS 物证可由
// .github/workflows/depth-evidence.yml keystone bot 写回 WIRED_GREEN。
//
// 用法：
//   node scripts/credential_dual_run.mjs                                # P1-2 + honest skips
//   DASHSCOPE_API_KEY=sk-xxx node scripts/credential_dual_run.mjs        # + P1-3
//   DASHSCOPE_API_KEY=sk-xxx FAR_ONLINE=1 node scripts/credential_dual_run.mjs  # + P1-6b

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIGHTKURVE_PROBE_TIMEOUT_MS = 45_000;
const PROOF_TEST_TIMEOUT_MS = 180_000;
let lightkurveProbeCache;

const PROOFS = [
  {
    id: 'P1-2',
    desc: 'executeFallbackChain 真实 HTTP transport error 穿透（qwen_vl_adapter:340）',
    test: 'tests/llm_gateway/fallback_real_http.test.ts',
    proofName: 'real_transport_error穿透_fallback_chain',
    prereq: () => true,
    prereqDesc: '本地 OpenAI-compatible proof server',
  },
  {
    id: 'P1-3',
    desc: 'createQwenAdapter 真实 DashScope HTTP chat.completions 穿透',
    test: 'tests/llm_gateway/qwen_adapter_fallback.test.ts',
    proofName: 'qwen_adapter: real DashScope HTTP (line 73) — env-gated, no mock',
    prereq: () => readKey() !== null,
    prereqDesc: 'DASHSCOPE_API_KEY',
  },
  {
    id: 'P1-6b',
    desc: 'fetchOnlineDataset lightkurve/MAST 真实取数',
    test: 'tests/science_harness/dataset_real.test.ts',
    proofName: 'fetchOnlineDataset: whitelisted host honestly returns null-or-result; spawn is load-bearing',
    prereq: () => process.env.FAR_ONLINE === '1' && hasLightkurve(),
    prereqDesc: 'FAR_ONLINE=1 + lightkurve + 网络',
  },
];

export const DASHSCOPE_ENV_KEYS = ['DASHSCOPE_API_KEY', 'FAR_DASHSCOPE_API_KEY'];

function readKey() {
  for (const key of DASHSCOPE_ENV_KEYS) {
    const value = process.env[key];
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0) return trimmed;
  }
  return null;
}

export function buildProofEnv() {
  const env = { ...process.env, DASHSCOPE_API_KEY: readKey() ?? '' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) {
      delete env[key];
    }
  }
  return env;
}

function hasLightkurve() {
  if (lightkurveProbeCache !== undefined) return lightkurveProbeCache;
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
    timeout: LIGHTKURVE_PROBE_TIMEOUT_MS,
  });
  lightkurveProbeCache = r.status === 0;
  return lightkurveProbeCache;
}

export function parseTapVerdicts(output) {
  const verdicts = new Map();
  for (const line of output.split(/\r?\n/)) {
    const m = /^(ok|not ok)\s+\d+\s+-\s+(.+)$/.exec(line);
    if (m === null || m[1] === undefined || m[2] === undefined) continue;
    let name = m[2];
    let verdict = m[1] === 'ok' ? 'PASS' : 'FAIL';
    const skipIdx = name.search(/\s+#\s*SKIP\b/i);
    const todoIdx = name.search(/\s+#\s*TODO\b/i);
    if (skipIdx !== -1) {
      name = name.slice(0, skipIdx);
      verdict = 'SKIP';
    } else if (todoIdx !== -1) {
      name = name.slice(0, todoIdx);
      verdict = 'TODO';
    }
    const previous = verdicts.get(name);
    verdicts.set(name, previous === undefined || previous === verdict ? verdict : 'UNKNOWN');
  }
  return verdicts;
}

export function verdictForProof(output, proofName) {
  return parseTapVerdicts(output).get(proofName) ?? 'NO_MATCH';
}

export function main() {
  process.stdout.write('FAR-Chain · RED proof 双跑 harness\n');
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
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', p.test], {
      encoding: 'utf8',
      env: buildProofEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: PROOF_TEST_TIMEOUT_MS,
    });
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    process.stdout.write(output);
    if (r.status === 0) {
      const verdict = verdictForProof(output, p.proofName);
      if (verdict === 'PASS') {
        process.stdout.write(`[${p.id}] ✓ PASS → WIRED_GREEN 候选（keystone bot depth-evidence.yml 双跑写回）\n\n`);
        passCount++;
      } else if (verdict === 'SKIP' || verdict === 'TODO') {
        process.stdout.write(`[${p.id}] SKIP — proof 子测试未执行完成 (${p.proofName} → ${verdict})\n\n`);
        skipCount++;
      } else {
        process.stdout.write(`[${p.id}] ✗ FAIL — proof 子测试未 PASS (${p.proofName} → ${verdict})\n\n`);
        failCount++;
      }
    } else {
      const timedOut = r.signal === 'SIGTERM' ? ` / timeout ${PROOF_TEST_TIMEOUT_MS}ms` : '';
      process.stdout.write(`[${p.id}] ✗ FAIL/环境失败${timedOut}（网络/配额/认证/5xx·见 test 输出）\n\n`);
      failCount++;
    }
  }

  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write(`汇总：PASS ${passCount} · SKIP ${skipCount} · FAIL ${failCount}\n`);
  if (skipCount > 0) {
    process.stdout.write(
      '\nSKIP 项需补足对应 proof 前置条件（通常是凭据/网络/lightkurve）。配置后重跑本 harness 产出物证。\n',
    );
  }
  return failCount > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
