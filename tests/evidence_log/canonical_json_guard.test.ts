/**
 * canonical_json_guard.test.ts — canonicalJson 非有限数 fail-closed 守卫(确定性不变量)。
 *
 * canonicalHash 是整个证据链/proof envelope 的确定性根基:若允许 NaN/Infinity,
 * JSON.stringify 在不同运行时/语言产生不同字节→链断裂/跨语言分歧。hasher.ts:44
 * assertNoNonFiniteNumber 对 NaN/±Infinity(含嵌套)fail-closed 抛错。此前零测覆盖
 * (cross_lang_consistency 测的是 TS↔Python 数值分歧红基线,非本守卫)。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, canonicalJson, hashCanonicalJson } from '../../src/evidence_log/hasher.ts';

test('canonicalJson: 顶层 NaN → fail-closed(确定性不变量)', () => {
  assert.throws(
    () => canonicalJson({ x: NaN }),
    /NaN and Infinity are not allowed in canonical JSON/,
    'NaN 须 fail-closed 抛错(防 JSON.stringify 不确定性)',
  );
});

test('canonicalJson: ±Infinity → fail-closed', () => {
  assert.throws(() => canonicalJson({ x: Infinity }), /NaN and Infinity are not allowed/);
  assert.throws(() => canonicalJson({ x: -Infinity }), /NaN and Infinity are not allowed/);
});

test('canonicalJson: 嵌套/数组内 NaN → fail-closed(递归检测)', () => {
  assert.throws(() => canonicalJson({ a: { b: NaN } }), /NaN and Infinity are not allowed/);
  assert.throws(() => canonicalJson({ list: [1, NaN, 3] }), /NaN and Infinity are not allowed/);
});

test('canonicalJson: 有限数正常序列化(回归基线)', () => {
  assert.equal(canonicalJson({ x: 1, y: 2.5 }), '{"x":1,"y":2.5}');
  assert.equal(canonicalJson({ x: 0 }), '{"x":0}');
  assert.equal(canonicalJson({ x: -1.5e10 }), '{"x":-15000000000}');
});

test('hashCanonicalJson: NaN 输入 → fail-closed(canonicalHash 链守卫一致)', () => {
  assert.throws(
    () => hashCanonicalJson({ x: NaN }),
    /NaN and Infinity are not allowed/,
    'hashCanonicalJson 经 canonicalJson,NaN 输入须同样 fail-closed',
  );
});

test('canonicalHash: empty-string prevHash is rejected (P1-B-1 mutation 缺口修复)', () => {
  // mutation_gate 存活位点：`prevHash === undefined || prevHash === ''`（or_to_and 变异后空串被放行）。
  // 契约：空串 prevHash 必须 fail-closed（空串 prevHash 会伪造链根/断链）。
  const cred = {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-30T00:00:00.000Z',
  };
  assert.throws(
    () =>
      canonicalHash({
        stageId: 'stage3_hypothesis',
        cred,
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: '',
      }),
    /prevHash is required/,
    'empty-string prevHash must be rejected',
  );
});