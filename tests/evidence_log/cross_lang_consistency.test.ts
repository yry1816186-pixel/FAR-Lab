import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLDEN_VECTORS,
  REPRO_CONTEXT_FIXTURE,
  REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
  canonicalHash,
  canonicalJson,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';
// V2 clean-room verifier: from-scratch canonical JSON + sha256 (PS-04).
import {
  independentCanonicalJson,
  independentSha256Hex,
} from '../../src/v2_domain/independent_verifier.ts';
// NUMERIC_* 为 test-only 常量（数值域跨语言对拍专用），不从公共 API 导出——直接引用定义源。
import {
  NUMERIC_GREEN_VECTORS,
  NUMERIC_JCS_CONVERGENCE,
} from '../../src/evidence_log/golden_vectors.ts';
import { PYTHON_SPAWN_TIMEOUT_MS, buildPythonPath, pythonSpawnFailureMessage } from '../_helpers/python.ts';

// Windows: 'python' (真实安装); Unix: 'python3'。WindowsApps python3 是 Store stub,
// 在 coverage 并发下 spawnSync 偶发 status=null。对齐 ensure_py_deps.mjs / smt_backend.ts 约定。
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

function pythonCanonicalHash(): string {
  const result = spawnSync(
    PYTHON_CMD,
    [
      '-c',
      [
        'from far_chain_repro.canonical_json import canonical_hash',
        'from far_chain_repro.golden_vectors import REPRO_CONTEXT_FIXTURE',
        'print(canonical_hash(REPRO_CONTEXT_FIXTURE))',
      ].join('; '),
    ],
    {
      cwd: new URL('../../', import.meta.url),
      encoding: 'utf8',
      timeout: PYTHON_SPAWN_TIMEOUT_MS,
      env: {
        ...process.env,
        PYTHONPATH: buildPythonPath(process.env.PYTHONPATH),
      },
    },
  );

  assert.equal(result.status, 0, pythonSpawnFailureMessage(result));
  return result.stdout.trim();
}

// 通用跨语言对拍：通过 stdin 传入任意 JSON 对象，Python 侧用 hash_canonical_json / canonical_json 计算。
// Numeric boundary samples for cross-lang hash parity.
function runPythonCanonical(obj: Record<string, unknown>, mode: 'hash' | 'str'): string {
  const script =
    mode === 'hash'
      ? "from far_chain_repro.canonical_json import hash_canonical_json; import json,sys; print(hash_canonical_json(json.loads(sys.stdin.buffer.read().decode('utf-8'))))"
      : "from far_chain_repro.canonical_json import canonical_json; import json,sys; print(canonical_json(json.loads(sys.stdin.buffer.read().decode('utf-8'))))";
  const result = spawnSync(PYTHON_CMD, ['-c', script], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    input: JSON.stringify(obj),
    timeout: PYTHON_SPAWN_TIMEOUT_MS,
    env: {
      ...process.env,
      PYTHONPATH: buildPythonPath(process.env.PYTHONPATH),
    },
  });
  assert.equal(result.status, 0, pythonSpawnFailureMessage(result));
  return result.stdout.trim();
}

test('TS canonicalHash matches the E4 expected golden hex', () => {
  assert.match(REPRO_CONTEXT_FIXTURE_EXPECTED_HEX, /^[0-9a-f]{64}$/);
  assert.equal(canonicalHash(REPRO_CONTEXT_FIXTURE), REPRO_CONTEXT_FIXTURE_EXPECTED_HEX);
});

test('TS canonicalHash equals Python canonical_hash byte-for-byte', () => {
  assert.equal(canonicalHash(REPRO_CONTEXT_FIXTURE), pythonCanonicalHash());
});

test('all TS golden vectors match expected hex', () => {
  for (const vector of GOLDEN_VECTORS) {
    assert.equal(canonicalHash(vector.input), vector.expectedHex, vector.name);
  }
});

