// tests/platform/release_build_manifest.test.ts
// REL-BUILD-001：构建 manifest 确定性/字节级 diff（EXPLAINED_ENV_DRIFT）/rebuild test
// /provenance receipt 锚定。真实 repo 输入，无 mock、无硬编码结果。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUILD_MANIFEST_SCHEMA,
  REFERENCE_BUILD_COMMANDS,
  buildArtifactTwice,
  buildProvenanceReceipt,
  canonicalJsonBytes,
  captureBuildEnvironment,
  compareBuildManifests,
  generateBuildManifest,
  type BuildManifest,
} from '../../src/release/build_manifest.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('REL-BUILD-001 manifest: 同输入同环境确定性（含 400+ 真实 .ts 输入 + 根三文件）', () => {
  const a = generateBuildManifest(REPO_ROOT, { generatedAt: '2026-08-17T00:00:00.000Z' });
  const b = generateBuildManifest(REPO_ROOT, { generatedAt: '2026-08-17T09:00:00.000Z' });
  assert.equal(a.schema, BUILD_MANIFEST_SCHEMA);
  assert.equal(a.manifestHash, b.manifestHash, 'generatedAt 不进哈希——同输入同环境必同哈希');
  assert.equal(a.env.nodeVersion, process.version);
  // 输入面：根三文件 + 全量 src ts（AGENTS.md 记 ~431 源文件——实测断言下界）
  const paths = a.inputs.map((i) => i.path);
  for (const required of ['package.json', 'pnpm-lock.yaml', 'tsconfig.json']) {
    assert.ok(paths.includes(required), `root input ${required} missing`);
  }
  assert.ok(a.inputs.length >= 400, `expected 400+ build inputs, got ${a.inputs.length}`);
  assert.ok(a.inputs.some((i) => i.path.startsWith('src/') && i.path.endsWith('.ts')));
  // 确定性排序 + posix 分隔 + 哈希形状
  assert.deepEqual([...paths], [...paths].sort(), 'inputs sorted');
  assert.ok(paths.every((p) => !p.includes('\\')), 'posix paths');
  assert.match(a.manifestHash, /^[0-9a-f]{64}$/);
  for (const input of a.inputs) {
    assert.match(input.sha256, /^[0-9a-f]{64}$/, `${input.path} sha256 shape`);
    assert.ok(input.bytes > 0);
  }
  assert.deepEqual([...a.commands], [...REFERENCE_BUILD_COMMANDS], '命令记录 = 参考构建命令');
});

test('REL-BUILD-001 diff: IDENTICAL / 输入变更三向 / 仅环境漂移 → EXPLAINED_ENV_DRIFT', () => {
  const base = generateBuildManifest(REPO_ROOT, { rootInputsOnly: true });
  const same = generateBuildManifest(REPO_ROOT, { rootInputsOnly: true });
  assert.equal(compareBuildManifests(base, same).status, 'IDENTICAL');

  // 改一个输入的哈希（篡改投影）→ INPUT_DIFF + 指名道姓
  const changedEntry = base.inputs[0];
  assert.ok(changedEntry !== undefined);
  const tampered: BuildManifest = {
    ...base,
    inputs: base.inputs.map((i, idx) => (idx === 0 ? { ...i, sha256: 'f'.repeat(64) } : i)),
    manifestHash: '0'.repeat(64),
  };
  const diff = compareBuildManifests(base, tampered);
  assert.equal(diff.status, 'INPUT_DIFF');
  assert.equal(diff.changedInputs.length, 1);
  assert.equal(diff.changedInputs[0]?.path, changedEntry.path);
  assert.notEqual(diff.changedInputs[0]?.bSha, changedEntry.sha256);

  // 新增/删除输入 → INPUT_DIFF（added/removed 检出）
  const withAdded: BuildManifest = { ...base, inputs: [...base.inputs, { path: 'zzz-new.ts', sha256: 'a'.repeat(64), bytes: 1 }] };
  const addedDiff = compareBuildManifests(base, withAdded);
  assert.equal(addedDiff.status, 'INPUT_DIFF');
  assert.deepEqual([...addedDiff.addedInputs], ['zzz-new.ts']);
  const removedDiff = compareBuildManifests(withAdded, base);
  assert.deepEqual([...removedDiff.removedInputs], ['zzz-new.ts']);

  // 仅环境漂移（CI vs 本地 node 版本不同）→ 输入全同 → EXPLAINED_ENV_DRIFT
  // platform 漂移值相对 base 构造：任何宿主平台上 a!==b 恒成立（ubuntu 上硬编码
  // 'linux' 会与本机 platform 相同，漂移不可见——环境依赖用例的移植性陷阱）。
  const driftedPlatform = base.env.platform === 'linux' ? 'win32' : 'linux';
  const envDrifted: BuildManifest = {
    ...base,
    env: { ...base.env, nodeVersion: 'v99.0.0', platform: driftedPlatform },
  };
  const envDiff = compareBuildManifests(base, envDrifted);
  assert.equal(envDiff.status, 'EXPLAINED_ENV_DRIFT');
  assert.equal(envDiff.changedInputs.length, 0);
  assert.ok(envDiff.envDrift.some((d) => d.field === 'nodeVersion' && d.b === 'v99.0.0'));
  assert.ok(envDiff.envDrift.some((d) => d.field === 'platform' && d.a !== d.b));
});

test('REL-BUILD-001 rebuild test: golden vector canonical 产物两次构建哈希一致（clean-build 代理）', () => {
  const result = buildArtifactTwice(REPO_ROOT);
  assert.equal(result.pass, true, JSON.stringify(result.runs.map((r) => r.sha256)));
  assert.equal(result.inputCaseCount, 15, 'GV-01..15 golden vectors');
  assert.equal(result.runs.length, 2);
  assert.notEqual(result.runs[0]?.dir, result.runs[1]?.dir, '两个独立临时目录');
  assert.match(result.runs[0]?.sha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(result.runs[0]?.sha256, result.runs[1]?.sha256);
  assert.ok(result.normalization.includes('canonical'), '规范化步骤诚实声明');
});

test('REL-BUILD-001 canonical 序列化: key 序无关字节稳定（嵌套对象亦然）', () => {
  const a = { b: 1, a: { z: [3, { y: 1, x: 2 }], w: null } };
  const b = JSON.parse(JSON.stringify({ a: { w: null, z: [3, { x: 2, y: 1 }] }, b: 1 })) as unknown;
  assert.equal(canonicalJsonBytes(a).toString('utf8'), canonicalJsonBytes(b).toString('utf8'));
});

test('REL-BUILD-001 provenance receipt: 锚定 manifestHash + 环境快照随行', () => {
  const manifest = generateBuildManifest(REPO_ROOT, { rootInputsOnly: true });
  const receipt = buildProvenanceReceipt(manifest);
  assert.equal(receipt.subject, 'far-lab-build');
  assert.equal(receipt.manifestHash, manifest.manifestHash);
  assert.equal(receipt.inputCount, manifest.inputs.length);
  assert.deepEqual(receipt.env, captureBuildEnvironment());
  // 锚定可复核：以 receipt.manifestHash 重放 compare → IDENTICAL
  const replay = generateBuildManifest(REPO_ROOT, { rootInputsOnly: true });
  assert.equal(compareBuildManifests(manifest, replay).status, 'IDENTICAL');
  assert.equal(replay.manifestHash, receipt.manifestHash, 'receipt 锚 = 重放 manifest 哈希');
});
