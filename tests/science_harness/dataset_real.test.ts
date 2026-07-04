// tests/science_harness/dataset_real.test.ts
//
// P1-6 Phase 4 端到端物证：fetchOnlineDataset 真 spawn dataset_fetch.py（非桩）。
//
// 真实依赖（file:line）：
//   - src/science_harness/dataset_resolver.ts:fetchOnlineDataset（TS 白名单 fail-closed 门 + spawn）
//   - repro/science_harness/dataset_fetch.py:check_host（Python 侧 host 白名单双层防御）
//   - repro/science_harness/dataset_fetch.py:fetch_lightkurve（lightkurve 真取数 + ECSV sha256）
//
// 诚实边界（CLAUDE.md §3 + 02 F1 never-fabricate）：
//   - 缺 python / lightkurve / 网络 → t.skip 或诚实 null（**不当代码 bug，不伪造 hash**）。
//   - 白名单 host 真取数测试不强断言成功（避免 flaky 网络），只验证「不抛 + 形态合法 + 不伪造」。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C P1-6 + 12 §2.1-§2.2 + 02 C8 RULE-DATA-001。

import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DATASET_HOST_WHITELIST,
  fetchOnlineDataset,
} from '../../src/science_harness/dataset_resolver.ts';
import { buildVenvPythonEnv } from '../../src/science_harness/sandbox_runner.ts';

const DATASET_FETCH_PY = resolve('repro/science_harness/dataset_fetch.py');

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

test('fetchOnlineDataset: whitelisted host returns null-or-result honestly (never throws, never fabricates)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    // 短超时 + 白名单 host：真取数成功 → OnlineFetchResult 形态；网络/无数据/lightkurve 缺 → null。
    // 两种结果都合法（02 F1：绝不伪造）。本测只验证「不抛 + 形态合法 + 不伪造」。
    const result = await fetchOnlineDataset({
      resolver: 'lightkurve',
      host: 'mast.stsci.edu',
      version: '1.0',
      ticId: 'TIC000000000',
      timeoutMs: 8_000,
    });
    if (result === null) {
      // null 合法：网络不可达 / 无该 TIC 数据 / lightkurve 缺失 → cached_fixture 降级路径。
      assert.ok(true, 'honest null on unavailable real fetch (cached_fixture fallback, 02 F1)');
      return;
    }
    assert.equal(result.hostWhitelisted, true);
    assert.equal(result.ref.resolver, 'lightkurve');
    assert.match(result.ref.contentHash, /^[0-9a-f]{64}$/, 'contentHash must be real sha256, never fabricated');
    assert.ok(result.ref.retrievedAt.length > 0, 'retrievedAt must be populated');
  } finally {
    restorePythonPath(previous);
  }
});

function findPythonCommand(): string | null {
  for (const command of ['python3', 'python']) {
    const r = spawnSync(command, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' });
    if (r.error === undefined && r.status === 0) {
      return command;
    }
  }
  return null;
}

function buildPythonPath(previous: string | undefined): string {
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (previous !== undefined && previous.length > 0) {
    parts.push(previous);
  }
  return parts.join(delimiter);
}

function restorePythonPath(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.PYTHONPATH;
  } else {
    process.env.PYTHONPATH = previous;
  }
}