test('canonicalHash ignores purposeTag, seq, and currentHash by whitelist', () => {
  const base = canonicalHash(REPRO_CONTEXT_FIXTURE);
  const changed = canonicalHash({
    ...REPRO_CONTEXT_FIXTURE,
    purposeTag: 'eval',
    seq: 99,
    currentHash: 'f'.repeat(64),
  });
  assert.equal(changed, base);
});

test('canonicalHash rejects non-finite numbers before JSON serialization', () => {
  assert.throws(
    () => hashCanonicalJson({ badNumber: Number.NaN }),
    /NaN and Infinity/,
  );
});

test('numeric green vectors: TS hashCanonicalJson === Python (day-0 PoC byte-equal)', () => {
  // golden_vectors 必须含数值样本对拍（禁纯字符串占位蒙混）。
  // GREEN 项经 hashCanonicalJson 数值序列化路径，TS canonicalize (RFC 8785) === Python rfc8785 byte-equal。
  for (const v of NUMERIC_GREEN_VECTORS) {
    const tsHex = hashCanonicalJson(v.obj);
    const pyHex = runPythonCanonical(v.obj, 'hash');
    assert.equal(tsHex, pyHex, `${v.name}: TS!==Python (expected byte-equal)`);
  }
});

test('V2 clean-room independentCanonicalJson === Python canonical_json (no shared canonicalizer)', () => {
  // PS-04 (world-class parity): the V2 independent verifier re-implements
  // canonical JSON from Node primitives (NOT the producer's canonicalize).
  // It must still produce byte-identical canonical JSON and sha256 to the
  // Python repro axis — this is the clean-room cross-language consistency proof.
  const samples: Record<string, unknown>[] = [
    { a: true, b: [1, 2, { c: 'x', d: null }], c: 3.5 },
    { z: '中文测试', a: { nested: [1.5, -0, 'x'], flag: false }, empty: {}, arr: [] },
    // 1e-7 自 V3 RFC 8785 迁移起两侧收敛（曾为已知分歧 N2b，V8 "1e-7" vs Py "1e-07"）。
    { s: 'nested "quotes" \\ backslash \n newline', n: -0, f: 1.25, t: [true, false, null], sci: 1e-7 },
    { deep: { deeper: { deepest: { value: 42, list: [{ k: 'v' }, []] } } } },
  ];
  for (const [i, obj] of samples.entries()) {
    const tsCanonical = independentCanonicalJson(obj);
    const tsHex = independentSha256Hex(tsCanonical);
    const pyHex = runPythonCanonical(obj, 'hash');
    const pyCanonical = runPythonCanonical(obj, 'str');
    assert.equal(
      tsHex,
      pyHex,
      `sample[${i}]: clean-room TS sha256 !== Python (expected byte-equal): ${tsCanonical} vs ${pyCanonical}`,
    );
  }
});

test('numeric JCS convergence: TS === Python byte-equal (V3 RFC 8785 迁移收尾翻转)', () => {
  // §74 day-0 PoC 曾在此锁定 RED（N2b 指数零填充 1e-7 vs 1e-07）作为迁移基线。
  // 2026-08-20 V3 RFC 8785 JCS 迁移完成：TS vendored canonicalize@4.0.0 ↔ Py rfc8785
  // 包，断言翻转为 byte-equal。若此测试失败=RFC 8785 轴回退（如 Python 侧静默
  // fallback 到 json.dumps——canonical_json.py 的 WARNING 即此信号）。禁伪造绿。
  for (const v of NUMERIC_JCS_CONVERGENCE) {
    const tsStr = canonicalJson(v.obj);
    const pyStr = runPythonCanonical(v.obj, 'str');
    assert.equal(tsStr, pyStr, `${v.name} (${v.note}): expected RFC 8785 byte-equal, got divergence`);
    const tsHex = hashCanonicalJson(v.obj);
    const pyHex = runPythonCanonical(v.obj, 'hash');
    assert.equal(tsHex, pyHex, `${v.name}: hash must be byte-equal when serialization is`);
  }
});
