import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLDEN_VECTORS,
  NUMERIC_GREEN_VECTORS,
  NUMERIC_KNOWN_DIVERGENCE,
  REPRO_CONTEXT_FIXTURE,
  REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
  canonicalHash,
  canonicalJson,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';

function pythonCanonicalHash(): string {
  const result = spawnSync(
    'python3',
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
      env: {
        ...process.env,
        PYTHONPATH: 'repro',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// 通用跨语言对拍：通过 stdin 传入任意 JSON 对象，Python 侧用 hash_canonical_json / canonical_json 计算。
// 用于数值边界样本（day-0 cross-lang PoC，spec 23 §80 / HANDOFF §3.3）。
function runPythonCanonical(obj: Record<string, unknown>, mode: 'hash' | 'str'): string {
  const script =
    mode === 'hash'
      ? 'from far_chain_repro.canonical_json import hash_canonical_json; import json,sys; print(hash_canonical_json(json.loads(sys.stdin.read())))'
      : 'from far_chain_repro.canonical_json import canonical_json; import json,sys; print(canonical_json(json.loads(sys.stdin.read())))';
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    input: JSON.stringify(obj),
    env: {
      ...process.env,
      PYTHONPATH: 'repro',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
  // spec 23 §80 / HANDOFF §3.3：golden_vectors 必须含数值样本对拍（禁纯字符串占位蒙混·禁伪绿）。
  // GREEN 项经 hashCanonicalJson 数值序列化路径，TS fast-json-stable-stringify === Python json.dumps byte-equal。
  for (const v of NUMERIC_GREEN_VECTORS) {
    const tsHex = hashCanonicalJson(v.obj);
    const pyHex = runPythonCanonical(v.obj, 'hash');
    assert.equal(tsHex, pyHex, `${v.name}: TS!==Python (expected byte-equal)`);
  }
});

test('numeric known-divergence: TS !== Python (day-0 PoC red, V3 RFC 8785 JCS target)', () => {
  // spec 32 §74 day-0 PoC 红→数值域 byte-equal 部分不可达：
  //   N1 浮点整数化（1.0→"1" vs "1.0"）/ N2b 科学计数零填充（1e-7 vs 1e-07）/ N3 >2^53 IEEE754 丢精度。
  // canonicalHash 信任根（T3 白名单 cred 全 string）不碰数值，故信任根 byte-equal 不受影响。
  // 如实锁定 TS!==Python 作为 V3 RFC 8785 JCS 迁移回归基线（迁移后此测试需更新为 byte-equal）。禁伪造绿。
  for (const v of NUMERIC_KNOWN_DIVERGENCE) {
    const tsStr = canonicalJson(v.obj);
    const pyStr = runPythonCanonical(v.obj, 'str');
    assert.notEqual(tsStr, pyStr, `${v.name} (${v.note}): expected known divergence, got equal`);
  }
});
