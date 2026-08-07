/**
 * merkle_cross_lang —— Merkle 完整性根 + 包含证明的 TS↔Python 字节相等证明。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/09_repro_determinism.md §4（integrity root·跨语言信任根）。
 *
 * 证明（spawnSync python3 逐位断言）：
 *   1. TS computeMerkleRoot === Python compute_merkle_root（根字节相等·偶/奇叶数均覆盖）
 *   2. TS 包含证明 siblings === Python siblings（审计路径字节相等）
 *   3. 双向 verifyMerkleInclusionProof 均 ok=true；篡改 expectedRoot 后 ok=false
 *   4. 篡改任一叶 → 根变化（tamper-evidence）
 *   5. 边界：空→ZERO_MERKLE_ROOT·单叶→根=叶
 *
 * 叶集从 GOLDEN_VECTORS 派生（链节 current_hash·真实 canonical hash），杜绝手抄哈希出错。
 *
 * 零容忍：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。错误码用 instanceof+窄断言收窄。
 */

import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GOLDEN_VECTORS } from '../../src/evidence_log/golden_vectors.ts';
import { PYTHON_SPAWN_TIMEOUT_MS, pythonSpawnFailureMessage } from '../_helpers/python.ts';
import {
  ZERO_MERKLE_ROOT,
  buildMerkleTree,
  computeMerkleInclusionProof,
  computeMerkleRoot,
  verifyMerkleInclusionProof,
} from '../../src/evidence_log/merkle_root.ts';

const REPRO_ROOT = new URL('../../', import.meta.url);

// Windows: 'python' (真实安装); Unix: 'python3'。WindowsApps python3 是 Store stub,
// 在 coverage 并发下 spawnSync 偶发 status=null。对齐 ensure_py_deps.mjs / smt_backend.ts 约定。
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

/**
 * Golden Merkle 叶集：GOLDEN_VECTORS 链节（跳过 meta_minimal_genesis fixture）的 current_hash。
 * 9 叶（奇数·末叶自复制凑偶·验证 duplicate-last 跨语言一致）。真实 canonical hash·杜绝手抄。
 */
const GOLDEN_LEAVES: readonly string[] = GOLDEN_VECTORS.slice(1).map(
  (vector) => vector.expectedHex,
);

function spawnPython(script: string, stdin: string, args: readonly string[] = []): string {
  const result = spawnSync(PYTHON_CMD, ['-c', script, ...args], {
    cwd: REPRO_ROOT,
    encoding: 'utf8',
    input: stdin,
    timeout: PYTHON_SPAWN_TIMEOUT_MS,
    env: { ...process.env, PYTHONPATH: 'repro' },
  });
  assert.equal(result.status, 0, pythonSpawnFailureMessage(result));
  return result.stdout.trim();
}

function pythonMerkleRoot(leaves: readonly string[]): string {
  const script =
    'from far_chain_repro.merkle_root import compute_merkle_root; import json,sys; ' +
    'print(compute_merkle_root(json.loads(sys.stdin.read())))';
  return spawnPython(script, JSON.stringify([...leaves]));
}

interface PythonProofShape {
  readonly siblings: string[];
  readonly expectedRoot: string;
  readonly leaf: string;
  readonly leafIndex: number;
}

function pythonMerkleProof(leaves: readonly string[], index: number): PythonProofShape {
  const script =
    'from far_chain_repro.merkle_root import compute_merkle_inclusion_proof as f; import json,sys; ' +
    'p=f(json.loads(sys.stdin.read()), int(sys.argv[1])); ' +
    'print(json.dumps({"siblings":p["siblings"],"expectedRoot":p["expectedRoot"],"leaf":p["leaf"],"leafIndex":p["leafIndex"]}))';
  const out = spawnPython(script, JSON.stringify([...leaves]), [String(index)]);
  return JSON.parse(out) as PythonProofShape;
}

test('TS Merkle root === Python root byte-for-byte (9 golden leaves · odd · duplicate-last)', () => {
  const tsRoot = computeMerkleRoot([...GOLDEN_LEAVES]);
  const pyRoot = pythonMerkleRoot(GOLDEN_LEAVES);
  assert.match(tsRoot, /^[0-9a-f]{64}$/);
  assert.equal(tsRoot, pyRoot, 'TS root must equal Python root (9-leaf golden set)');
});

