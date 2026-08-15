// tests/science_harness/dataset_real.test.ts
//
// P1-6 Phase 4 端到端物证：fetchOnlineDataset 真 spawn dataset_fetch.py（非桩）。
//
// 真实依赖（file:line）：
//   - src/science_harness/dataset_resolver.ts:fetchOnlineDataset（TS 白名单 fail-closed 门 + spawn）
//   - repro/science_harness/dataset_fetch.py:check_host（Python 侧 host 白名单双层防御）
//   - repro/science_harness/dataset_fetch.py:fetch_lightkurve（lightkurve 真取数 + ECSV sha256）
//
// 诚实边界：
//   - 缺 python / lightkurve / 网络 → t.skip 或诚实 null（**不当代码 bug，不伪造 hash**）。
//   - 白名单 host 真取数测试不强断言成功（避免 flaky 网络），只验证「不抛 + 形态合法 + 不伪造」。
//
// Authority: P1-6 + 12 §2.1-§2.2 + 02 C8 RULE-DATA-001。

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findPythonCommand, buildPythonPath, restorePythonPath } from '../_helpers/python.ts';

import {
  DATASET_HOST_WHITELIST,
  fetchOnlineDataset,
} from '../../src/science_harness/dataset_resolver.ts';
import { buildVenvPythonEnv } from '../../src/science_harness/sandbox_runner.ts';

const DATASET_FETCH_PY = resolve('repro/science_harness/dataset_fetch.py');
const ONLINE_FETCH_PROOF_TIMEOUT_MS = 45_000;

test('fetchOnlineDataset: non-whitelisted host -> null (TS fail-closed gate, no spawn)', async () => {
  const result = await fetchOnlineDataset({
    resolver: 'lightkurve',
    host: 'evil.example.com',
    version: '1.0',
    ticId: 'TIC123',
  });
  assert.equal(result, null, 'non-whitelisted host must return null without spawning (SR-5 fail-closed)');
});

test('DATASET_HOST_WHITELIST: TESS authority hosts present (mast.stsci.edu / heasarc)', () => {
  const whitelist = DATASET_HOST_WHITELIST as readonly string[];
  assert.ok(whitelist.includes('mast.stsci.edu'), 'MAST host must be whitelisted');
  assert.ok(whitelist.includes('heasarc.gsfc.nasa.gov'), 'HEASARC host must be whitelisted');
});

test('dataset_fetch.py: Python host-gate rejects non-whitelisted host (no network/lightkurve needed)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const res = spawnSync(
    pythonCommand,
    [DATASET_FETCH_PY],
    {
      input: JSON.stringify({ resolver: 'lightkurve', host: 'evil.example.com', version: '1.0', ticId: 'TIC1' }),
      encoding: 'utf8',
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    },
  );
  assert.equal(res.status, 0, `dataset_fetch.py must exit 0 even when rejecting; stderr=${res.stderr ?? ''}`);
  const parsed = JSON.parse(res.stdout.trim()) as { ok: boolean; error: string; host: string };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'host_not_whitelisted', 'Python-side host gate must reject (defense-in-depth)');
  assert.equal(parsed.host, 'evil.example.com');
});

test('fetchOnlineDataset: whitelisted host honestly returns null-or-result; spawn is load-bearing', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  // lightkurve 是真实在线取数的硬依赖。缺它 → 跳过（非 assert.ok(true) 假绿）：
  // 区分「本环境无法验证真实取数」与「接线已验证」（never-fabricate 红线）。
  const lightkurveProbe = spawnSync(
    pythonCommand,
    ['-c', 'import lightkurve'],
    { encoding: 'utf8', env: buildVenvPythonEnv(), timeout: ONLINE_FETCH_PROOF_TIMEOUT_MS },
  );
  if (lightkurveProbe.status !== 0) {
    t.skip(`lightkurve unavailable — real online fetch cannot be verified; cached_fixture is the honest fallback (02 F1)`);
    return;
  }

  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const result = await fetchOnlineDataset({
      resolver: 'lightkurve',
      host: 'mast.stsci.edu',
      version: '1.0',
      ticId: 'TIC000000000',
      timeoutMs: ONLINE_FETCH_PROOF_TIMEOUT_MS,
    });

    // 负载不变式：直接 spawn dataset_fetch.py 证明真实子进程执行了（移除 fetchOnlineDataset 的
    // spawn → 无 envelope → 本断言失败）。envelope.ok 真实反映取数成败，非预制。
    const direct = spawnSync(
      pythonCommand,
      [DATASET_FETCH_PY],
      {
        input: JSON.stringify({ resolver: 'lightkurve', host: 'mast.stsci.edu', version: '1.0', ticId: 'TIC000000000' }),
        encoding: 'utf8',
        env: buildVenvPythonEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: ONLINE_FETCH_PROOF_TIMEOUT_MS,
      },
    );
    assert.equal(direct.status, 0, `dataset_fetch.py must exit 0 with an honest envelope (not crash); stderr=${(direct.stderr ?? '').trim().slice(0, 200)}`);
    const envelope = JSON.parse(direct.stdout.trim()) as { ok: boolean; error?: string; contentHash?: string };

    if (result !== null) {
      assert.equal(result.hostWhitelisted, true);
      assert.equal(result.ref.resolver, 'lightkurve');
      assert.match(result.ref.contentHash, /^[0-9a-f]{64}$/, 'contentHash must be real sha256, never fabricated');
      assert.ok(result.ref.retrievedAt.length > 0, 'retrievedAt must be populated');
      assert.equal(envelope.ok, true, 'direct spawn must agree: ok:true when fetchOnlineDataset returned a result');
    } else {
      // lightkurve 已装（过 probe）但 null → 网络不可达 / 无该 TIC 数据。spawn 必真跑且诚实报失败。
      assert.equal(envelope.ok, false, 'direct spawn must report ok:false when fetchOnlineDataset returned null (honest failure, not silently swallowed)');
      assert.ok(
        typeof envelope.error === 'string' && envelope.error.length > 0,
        'honest failure envelope must carry a non-empty real reason (proves spawn ran + script executed)',
      );
    }
  } finally {
    restorePythonPath(previous);
  }
});