test('TS Merkle root === Python root byte-for-byte (even leaf count)', () => {
  const evenLeaves = GOLDEN_LEAVES.slice(0, 4);
  const tsRoot = computeMerkleRoot([...evenLeaves]);
  const pyRoot = pythonMerkleRoot(evenLeaves);
  assert.equal(tsRoot, pyRoot, 'TS root must equal Python root (4-leaf even set)');
});

test('golden Merkle root is a stable cross-lang regression anchor', () => {
  const root = computeMerkleRoot([...GOLDEN_LEAVES]);
  assert.equal(root, pythonMerkleRoot(GOLDEN_LEAVES));
  assert.match(root, /^[0-9a-f]{64}$/);
});

test('TS inclusion proof siblings === Python siblings (byte-equal audit path, every index)', () => {
  const leaves = [...GOLDEN_LEAVES];
  for (const index of leaves.keys()) {
    const tsProof = computeMerkleInclusionProof(leaves, index);
    const pyProof = pythonMerkleProof(leaves, index);
    assert.deepEqual(tsProof.siblings, pyProof.siblings, `siblings differ at index ${index}`);
    assert.equal(tsProof.expectedRoot, pyProof.expectedRoot, `root differs at index ${index}`);
  }
});

test('TS and Python inclusion proofs both verify ok (cross-lang soundness)', () => {
  const leaves = [...GOLDEN_LEAVES];
  const tsProof = computeMerkleInclusionProof(leaves, 4);
  assert.equal(verifyMerkleInclusionProof(tsProof).ok, true, 'TS proof must verify');

  const pyVerifyScript =
    'from far_chain_repro.merkle_root import compute_merkle_inclusion_proof as f, verify_merkle_inclusion_proof as v; import json,sys; ' +
    'p=f(json.loads(sys.stdin.read()), int(sys.argv[1])); print(v(p)["ok"])';
  const pyOk = spawnPython(pyVerifyScript, JSON.stringify(leaves), ['4']);
  assert.equal(pyOk, 'True', 'Python proof must verify');
});

test('tampered expectedRoot → inclusion proof fails to verify (soundness)', () => {
  const leaves = [...GOLDEN_LEAVES];
  const proof = computeMerkleInclusionProof(leaves, 0);
  // 把 expectedRoot 换成另一子集的根 → 验证应失败
  const tamperedProof = { ...proof, expectedRoot: computeMerkleRoot(leaves.slice(0, 3)) };
  assert.equal(verifyMerkleInclusionProof(tamperedProof).ok, false, 'tampered root must fail verify');
});

test('tamper-evidence: flipping one leaf changes the root', () => {
  const base = computeMerkleRoot([...GOLDEN_LEAVES]);
  const tamperedLeaves = [...GOLDEN_LEAVES];
  const first = tamperedLeaves[0];
  if (first === undefined) throw new Error('test fixture: first leaf undefined');
  // 翻转首叶末位 hex（保持 64-hex 合法·仅改一字节）
  const lastChar = first.charAt(63);
  const flippedLast = lastChar === 'a' ? 'b' : 'a';
  tamperedLeaves[0] = first.slice(0, 63) + flippedLast;
  const tampered = computeMerkleRoot(tamperedLeaves);
  assert.notEqual(base, tampered, 'flipping one leaf must change the Merkle root');
});

test('edge: empty leaves → ZERO_MERKLE_ROOT', () => {
  assert.equal(computeMerkleRoot([]), ZERO_MERKLE_ROOT);
  assert.equal(buildMerkleTree([]).leafCount, 0);
});

test('edge: single leaf → root === leaf (empty siblings, verifies ok)', () => {
  const leaf = 'a'.repeat(64);
  assert.equal(computeMerkleRoot([leaf]), leaf);
  const proof = computeMerkleInclusionProof([leaf], 0);
  assert.equal(proof.siblings.length, 0, 'single-leaf proof has empty siblings');
  assert.equal(verifyMerkleInclusionProof(proof).ok, true);
});

test('invalid leaf (not 64-hex) → fail-fast code MERKLE_LEAF_INVALID', () => {
  assert.throws(
    () => computeMerkleRoot(['not-a-hex']),
    (err: unknown) =>
      err instanceof Error && (err as { code?: unknown }).code === 'MERKLE_LEAF_INVALID',
    'invalid leaf must fail-fast with code MERKLE_LEAF_INVALID',
  );
});
